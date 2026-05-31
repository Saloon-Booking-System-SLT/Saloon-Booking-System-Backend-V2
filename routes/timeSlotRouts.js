// routes/timeSlotRouts.js
// ─────────────────────────────────────────────────────────────────
// Dynamic slot generation — NO stored slots in DB.
// Slots are computed on-the-fly from existing Appointment records
// using the conflict engine. Salon open/close hours are respected.
//
// Endpoints:
//   GET /api/timeslots
//     ?professionalId=<id>   Required. Use "any" for any-professional mode.
//     &salonId=<id>          Required when professionalId="any" or to get salon hours.
//     &date=<YYYY-MM-DD>     Required.
//     &duration=<minutes>    Required. Integer minutes (e.g. 60).
// ─────────────────────────────────────────────────────────────────

const express      = require("express");
const mongoose     = require("mongoose");
const router       = express.Router();
const Appointment  = require("../models/Appointment");
const Professional = require("../models/Professional");
const Salon        = require("../models/Salon");
const {
  parseDurationMins,
  getAvailableSlots,
  getAvailableSlotsForAny,
} = require("../utils/conflictEngine");

// ────────────────────────────────────────────────────────────────
// GET /api/timeslots
// ────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { professionalId, salonId, date, duration } = req.query;

  // ── Validate required params ──────────────────────────────────
  if (!date) {
    return res.status(400).json({ error: "Missing required param: date (YYYY-MM-DD)" });
  }
  if (!duration) {
    return res.status(400).json({ error: "Missing required param: duration (minutes as integer)" });
  }
  if (!professionalId) {
    return res.status(400).json({ error: "Missing required param: professionalId (or 'any')" });
  }

  const durationMins = parseInt(duration, 10);
  if (isNaN(durationMins) || durationMins <= 0) {
    return res.status(400).json({ error: "duration must be a positive integer (minutes)" });
  }

  // ── Date format guard ─────────────────────────────────────────
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
  }

  try {
    // ── Resolve salon open/close hours ────────────────────────────
    let openTime  = "09:00";
    let closeTime = "20:00";
    let shortClosure = null;

    // Try to find salon — either from salonId param or from the professional's salonId
    let resolvedSalonId = salonId;

    if (!resolvedSalonId && professionalId !== "any" && mongoose.Types.ObjectId.isValid(professionalId)) {
      const pro = await Professional.findById(professionalId).select("salonId").lean();
      if (pro?.salonId) resolvedSalonId = String(pro.salonId);
    }

    if (resolvedSalonId && mongoose.Types.ObjectId.isValid(resolvedSalonId)) {
      const salon = await Salon.findById(resolvedSalonId).select("openTime closeTime closedDay temporaryClosures").lean();
      if (salon) {
        if (salon.openTime)  openTime  = salon.openTime;
        if (salon.closeTime) closeTime = salon.closeTime;

        // Check for temporary closures matching the date
        if (salon.temporaryClosures && salon.temporaryClosures.length > 0) {
          const matchingClosure = salon.temporaryClosures.find(closure => {
            return date >= closure.startDate && date <= closure.endDate;
          });

          if (matchingClosure) {
            if (matchingClosure.type === "full") {
              console.log(`ℹ️ [timeslots] Salon ${resolvedSalonId} has a full temporary closure on ${date} (${matchingClosure.reason || "Holiday"}). Returning empty slots.`);
              return res.json([]);
            } else if (matchingClosure.type === "short" && matchingClosure.startTime && matchingClosure.endTime) {
              console.log(`ℹ️ [timeslots] Salon ${resolvedSalonId} has a short temporary closure on ${date} from ${matchingClosure.startTime} to ${matchingClosure.endTime}.`);
              shortClosure = matchingClosure;
            }
          }
        }

        // Check if the salon is closed on this day of the week
        if (salon.closedDay && salon.closedDay.toLowerCase() !== "none") {
          const [year, month, day] = date.split("-").map(Number);
          const parsedDate = new Date(year, month - 1, day);
          const dayOfWeek = parsedDate.toLocaleDateString("en-US", { weekday: "long" });

          if (dayOfWeek.toLowerCase() === salon.closedDay.toLowerCase()) {
            console.log(`ℹ️ [timeslots] Salon ${resolvedSalonId} is closed on ${dayOfWeek}s. Returning empty slots.`);
            return res.json([]);
          }
        }
      }
    }

    // ── ANY PROFESSIONAL mode ─────────────────────────────────────
    if (professionalId === "any") {
      if (!salonId || !mongoose.Types.ObjectId.isValid(salonId)) {
        return res.status(400).json({
          error: "salonId is required when professionalId is 'any'"
        });
      }

      // Fetch all active professionals for this salon
      const professionals = await Professional.find({
        salonId: new mongoose.Types.ObjectId(salonId),
        available: true,
      }).select("_id name leaves").lean();

      if (!professionals.length) {
        return res.json([]); // No professionals available
      }

      // Fetch ALL appointments for this salon on this date
      const appointments = await Appointment.find({
        salonId: new mongoose.Types.ObjectId(salonId),
        date:    date,
        status:  { $in: ["pending", "confirmed", "rescheduled"] },
      }).select("professionalId date startTime endTime status").lean();

      // Convert matching leaves to virtual appointments
      professionals.forEach(pro => {
        if (pro.leaves && pro.leaves.length > 0) {
          pro.leaves.forEach(leave => {
            if (leave.date === date) {
              if (leave.type === "full") {
                appointments.push({
                  professionalId: pro._id,
                  date: date,
                  startTime: "00:00",
                  endTime: "23:59",
                  status: "confirmed",
                  isLeave: true,
                  reason: leave.reason || "Holiday"
                });
              } else if (leave.type === "short" && leave.startTime && leave.endTime) {
                appointments.push({
                  professionalId: pro._id,
                  date: date,
                  startTime: leave.startTime,
                  endTime: leave.endTime,
                  status: "confirmed",
                  isLeave: true,
                  reason: leave.reason || "Short Leave"
                });
              }
            }
          });
        }
      });

      // Inject temporary short closure for all professionals
      if (shortClosure) {
        professionals.forEach(pro => {
          appointments.push({
            professionalId: pro._id,
            date: date,
            startTime: shortClosure.startTime,
            endTime: shortClosure.endTime,
            status: "confirmed",
            isClosure: true,
            reason: shortClosure.reason || "Salon Temporary Closure"
          });
        });
      }

      const slots = getAvailableSlotsForAny(
        appointments,
        professionals,
        date,
        durationMins,
        openTime,
        closeTime
      );

      console.log(
        `✅ [timeslots] any-professional | salon=${salonId} | date=${date} | ` +
        `duration=${durationMins}min | pros=${professionals.length} | slots=${slots.length}`
      );

      return res.json(slots);
    }

    // ── SPECIFIC PROFESSIONAL mode ────────────────────────────────
    if (!mongoose.Types.ObjectId.isValid(professionalId)) {
      return res.status(400).json({ error: "professionalId must be a valid MongoDB ObjectId or 'any'" });
    }

    // Fetch existing appointments for this professional on this date
    const appointments = await Appointment.find({
      professionalId: new mongoose.Types.ObjectId(professionalId),
      date:           date,
      status:         { $in: ["pending", "confirmed", "rescheduled"] },
    }).select("professionalId date startTime endTime status").lean();

    // Fetch professional's leaves and add them as virtual appointments
    const pro = await Professional.findById(professionalId).select("leaves").lean();
    if (pro && pro.leaves && pro.leaves.length > 0) {
      pro.leaves.forEach(leave => {
        if (leave.date === date) {
          if (leave.type === "full") {
            appointments.push({
              professionalId: pro._id,
              date: date,
              startTime: "00:00",
              endTime: "23:59",
              status: "confirmed",
              isLeave: true,
              reason: leave.reason || "Holiday"
            });
          } else if (leave.type === "short" && leave.startTime && leave.endTime) {
            appointments.push({
              professionalId: pro._id,
              date: date,
              startTime: leave.startTime,
              endTime: leave.endTime,
              status: "confirmed",
              isLeave: true,
              reason: leave.reason || "Short Leave"
            });
          }
        }
      });
    }

    // Inject temporary short closure for this professional
    if (shortClosure) {
      appointments.push({
        professionalId: new mongoose.Types.ObjectId(professionalId),
        date: date,
        startTime: shortClosure.startTime,
        endTime: shortClosure.endTime,
        status: "confirmed",
        isClosure: true,
        reason: shortClosure.reason || "Salon Temporary Closure"
      });
    }

    const slots = getAvailableSlots(
      appointments,
      professionalId,
      date,
      durationMins,
      openTime,
      closeTime
    );

    console.log(
      `✅ [timeslots] pro=${professionalId} | date=${date} | ` +
      `duration=${durationMins}min | existing=${appointments.length} | slots=${slots.length}`
    );

    return res.json(slots);

  } catch (err) {
    console.error("❌ [timeslots] Error generating slots:", err);
    return res.status(500).json({ error: "Failed to generate time slots", detail: err.message });
  }
});

module.exports = router;
