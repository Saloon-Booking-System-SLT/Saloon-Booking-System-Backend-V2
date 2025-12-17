const express = require('express');
const router = express.Router();
const { Loyalty, LoyaltyConfig } = require('../models/Loyalty');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { getPagination, getPaginationMeta } = require('../utils/queryOptimizer');

// GET: Global loyalty configuration
router.get('/config', async (req, res) => {
  try {
    const config = await LoyaltyConfig.find()
      .populate('salonId', 'name')
      .lean()
      .limit(100)
      .maxTimeMS(5000);
    res.json(config);
  } catch (err) {
    console.error('Loyalty config error:', err.message);
    res.status(500).json({ message: 'Failed to fetch loyalty configuration' });
  }
});

// POST: Update global loyalty configuration
router.post('/config', async (req, res) => {
  try {
    const { pointsThreshold, conversionRate } = req.body;
    
    const config = await LoyaltyConfig.findOneAndUpdate(
      { salonId: null },
      { pointsThreshold, conversionRate, isActive: true },
      { new: true, upsert: true }
    );
    
    res.json(config);
  } catch (err) {
    console.error('Loyalty config update error:', err.message);
    res.status(500).json({ message: 'Failed to update loyalty configuration' });
  }
});

// GET: Loyalty statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalPointsData, totalCustomers] = await Promise.all([
      Loyalty.aggregate([
        { $limit: 10000 },
        { $group: { _id: null, total: { $sum: '$points' } } }
      ]),
      Loyalty.countDocuments()
    ]);
    
    res.json({
      totalPointsIssued: totalPointsData[0]?.total || 0,
      totalCustomers,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Loyalty stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch loyalty statistics' });
  }
});

// GET: Most loyal customers (paginated)
router.get('/customers/top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit) || 10, 50);
    
    const topCustomers = await Loyalty.find()
      .select('userId points createdAt')
      .sort({ points: -1 })
      .limit(maxLimit)
      .lean()
      .maxTimeMS(10000);
    
    // Batch fetch user data for these loyalty records
    const userIds = topCustomers.map(l => l.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id name email')
      .lean()
      .maxTimeMS(5000);
    
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    // Map loyalty to user data
    const customersWithData = topCustomers.map(loyalty => {
      const user = userMap.get(loyalty.userId.toString());
      return {
        customer: user?.name || 'Unknown',
        email: user?.email || '',
        points: loyalty.points
      };
    });
    
    res.json({
      data: customersWithData,
      count: customersWithData.length
    });
  } catch (err) {
    console.error('Top customers error:', err.message);
    res.status(500).json({ message: 'Failed to fetch top customers' });
  }
});

// POST: Issue or revoke points
router.post('/points', async (req, res) => {
  try {
    const { email, points, action } = req.body; // action: 'issue' or 'revoke'
    
    // Find user by email
    const user = await User.findOne({ email });
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