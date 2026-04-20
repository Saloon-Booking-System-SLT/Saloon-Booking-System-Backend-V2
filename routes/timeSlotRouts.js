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
    const slots = await TimeSlot.find({
      professionalId: new mongoose.Types.ObjectId(professionalId),
      date: date,
    });

    return res.json(slots);
  } catch (err) {
 console.error(" Error fetching time slots:", err);
    return res.status(500).json({ error: "Failed to fetch time slots" });
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
 console.error(" Error creating time slot:", err);
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
 console.error(" Error updating time slot status:", err);
    res.status(500).json({ error: "Failed to update time slot" });
  }
});

// delete a specific time slot by ObjectId
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedSlot = await TimeSlot.findByIdAndDelete(
      new mongoose.Types.ObjectId(id)
    );

    if (!deletedSlot) {
      return res.status(404).json({ error: "Time slot not found" });
    }

    return res.json({deletedSlot});
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete time slot" });
  }
});

module.exports = router;
