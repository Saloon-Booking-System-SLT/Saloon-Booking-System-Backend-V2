const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const TimeSlot = require("../models/TimeSlot");

// ✅ GET time slots for a specific professional and date
router.get("/", async (req, res) => {
  const { professionalId, date } = req.query;

  if (!professionalId || !date) {
    return res.status(400).json({ error: "Missing professionalId or date" });
  }

  try {
    let query = { date: date };
    
    // Handle "any" professionalId (fetch all professionals' slots for that date)
    if (professionalId && professionalId !== "any") {
      // Validate ObjectId before converting
      if (!mongoose.Types.ObjectId.isValid(professionalId)) {
        return res.status(400).json({ error: "Invalid professionalId format" });
      }
      query.professionalId = new mongoose.Types.ObjectId(professionalId);
    }
    // If professionalId is "any", we don't add it to query (returns all professionals' slots)

    const slots = await TimeSlot.find(query).lean(); // Added .lean() for performance
    return res.json(slots);
  } catch (err) {
    console.error("❌ Error fetching time slots:", err);
    return res.status(500).json({ 
      error: "Failed to fetch time slots",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ POST: Create a new time slot
router.post("/", async (req, res) => {
  const { salonId, professionalId, date, startTime, endTime } = req.body;

  if (!salonId || !professionalId || !date || !startTime || !endTime) {
    return res.status(400).json({
      error: "Missing required fields: salonId, professionalId, date, startTime, endTime",
    });
  }

  try {
    const newSlot = new TimeSlot({
      salonId,
      professionalId,
      date,
      startTime,
      endTime,
      isBooked: false,
    });

    await newSlot.save();
    return res.status(201).json(newSlot);
  } catch (err) {
    console.error("❌ Error creating time slot:", err);
    return res.status(500).json({ error: "Failed to create time slot" });
  }
});

// ✅ PATCH: Update isBooked status manually (optional feature)
router.patch("/:id/book", async (req, res) => {
  try {
    const { isBooked } = req.body;
    const updated = await TimeSlot.findByIdAndUpdate(
      req.params.id,
      { isBooked },
      { new: true }
    );
    res.json({ success: true, updated });
  } catch (err) {
    console.error("❌ Error updating time slot status:", err);
    res.status(500).json({ error: "Failed to update time slot" });
  }
});

module.exports = router;
