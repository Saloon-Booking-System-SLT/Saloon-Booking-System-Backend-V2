/**
 * Appointment Utility Functions
 * 
 * These functions handle time calculations for appointment booking.
 * Extracted from appointmentRoutes.js for better testability and reusability.
 */

/**
 * Converts a duration string like "1 hour 30 minutes" to total minutes
 * 
 * @param {string} durationStr - Duration string (e.g., "1 hour", "30 minutes", "1 hour 30 minutes")
 * @returns {number} Total minutes (defaults to 30 if invalid input)
 * 
 * @example
 * durationToMinutes("1 hour") // returns 60
 * durationToMinutes("30 minutes") // returns 30
 * durationToMinutes("1 hour 30 minutes") // returns 90
 * durationToMinutes("2 hours 15 minutes") // returns 135
 */
const durationToMinutes = (durationStr) => {
  if (!durationStr || typeof durationStr !== 'string') {
    console.warn("⚠️ Invalid duration string:", durationStr);
    return 30; // Default to 30 minutes
  }
  
  const parts = durationStr.split(" ");
  let minutes = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const val = parseInt(parts[i]);
    const unit = parts[i + 1]?.toLowerCase() || "";
    if (unit.includes("hour")) minutes += (isNaN(val) ? 0 : val) * 60;
    else if (unit.includes("min")) minutes += isNaN(val) ? 0 : val;
  }
  return minutes || 30; // Default to 30 minutes if calculation fails
};

/**
 * Calculates end time given a start time and duration in minutes
 * 
 * @param {string} startTime - Start time in "HH:mm" format (e.g., "09:00", "14:30")
 * @param {number} duration - Duration in minutes
 * @returns {string} End time in "HH:mm" format
 * 
 * @example
 * computeEndTime("09:00", 60) // returns "10:00"
 * computeEndTime("09:00", 90) // returns "10:30"
 * computeEndTime("23:00", 120) // returns "25:00" (handles overflow)
 */
const computeEndTime = (startTime, duration) => {
  const [h, m] = startTime.split(":").map(Number);
  const totalStart = h * 60 + m;
  const totalEnd = totalStart + duration;
  const endH = String(Math.floor(totalEnd / 60)).padStart(2, "0");
  const endM = String(totalEnd % 60).padStart(2, "0");
  return `${endH}:${endM}`;
};

/**
 * Validates if a time string is in correct HH:mm format
 * 
 * @param {string} timeStr - Time string to validate
 * @returns {boolean} True if valid format, false otherwise
 */
const isValidTimeFormat = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(timeStr);
};

/**
 * Checks if a given time slot conflicts with existing appointments
 * 
 * @param {string} newStart - New appointment start time (HH:mm)
 * @param {string} newEnd - New appointment end time (HH:mm)
 * @param {string} existingStart - Existing appointment start time (HH:mm)
 * @param {string} existingEnd - Existing appointment end time (HH:mm)
 * @returns {boolean} True if there is a conflict, false otherwise
 */
const hasTimeConflict = (newStart, newEnd, existingStart, existingEnd) => {
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  const newStartMin = toMinutes(newStart);
  const newEndMin = toMinutes(newEnd);
  const existStartMin = toMinutes(existingStart);
  const existEndMin = toMinutes(existingEnd);
  
  // Conflict if: newStart < existingEnd AND newEnd > existingStart
  return newStartMin < existEndMin && newEndMin > existStartMin;
};

module.exports = {
  durationToMinutes,
  computeEndTime,
  isValidTimeFormat,
  hasTimeConflict
};
