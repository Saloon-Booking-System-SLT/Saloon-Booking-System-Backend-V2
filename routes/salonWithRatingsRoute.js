const express = require('express');
const router = express.Router();
const Salon = require('../models/Salon');
const Professional = require('../models/Professional');
const Feedback = require('../models/feedbackModel');

/**
 * GET /api/salons/with-ratings
 * Returns all approved salons with their average ratings
 * This replaces 300+ frontend API calls with 1 optimized query
 */
router.get('/with-ratings', async (req, res) => {
  try {
    console.log('📊 Fetching salons with ratings...');
    const startTime = Date.now();

    // Get all approved salons
    const salons = await Salon.find({ approvalStatus: 'approved' })
      .select('-password')
      .lean();

    console.log(`✅ Found ${salons.length} salons`);

    // Get all professionals for these salons in one query
    const salonIds = salons.map(s => s._id);
    const professionals = await Professional.find({ 
      salonId: { $in: salonIds } 
    })
      .select('_id salonId')
      .lean();

    console.log(`✅ Found ${professionals.length} professionals`);

    // Get all feedback for these professionals in one query
    const professionalIds = professionals.map(p => p._id);
    const feedbacks = await Feedback.find({ 
      professionalId: { $in: professionalIds } 
    })
      .select('professionalId rating')
      .lean();

    console.log(`✅ Found ${feedbacks.length} feedbacks`);

    // Create a map of professionalId -> salonId
    const profToSalonMap = {};
    professionals.forEach(prof => {
      profToSalonMap[prof._id.toString()] = prof.salonId.toString();
    });

    // Create a map of salonId -> ratings array
    const salonRatingsMap = {};
    feedbacks.forEach(fb => {
      const salonId = profToSalonMap[fb.professionalId?.toString()];
      if (salonId) {
        if (!salonRatingsMap[salonId]) {
          salonRatingsMap[salonId] = [];
        }
        salonRatingsMap[salonId].push(fb.rating);
      }
    });

    // Calculate average rating for each salon
    const salonsWithRatings = salons.map(salon => {
      const ratings = salonRatingsMap[salon._id.toString()] || [];
      const avgRating = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
        : '0';
      
      return {
        ...salon,
        avgRating: parseFloat(avgRating),
        reviewCount: ratings.length
      };
    });

    // Sort by rating (highest first)
    salonsWithRatings.sort((a, b) => b.avgRating - a.avgRating);

    const endTime = Date.now();
    console.log(`⚡ Completed in ${endTime - startTime}ms`);

    res.json(salonsWithRatings);

  } catch (error) {
    console.error('❌ Error fetching salons with ratings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch salons with ratings',
      error: error.message 
    });
  }
});

module.exports = router;
