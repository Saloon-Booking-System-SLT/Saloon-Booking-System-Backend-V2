const express = require('express');
const router = express.Router();
const Professional = require('../models/Professional');
const Feedback = require('../models/feedbackModel');

/**
 * GET /api/professionals/:salonId/with-ratings
 * Returns all professionals for a salon with their ratings in ONE call
 * Replaces multiple sequential API calls
 */
router.get('/:salonId/with-ratings', async (req, res) => {
  try {
    const { salonId } = req.params;
    console.log(`📊 Fetching professionals with ratings for salon: ${salonId}`);
    const startTime = Date.now();

    // Get all professionals for this salon
    const professionals = await Professional.find({ salonId })
      .lean();

    if (!professionals.length) {
      return res.json([]);
    }

    console.log(`✅ Found ${professionals.length} professionals`);

    // Get all feedback for these professionals in ONE query
    const professionalIds = professionals.map(p => p._id);
    const feedbacks = await Feedback.find({ 
      professionalId: { $in: professionalIds },
      status: 'approved'
    })
      .select('professionalId rating comment createdAt')
      .lean();

    console.log(`✅ Found ${feedbacks.length} feedbacks`);

    // Create a map of professionalId -> feedbacks array
    const feedbackMap = {};
    feedbacks.forEach(fb => {
      const proId = fb.professionalId.toString();
      if (!feedbackMap[proId]) {
        feedbackMap[proId] = [];
      }
      feedbackMap[proId].push(fb);
    });

    // Add ratings and review count to each professional
    const professionalsWithRatings = professionals.map(pro => {
      const proFeedbacks = feedbackMap[pro._id.toString()] || [];
      const avgRating = proFeedbacks.length > 0
        ? (proFeedbacks.reduce((sum, f) => sum + f.rating, 0) / proFeedbacks.length).toFixed(1)
        : '0';
      
      return {
        ...pro,
        avgRating: parseFloat(avgRating),
        reviewCount: proFeedbacks.length,
        feedbacks: proFeedbacks // Include feedbacks for "View Reviews" feature
      };
    });

    // Sort by rating (highest first)
    professionalsWithRatings.sort((a, b) => b.avgRating - a.avgRating);

    const endTime = Date.now();
    console.log(`⚡ Completed in ${endTime - startTime}ms`);

    res.json(professionalsWithRatings);

  } catch (error) {
    console.error('❌ Error fetching professionals with ratings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch professionals with ratings',
      error: error.message 
    });
  }
});

module.exports = router;
