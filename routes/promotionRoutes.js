const express = require('express');
const router = express.Router();
const Promotion = require('../models/Promotion');
const notificationService = require('../services/notificationService');
const User = require('../models/User');

// GET: All promotions
router.get('/', async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .populate('salonId', 'name')
      .sort({ createdAt: -1 });
    res.json(promotions);
  } catch (err) {
    console.error('Error fetching promotions:', err);
    res.status(500).json({ message: 'Failed to fetch promotions' });
  }
});

// GET: Promotions by salon
router.get('/salon/:salonId', async (req, res) => {
  try {
    const promotions = await Promotion.find({ salonId: req.params.salonId })
      .sort({ createdAt: -1 });
    res.json(promotions);
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
    const MAX_EMAILS = 1000; // Safety limit
    
    try {
      if (targetCustomers === 'all') {
        // Get customers in batches to save memory
        customerList = await User.find({ role: 'customer' })
          .select('name email')
          .lean()
          .limit(MAX_EMAILS)
          .maxTimeMS(10000);
          
      } else if (targetCustomers === 'recent') {
        // Get customers who booked in the last 6 months using aggregation
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const Appointment = require('../models/Appointment');
        const recentEmails = await Appointment.aggregate([
          { $match: { createdAt: { $gte: sixMonthsAgo } } },
          { $limit: MAX_EMAILS },
          { $group: { _id: '$user.email' } }
        ]);
        
        const emailList = recentEmails.map(a => a._id);
        customerList = await User.find({ 
          email: { $in: emailList },
          role: 'customer'
        }).select('name email')
          .lean()
          .maxTimeMS(10000);
          
      } else if (Array.isArray(targetCustomers)) {
        // Specific email list - cap at MAX_EMAILS
        customerList = await User.find({ 
          email: { $in: targetCustomers.slice(0, MAX_EMAILS) },
          role: 'customer'
        }).select('name email')
          .lean()
          .maxTimeMS(10000);
      }
    } catch (err) {
      console.error('Customer list fetch error:', err);
      return res.status(500).json({ message: 'Failed to fetch customer list' });
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