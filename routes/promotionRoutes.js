const express = require('express');
const router = express.Router();
const Promotion = require('../models/Promotion');
const notificationService = require('../services/notificationService');
const User = require('../models/User');
const { getPaginationParams, buildPaginatedResponse } = require('../utils/queryHelpers');

// GET: All promotions with pagination
router.get('/', async (req, res) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const skip = (page - 1) * limit;
    
    const [promotions, total] = await Promise.all([
      Promotion.find()
        .populate('salonId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Promotion.countDocuments()
    ]);
    
    const response = buildPaginatedResponse(promotions, total, page, limit);
    res.json(response);
  } catch (err) {
    console.error('Error fetching promotions:', err);
    res.status(500).json({ message: 'Failed to fetch promotions' });
  }
});

// GET: Promotions by salon with pagination
router.get('/salon/:salonId', async (req, res) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const skip = (page - 1) * limit;
    
    const query = { salonId: req.params.salonId };
    
    const [promotions, total] = await Promise.all([
      Promotion.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Promotion.countDocuments(query)
    ]);
    
    const response = buildPaginatedResponse(promotions, total, page, limit);
    res.json(response);
  } catch (err) {
    console.error('Error fetching salon promotions:', err);
    res.status(500).json({ message: 'Failed to fetch salon promotions' });
  }
});

// POST: Create promotion
router.post('/', async (req, res) => {
  try {
    const promotion = new Promotion(req.body);
    const saved = await promotion.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Error creating promotion:', err);
    res.status(500).json({ message: 'Failed to create promotion' });
  }
});

// PUT: Update promotion
router.put('/:id', async (req, res) => {
  try {
    const updated = await Promotion.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('Error updating promotion:', err);
    res.status(500).json({ message: 'Failed to update promotion' });
  }
});

// DELETE: Delete promotion
router.delete('/:id', async (req, res) => {
  try {
    await Promotion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Promotion deleted successfully' });
  } catch (err) {
    console.error('Error deleting promotion:', err);
    res.status(500).json({ message: 'Failed to delete promotion' });
  }
});

// POST: Send promotional emails to customers
router.post('/:id/send-emails', async (req, res) => {
  try {
    const promotionId = req.params.id;
    const { targetCustomers = 'all' } = req.body; // 'all', 'recent', or array of emails
    
    // Get promotion details
    const promotion = await Promotion.findById(promotionId)
      .populate('salonId', 'name');
    
    if (!promotion) {
      return res.status(404).json({ message: 'Promotion not found' });
    }
    
    let customerList = [];
    
    if (targetCustomers === 'all') {
      // Get all customers with limit to prevent memory issues
      customerList = await User.find({ role: 'customer' })
        .select('name email')
        .limit(500) // Limit to 500 customers at a time
        .lean();
    } else if (targetCustomers === 'recent') {
      // Get customers who booked in the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const Appointment = require('../models/Appointment');
      const recentAppointments = await Appointment.find({
        createdAt: { $gte: sixMonthsAgo }
      })
      .distinct('user.email')
      .limit(500); // Limit query results
      
      customerList = await User.find({ 
        email: { $in: recentAppointments },
        role: 'customer'
      })
      .select('name email')
      .lean();
    } else if (Array.isArray(targetCustomers)) {
      // Specific email list (limit to 100 at a time)
      const limitedEmails = targetCustomers.slice(0, 100);
      customerList = await User.find({ 
        email: { $in: limitedEmails },
        role: 'customer'
      })
      .select('name email')
      .lean();
    }
    
    if (customerList.length === 0) {
      return res.status(400).json({ message: 'No customers found to send emails to' });
    }
    
    // Prepare promotion data
    const promotionData = {
      promotionTitle: promotion.title,
      promotionDescription: promotion.description,
      discountPercentage: promotion.discountPercentage,
      validUntil: promotion.validUntil,
      salonName: promotion.salonId.name,
      promotionCode: promotion.code
    };
    
    // Send bulk emails
    const results = await notificationService.sendBulkPromotionalEmails(
      customerList,
      promotionData
    );
    
    // Update promotion with email stats
    promotion.emailsSent = (promotion.emailsSent || 0) + results.success;
    promotion.lastEmailSent = new Date();
    await promotion.save();
    
    res.json({
      message: 'Promotional emails sent',
      stats: {
        totalCustomers: customerList.length,
        successfulEmails: results.success,
        failedEmails: results.failed
      },
      results: results.results
    });
    
  } catch (err) {
    console.error('Error sending promotional emails:', err);
    res.status(500).json({ message: 'Failed to send promotional emails' });
  }
});

module.exports = router;