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

    // Try to find salon — either from salonId param or from the professional's salonId
    let resolvedSalonId = salonId;

    if (!resolvedSalonId && professionalId !== "any" && mongoose.Types.ObjectId.isValid(professionalId)) {
      const pro = await Professional.findById(professionalId).select("salonId").lean();
      if (pro?.salonId) resolvedSalonId = String(pro.salonId);
    }

    if (resolvedSalonId && mongoose.Types.ObjectId.isValid(resolvedSalonId)) {
      const salon = await Salon.findById(resolvedSalonId).select("openTime closeTime").lean();
      if (salon) {
        if (salon.openTime)  openTime  = salon.openTime;
        if (salon.closeTime) closeTime = salon.closeTime;
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
      }).select("_id name").lean();

      if (!professionals.length) {
        return res.json([]); // No professionals available
      }

      // Fetch ALL appointments for this salon on this date
      const appointments = await Appointment.find({
        salonId: new mongoose.Types.ObjectId(salonId),
        date:    date,
        status:  { $in: ["pending", "confirmed", "rescheduled"] },
      }).select("professionalId date startTime endTime status").lean();

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
