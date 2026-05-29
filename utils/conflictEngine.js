// utils/conflictEngine.js
// ─────────────────────────────────────────────────────────────────
// THE CORE OF THE BOOKING SYSTEM.
// All time-conflict decisions flow through this file.
// Pure functions — no side effects, no React/Express imports.
// Safe to unit-test in isolation.
//
// Based on TimeSlotsArchitecture/conflictEngine.js, extended with:
//   • Per-salon open/close hours (defaults: 09:00 – 20:00)
//   • "any professional" mode — picks first available professional
// ─────────────────────────────────────────────────────────────────

/** Default salon operating hours (24-hour minutes) */
const DEFAULT_OPEN_MINS  = 9 * 60;   // 09:00
const DEFAULT_CLOSE_MINS = 20 * 60;  // 20:00

/** Slot generation step in minutes (every 30 min = clean human-readable grid) */
const SLOT_STEP_MINS = 30;

// ── Time helpers ─────────────────────────────────────────────────

/**
 * Convert "HH:MM" string to total minutes since midnight.
 * @param {string} timeStr  e.g. "09:30"
 * @returns {number}        570
 */
function timeToMins(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Convert total minutes since midnight to "HH:MM" string.
 * @param {number} mins  e.g. 570
 * @returns {string}     "09:30"
 */
function minsToTime(mins) {
  const h   = Math.floor(mins / 60).toString().padStart(2, "0");
  const min = (mins % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * Parse a duration string like "30 minutes", "1 hour", "1 hour 30 minutes"
 * into a total number of minutes.
 * @param {string|number} duration
 * @returns {number} minutes (defaults to 30 on parse failure)
 */
function parseDurationMins(duration) {
  if (typeof duration === "number" && !isNaN(duration)) return duration;
  if (!duration) return 30;

  const str = String(duration).toLowerCase().trim();

  // Handle formats like "1h 30min", "1 hour 30 mins", "1h", "30 mins", "20min"
  const hourRegex = /(\d+)\s*(?:hour|hr|h)s?/g;
  const minRegex = /(\d+)\s*(?:min|m)s?/g;

  let totalMins = 0;

  // Extract hours
  let hourMatch;
  while ((hourMatch = hourRegex.exec(str)) !== null) {
    totalMins += parseInt(hourMatch[1], 10) * 60;
  }

  // Extract minutes
  let minMatch;
  while ((minMatch = minRegex.exec(str)) !== null) {
    totalMins += parseInt(minMatch[1], 10);
  }

  // Fallback: if no units were matched but a standalone number is present
  if (totalMins === 0) {
    const standaloneNum = parseInt(str.replace(/[^\d]/g, ""), 10);
    if (!isNaN(standaloneNum) && standaloneNum > 0) {
      if (str.includes("hour") || str.includes("h")) {
        return standaloneNum * 60;
      }
      return standaloneNum;
    }
  }

  return totalMins > 0 ? totalMins : 30;
}


// ── Conflict detection ────────────────────────────────────────────

/**
 * Determines whether a proposed time slot conflicts with any existing appointment.
 *
 * Uses the standard interval-overlap formula:
 *   OVERLAP when: newStart < existingEnd  AND  newEnd > existingStart
 *
 * Adjacent slots (back-to-back) are NOT considered conflicts.
 *
 * @param {Object[]} appointments  Existing appointment records from MongoDB
 * @param {string}   proId         Professional ID to check against
 * @param {string}   date          "YYYY-MM-DD"
 * @param {string}   startTime     Proposed start "HH:MM"
 * @param {number}   durationMins  Service duration in minutes
 * @returns {boolean}              true if conflict exists
 */
function isSlotConflicting(appointments, proId, date, startTime, durationMins) {
  const newStart = timeToMins(startTime);
  const newEnd   = newStart + durationMins;

  return appointments.some((appt) => {
    // Only check same professional on same date
    if (String(appt.professionalId) !== String(proId)) return false;
    if (appt.date !== date) return false;

    // Only check active appointments (not cancelled/rejected)
    const activeStatuses = ["pending", "confirmed", "rescheduled"];
    if (appt.status && !activeStatuses.includes(appt.status)) return false;

    const bStart = timeToMins(appt.startTime);
    const bEnd   = timeToMins(appt.endTime);

    // Interval overlap formula
    return newStart < bEnd && newEnd > bStart;
  });
}

// ── Slot generation ───────────────────────────────────────────────

/**
 * @typedef {Object} Slot
 * @property {string}  startTime    "HH:MM"
 * @property {string}  endTime      "HH:MM"
 * @property {boolean} conflicting  true = already booked, do not allow
 */

/**
 * Generate all possible time slots for a given professional / date / service,
 * each flagged with whether it conflicts with an existing appointment.
 *
 * Slots that would run past salon close time are excluded entirely.
 *
 * @param {Object[]} appointments  All appointments (will be filtered internally)
 * @param {string}   proId         Professional MongoDB ID string
 * @param {string}   date          "YYYY-MM-DD"
 * @param {number}   durationMins  Service duration in minutes
 * @param {string}   [openTime]    Salon open time "HH:MM" (default "09:00")
 * @param {string}   [closeTime]   Salon close time "HH:MM" (default "20:00")
 * @returns {Slot[]}
 */
function getAvailableSlots(appointments, proId, date, durationMins, openTime, closeTime) {
  const openMins  = openTime  ? timeToMins(openTime)  : DEFAULT_OPEN_MINS;
  const closeMins = closeTime ? timeToMins(closeTime) : DEFAULT_CLOSE_MINS;

  const slots = [];

  for (
    let t = openMins;
    t + durationMins <= closeMins;
    t += SLOT_STEP_MINS
  ) {
    const startTime   = minsToTime(t);
    const endTime     = minsToTime(t + durationMins);
    const conflicting = isSlotConflicting(appointments, proId, date, startTime, durationMins);

    slots.push({ startTime, endTime, conflicting });
  }

  return slots;
}

/**
 * For "Any Professional" mode — finds which professionals are available
 * for a given slot and returns the first available one.
 *
 * @param {Object[]} appointments  All appointments for that date
 * @param {string[]} proIds        Array of professional ID strings to check
 * @param {string}   date          "YYYY-MM-DD"
 * @param {string}   startTime     "HH:MM"
 * @param {number}   durationMins  Service duration in minutes
 * @returns {string|null}          First available professional ID, or null if all booked
 */
function findAvailableProfessional(appointments, proIds, date, startTime, durationMins) {
  for (const proId of proIds) {
    if (!isSlotConflicting(appointments, proId, date, startTime, durationMins)) {
      return proId;
    }
  }
  return null;
}

/**
 * Generate slots for "Any Professional" mode.
 * A slot is available if AT LEAST ONE professional in the list is free.
 * The `assignedProfessionalId` field on each available slot tells you
 * which professional would serve the client.
 *
 * @param {Object[]} appointments  All appointments for this salon+date
 * @param {Object[]} professionals Array of professional objects { _id, name, ... }
 * @param {string}   date          "YYYY-MM-DD"
 * @param {number}   durationMins  Service duration in minutes
 * @param {string}   [openTime]    "HH:MM"
 * @param {string}   [closeTime]   "HH:MM"
 * @returns {Slot[]}
 */
function getAvailableSlotsForAny(appointments, professionals, date, durationMins, openTime, closeTime) {
  const openMins  = openTime  ? timeToMins(openTime)  : DEFAULT_OPEN_MINS;
  const closeMins = closeTime ? timeToMins(closeTime) : DEFAULT_CLOSE_MINS;

  const proIds = professionals.map((p) => String(p._id));
  const slots  = [];

  for (
    let t = openMins;
    t + durationMins <= closeMins;
    t += SLOT_STEP_MINS
  ) {
    const startTime = minsToTime(t);
    const endTime   = minsToTime(t + durationMins);

    const availableProId = findAvailableProfessional(
      appointments, proIds, date, startTime, durationMins
    );

    slots.push({
      startTime,
      endTime,
      conflicting:            availableProId === null,
      assignedProfessionalId: availableProId, // null when all pros are busy
    });
  }

  return slots;
}

module.exports = {
  timeToMins,
  minsToTime,
  parseDurationMins,
  isSlotConflicting,
  getAvailableSlots,
  getAvailableSlotsForAny,
  findAvailableProfessional,
};
