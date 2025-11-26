const express = require("express");
const router = express.Router();
const Feedback = require("../models/feedbackModel.js"); 
const Professional = require("../models/Professional.js");

// 📥 Submit feedback (Customer side)
router.post("/", async (req, res) => {
  try {
    const { appointmentId, salonId, professionalId, userEmail, customerName, rating, comment } = req.body;

    // ✅ Validation
    if (!appointmentId || !salonId || !userEmail || !rating) {
      return res.status(400).json({ message: "Required fields are missing" });
    }

    // ✅ Check if user has already reviewed this appointment
    const existingFeedback = await Feedback.findOne({
      appointmentId,
      userEmail
    });

    if (existingFeedback) {
      return res.status(400).json({ message: "You have already submitted feedback for this appointment" });
    }

    // ✅ Create feedback document with status
    const feedback = new Feedback({
      appointmentId,
      salonId,
      professionalId,
      userEmail,
      customerName: customerName || 'Anonymous', // ✅ Save customer name
      rating,
      comment,
      status: 'pending' // ✅ Default to pending
    });

    // ✅ Save to DB
    const saved = await feedback.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ message: "Failed to submit feedback" });
  }
});

// 🔍 Check if user has already reviewed an appointment
router.get("/check/:appointmentId", async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingFeedback = await Feedback.findOne({
      appointmentId,
      userEmail: email
    });

    res.json({ hasReviewed: !!existingFeedback });
  } catch (err) {
    console.error("Error checking feedback:", err);
    res.status(500).json({ message: "Failed to check feedback status" });
  }
});

// 📄 Get all feedbacks for a salon (Owner side)
router.get("/salon/:salonId", async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ 
      salonId: req.params.salonId,
      status: 'approved' // ✅ Only show approved feedbacks to public
    })
      .sort({ createdAt: -1 }) // newest first
      .populate('professionalId', 'name');
    res.json(feedbacks);
  } catch (err) {
    console.error("Error fetching salon feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch salon feedbacks" });
  }
});

// GET: Fetch all feedbacks for a professional
router.get("/professionals/:professionalId", async (req, res) => {
  try {
    const { professionalId } = req.params;

    // Find feedbacks and populate professional details
    const feedbacks = await Feedback.find({ professionalId })
      .sort({ createdAt: -1 })
      .populate("professionalId", "name image role");

    // Calculate average rating
    const averageRating = feedbacks.length
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
      : 0;

    // ✅ Return consistent structure
    res.json({
      feedbacks,
      averageRating,
    });
  } catch (err) {
    console.error("Error fetching professional feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch professional feedbacks" });
  }
});

// GET: Fetch all professionals for a salon with their feedbacks
router.get("/with-feedbacks/:salonId", async (req, res) => {
  try {
    const { salonId } = req.params;

    // Fetch professionals for this salon
    const professionals = await Professional.find({ salonId }).lean(); // lean() returns plain JS objects

    // Attach feedbacks to each professional
    const professionalsWithFeedbacks = await Promise.all(
      professionals.map(async (pro) => {
        const feedbacks = await Feedback.find({ professionalId: pro._id }).sort({ createdAt: -1 });
        // Optional: calculate average rating
        const averageRating = feedbacks.length > 0
          ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
          : null;

        return { ...pro, feedbacks, averageRating };
      })
    );

    res.json(professionalsWithFeedbacks);
  } catch (err) {
    console.error("Error fetching professionals with feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch professionals with feedbacks" });
  }
});

module.exports = router;