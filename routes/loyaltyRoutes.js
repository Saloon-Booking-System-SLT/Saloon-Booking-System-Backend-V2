const express = require('express');
const router = express.Router();
const { Loyalty, LoyaltyConfig } = require('../models/Loyalty');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { getPaginationParams, buildPaginatedResponse } = require('../utils/queryHelpers');

// GET: Global loyalty configuration
router.get('/config', async (req, res) => {
  try {
    const config = await LoyaltyConfig.find()
      .populate('salonId', 'name')
      .lean();
    res.json(config);
  } catch (err) {
    console.error('Error fetching loyalty config:', err);
    res.status(500).json({ message: 'Failed to fetch loyalty configuration' });
  }
});

// POST: Update global loyalty configuration
router.post('/config', async (req, res) => {
  try {
    const { pointsThreshold, conversionRate } = req.body;
    
    // Update all salon configs or create global config
    const config = await LoyaltyConfig.findOneAndUpdate(
      { salonId: null },
      { pointsThreshold, conversionRate, isActive: true },
      { new: true, upsert: true }
    );
    
    res.json(config);
  } catch (err) {
    console.error('Error updating loyalty config:', err);
    res.status(500).json({ message: 'Failed to update loyalty configuration' });
  }
});

// GET: Loyalty statistics
router.get('/stats', async (req, res) => {
  try {
    const totalPoints = await Loyalty.aggregate([
      { $group: { _id: null, total: { $sum: '$points' } } },
      { $limit: 1 } // Only need one result
    ]);
    
    const totalCustomers = await Loyalty.countDocuments();
    
    res.json({
      totalPointsIssued: totalPoints[0]?.total || 0,
      totalCustomers
    });
  } catch (err) {
    console.error('Error fetching loyalty stats:', err);
    res.status(500).json({ message: 'Failed to fetch loyalty statistics' });
  }
});

// GET: Most loyal customers
router.get('/customers/top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const topLimit = Math.min(parseInt(limit) || 10, 50); // Max 50
    
    const topCustomers = await Loyalty.find()
      .sort({ points: -1 })
      .limit(topLimit)
      .populate('userId', 'name email')
      .lean();
    
    // Get last visit for each customer
    const customersWithVisits = await Promise.all(
      topCustomers.map(async (loyalty) => {
        const lastAppointment = await Appointment.findOne({
          'user.email': loyalty.userId?.email
        })
        .select('date')
        .sort({ date: -1 })
        .lean();
        
        return {
          customer: loyalty.userId?.name || 'Unknown',
          email: loyalty.userId?.email || '',
          points: loyalty.points,
          lastVisit: lastAppointment?.date || null
        };
      })
    );
    
    res.json(customersWithVisits);
  } catch (err) {
    console.error('Error fetching top customers:', err);
    res.status(500).json({ message: 'Failed to fetch top customers' });
  }
});

// POST: Issue or revoke points
router.post('/points', async (req, res) => {
  try {
    const { email, points, action } = req.body; // action: 'issue' or 'revoke'
    
    // Find user by email
    const user = await User.findOne({ email })
      .select('_id')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    // Find or create loyalty record
    let loyalty = await Loyalty.findOne({ userId: user._id });
    
    if (!loyalty) {
      loyalty = new Loyalty({ userId: user._id, points: 0 });
    }
    
    // Update points
    if (action === 'issue') {
      loyalty.points += points;
    } else if (action === 'revoke') {
      loyalty.points = Math.max(0, loyalty.points - points);
    }
    
    loyalty.lastUpdated = new Date();
    await loyalty.save();
    
    res.json({
      success: true,
      message: `Successfully ${action}d ${points} points`,
      loyalty
    });
  } catch (err) {
    console.error('Error managing points:', err);
    res.status(500).json({ message: 'Failed to manage points' });
  }
});

// GET: Salon-specific loyalty settings
router.get('/salon/:salonId', async (req, res) => {
  try {
    const config = await LoyaltyConfig.findOne({ salonId: req.params.salonId });
    res.json(config || { pointsThreshold: 100, conversionRate: 10, isActive: true });
  } catch (err) {
    console.error('Error fetching salon loyalty config:', err);
    res.status(500).json({ message: 'Failed to fetch salon loyalty configuration' });
  }
});

// PUT: Update salon loyalty settings
router.put('/salon/:salonId', async (req, res) => {
  try {
    const { pointsThreshold, conversionRate, isActive } = req.body;
    
    const config = await LoyaltyConfig.findOneAndUpdate(
      { salonId: req.params.salonId },
      { pointsThreshold, conversionRate, isActive },
      { new: true, upsert: true }
    );
    
    res.json(config);
  } catch (err) {
    console.error('Error updating salon loyalty config:', err);
    res.status(500).json({ message: 'Failed to update salon loyalty configuration' });
  }
});

module.exports = router;