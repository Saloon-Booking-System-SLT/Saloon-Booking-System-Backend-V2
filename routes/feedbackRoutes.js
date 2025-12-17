const express = require("express");
const router = express.Router();
const Feedback = require("../models/feedbackModel.js"); 
const Professional = require("../models/Professional.js");
const { getPaginationParams, buildPaginatedResponse } = require("../utils/queryHelpers");

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
    }).lean();

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
    }).lean();

    res.json({ hasReviewed: !!existingFeedback });
  } catch (err) {
    console.error("Error checking feedback:", err);
    res.status(500).json({ message: "Failed to check feedback status" });
  }
});

// 📄 Get all feedbacks for a salon (Owner side) with pagination
router.get("/salon/:salonId", async (req, res) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const skip = (page - 1) * limit;
    
    const query = {
      salonId: req.params.salonId,
      status: 'approved' // ✅ Only show approved feedbacks to public
    };
    
    const [feedbacks, total] = await Promise.all([
      Feedback.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('professionalId', 'name')
        .lean(),
      Feedback.countDocuments(query)
    ]);
    
    const response = buildPaginatedResponse(feedbacks, total, page, limit);
    res.json(response);
  } catch (err) {
    console.error("Error fetching salon feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch salon feedbacks" });
  }
});

// GET: Fetch all feedbacks for a professional with pagination
router.get("/professionals/:professionalId", async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { page, limit } = getPaginationParams(req.query);
    const skip = (page - 1) * limit;

    // Find feedbacks with pagination
    const [feedbacks, total] = await Promise.all([
      Feedback.find({ professionalId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("professionalId", "name image role")
        .lean(),
      Feedback.countDocuments({ professionalId })
    ]);

    // Calculate average rating from all feedbacks (not just current page)
    const allRatings = await Feedback.find({ professionalId })
      .select('rating')
      .lean();
    
    const averageRating = allRatings.length
      ? allRatings.reduce((sum, f) => sum + f.rating, 0) / allRatings.length
      : 0;

    // ✅ Return paginated structure
    const response = buildPaginatedResponse(feedbacks, total, page, limit);
    res.json({
      ...response,
      averageRating
    });
  } catch (err) {
    console.error("Error fetching professional feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch professional feedbacks" });
  }
});

// GET: Fetch professionals for a salon with their feedbacks (optimized)
router.get("/with-feedbacks/:salonId", async (req, res) => {
  try {
    const { salonId } = req.params;

    // Fetch professionals for this salon with lean
    const professionals = await Professional.find({ salonId })
      .select('_id name image role') // Only select needed fields
      .limit(50) // Limit to prevent memory issues
      .lean();

    // Attach feedbacks to each professional with limits
    const professionalsWithFeedbacks = await Promise.all(
      professionals.map(async (pro) => {
        const feedbacks = await Feedback.find({ professionalId: pro._id })
          .sort({ createdAt: -1 })
          .limit(20) // Limit feedbacks per professional
          .lean();
          
        // Calculate average rating
        const averageRating = feedbacks.length > 0
          ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
          : null;

        return { ...pro, feedbacks, averageRating, feedbackCount: feedbacks.length };
      })
    );

    res.json(professionalsWithFeedbacks);
  } catch (err) {
    console.error("Error fetching professionals with feedbacks:", err);
    res.status(500).json({ message: "Failed to fetch professionals with feedbacks" });
  }
});

module.exports = router;