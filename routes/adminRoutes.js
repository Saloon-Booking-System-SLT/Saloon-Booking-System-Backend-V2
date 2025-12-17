const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Salon = require('../models/Salon');
const Professional = require('../models/Professional');
const Feedback = require('../models/feedbackModel');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwtUtils');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');
const { 
  optimizeAggregationPipeline, 
  getPagination, 
  getPaginationMeta,
  countSafe,
  findPaginated
} = require('../utils/queryOptimizer');

// Admin Login with JWT tokens
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Hardcoded admin credentials
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'admin123';
  
  try {
    // Validate credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Generate JWT token for admin
      const token = generateToken({
        userId: 'admin', // You can use a specific ID or just 'admin'
        username: ADMIN_USERNAME,
        role: 'admin'
      });

      return res.json({ 
        success: true, 
        message: 'Login successful',
        token,
        admin: {
          id: 'admin',
          username: ADMIN_USERNAME,
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// GET: Dashboard Statistics (Protected - Admin only) - Memory Optimized
router.get('/dashboard/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Use countDocuments for counts only (no full documents loaded)
    const [totalSalons, totalCustomers, totalAppointments, totalEmployees, pendingApprovals] = await Promise.all([
      countSafe(Salon, {}),
      countSafe(User, { role: 'customer' }),
      countSafe(Appointment, {}),
      countSafe(Professional, {}),
      countSafe(Salon, { approvalStatus: 'pending' })
    ]);
    
    // Get latest bookings with only needed fields
    const latestBookings = await Appointment.find()
      .select('salonId date time status services')
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('salonId', 'name')
      .lean();
    
    // Get latest cancellations with only needed fields
    const latestCancellations = await Appointment.find({ status: 'cancelled' })
      .select('salonId date time updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('salonId', 'name')
      .lean();
    
    // Calculate revenue using optimized aggregation
    let totalRevenue = 0;
    try {
      const revenueData = await Appointment.aggregate([
        { $match: { status: 'completed' } },
        { $limit: 10000 }, // Limit before group
        { $unwind: '$services' },
        { $group: { _id: null, total: { $sum: '$services.price' } } }
      ]);
      totalRevenue = revenueData[0]?.total || 0;
    } catch (err) {
      console.error('Revenue calculation error:', err.message);
    }
    
    // Pending payments using optimized aggregation
    let pendingPayments = 0;
    try {
      const pendingData = await Appointment.aggregate([
        { $match: { status: 'pending' } },
        { $limit: 10000 },
        { $unwind: '$services' },
        { $group: { _id: null, total: { $sum: '$services.price' } } }
      ]);
      pendingPayments = pendingData[0]?.total || 0;
    } catch (err) {
      console.error('Pending payments error:', err.message);
    }
    
    // Monthly data for charts
    let monthlyData = [];
    try {
      monthlyData = await Appointment.aggregate([
        { $match: { status: 'completed' } },
        { $limit: 1000 }, // Cap results before processing
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: { $toDate: '$date' } } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (err) {
      console.error('Monthly data error:', err.message);
    }
    
    res.json({
      totalSalons,
      totalCustomers,
      totalAppointments,
      totalEmployees,
      pendingApprovals,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      latestBookings: latestBookings.slice(0, 5), // Return only 5 latest
      latestCancellations: latestCancellations.slice(0, 5),
      monthlyData
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// GET: Paginated salons list (Protected - Admin only)
router.get('/salons', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await findPaginated(Salon, {}, req.query, 'name email location approvalStatus');
    res.json(result);
  } catch (err) {
    console.error('Admin salons list error:', err);
    res.status(500).json({ message: 'Failed to fetch salons' });
  }
});

// GET: Paginated customers list (Protected - Admin only)
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await findPaginated(User, { role: 'customer' }, req.query, 'name email phone createdAt');
    res.json(result);
  } catch (err) {
    console.error('Admin customers list error:', err);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

// GET: Paginated appointments (Protected - Admin only)
router.get('/appointments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [data, total] = await Promise.all([
      Appointment.find()
        .select('salonId date time status services')
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(10000),
      countSafe(Appointment, {})
    ]);
    
    res.json({
      data,
      pagination: getPaginationMeta(total, page, limit)
    });
  } catch (err) {
    console.error('Admin appointments error:', err);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
});
      pendingApprovals,
      latestBookings,
      latestCancellations,
      totalRevenue,
      pendingPayments,
      monthlyData,
      alerts: [
        { 
          id: 1, 
          type: 'Warning', 
          details: `${pendingApprovals} pending salon approvals`, 
          action: 'Review' 
        }
      ]
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

// GET: All appointments across all salons (Protected - Admin only)
router.get('/appointments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    const query = date ? { date } : {};
    
    const appointments = await Appointment.find(query)
      .sort({ date: -1, startTime: -1 })
      .populate('salonId', 'name')
      .populate('professionalId', 'name');
    
    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
});

// PATCH: Update appointment status (Protected - Admin only)
router.patch('/appointments/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    res.json(updated);
  } catch (err) {
    console.error('Error updating appointment status:', err);
    res.status(500).json({ message: 'Failed to update appointment status' });
  }
});

// GET: All customers with statistics (Protected - Admin only)
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().lean();
    
    // Get booking stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const bookings = await Appointment.countDocuments({ 'user.email': user.email });
        const appointments = await Appointment.find({ 'user.email': user.email });
        
        const totalSpent = appointments.reduce((sum, apt) => {
          return sum + (apt.services?.[0]?.price || 0);
        }, 0);
        
        const lastBooking = appointments.length > 0 
          ? appointments.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date
          : null;
        
        return {
          ...user,
          bookings,
          totalSpent,
          avgSpend: bookings > 0 ? totalSpent / bookings : 0,
          lastBooking,
          isRegistered: true
        };
      })
    );
    
    res.json(usersWithStats);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

// GET: All feedbacks across all salons (Protected - Admin only)
router.get('/feedbacks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .sort({ createdAt: -1 })
      .populate('salonId', 'name location')
      .populate('professionalId', 'name')
      .lean(); // Convert to plain JavaScript objects
    
    // Transform data to match frontend expectations
    const transformedFeedbacks = feedbacks.map(feedback => ({
      _id: feedback._id,
      status: feedback.status || 'pending',
      rating: feedback.rating,
      comment: feedback.comment || '',
      review: feedback.comment || '', // Alias for comment
      customerName: feedback.customerName || 'Anonymous',
      userEmail: feedback.userEmail,
      salonId: feedback.salonId,
      professionalId: feedback.professionalId,
      createdAt: feedback.createdAt,
      appointmentId: feedback.appointmentId
    }));
    
    res.json(transformedFeedbacks);
  } catch (err) {
    console.error('Error fetching feedbacks:', err);
    res.status(500).json({ message: 'Failed to fetch feedbacks' });
  }
});

// PATCH: Update feedback status (approve/reject) (Protected - Admin only)
router.patch('/feedbacks/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Feedback.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!updated) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    
    res.json(updated);
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ message: 'Failed to update feedback' });
  }
});

// GET: Admin profile (Protected - Admin only)
router.get('/profile', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json({
      admin: {
        id: req.user.userId,
        username: req.user.username,
        role: req.user.role
      }
    });
  } catch (err) {
    console.error('Error fetching admin profile:', err);
    res.status(500).json({ message: 'Failed to fetch admin profile' });
  }
});

// Admin route to manually trigger email notifications
router.post('/notifications/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.body; // 'reminders', 'feedback', or 'both'
    const cronJobManager = require('../utils/cronJobs');
    const results = {};

    if (type === 'reminders' || type === 'both') {
      console.log('📧 Admin triggered daily reminders...');
      results.reminders = await cronJobManager.triggerDailyReminders();
    }

    if (type === 'feedback' || type === 'both') {
      console.log('📝 Admin triggered feedback requests...');
      results.feedback = await cronJobManager.triggerFeedbackRequests();
    }

    res.json({
      message: 'Email notifications triggered successfully',
      results
    });

  } catch (error) {
    console.error('Error triggering notifications:', error);
    res.status(500).json({ 
      message: 'Failed to trigger notifications',
      error: error.message 
    });
  }
});

// Get cron job status
router.get('/notifications/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const cronJobManager = require('../utils/cronJobs');
    const status = cronJobManager.getJobStatus();
    
    res.json({
      cronJobs: status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting notification status:', error);
    res.status(500).json({ message: 'Failed to get notification status' });
  }
});

// GET: All salons with their approval status (Protected - Admin only)
router.get('/salons', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query; // Can filter by status: pending, approved, rejected
    const query = status ? { approvalStatus: status } : {};
    
    const salons = await Salon.find(query)
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(salons);
  } catch (err) {
    console.error('Error fetching salons:', err);
    res.status(500).json({ message: 'Failed to fetch salons' });
  }
});

// PATCH: Approve a salon (Protected - Admin only)
router.patch('/salons/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const salon = await Salon.findByIdAndUpdate(
      req.params.id,
      { 
        approvalStatus: 'approved',
        rejectionReason: null
      },
      { new: true }
    ).select('-password');
    
    if (!salon) {
      return res.status(404).json({ message: 'Salon not found' });
    }
    
    // Send approval notification email
    try {
      console.log(`📧 Sending approval notification for salon: ${salon.name}`);
      const emailResult = await notificationService.sendSalonApprovalNotification({
        salonName: salon.name,
        ownerEmail: salon.email
      });
      
      if (emailResult.success) {
        console.log(`✅ Approval email sent successfully to ${salon.email}`);
      } else {
        console.error(`❌ Failed to send approval email to ${salon.email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error(`❌ Error sending approval email:`, emailError.message);
      // Don't fail the approval if email fails
    }
    
    res.json({ 
      message: 'Salon approved successfully',
      salon 
    });
  } catch (err) {
    console.error('Error approving salon:', err);
    res.status(500).json({ message: 'Failed to approve salon' });
  }
});

// PATCH: Reject a salon (Protected - Admin only)
router.patch('/salons/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const salon = await Salon.findByIdAndUpdate(
      req.params.id,
      { 
        approvalStatus: 'rejected',
        rejectionReason: reason || 'No reason provided'
      },
      { new: true }
    ).select('-password');
    
    if (!salon) {
      return res.status(404).json({ message: 'Salon not found' });
    }
    
    // Send rejection notification email
    try {
      console.log(`📧 Sending rejection notification for salon: ${salon.name}`);
      const emailResult = await notificationService.sendSalonRejectionNotification({
        salonName: salon.name,
        ownerEmail: salon.email,
        rejectionReason: salon.rejectionReason
      });
      
      if (emailResult.success) {
        console.log(`✅ Rejection email sent successfully to ${salon.email}`);
      } else {
        console.error(`❌ Failed to send rejection email to ${salon.email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error(`❌ Error sending rejection email:`, emailError.message);
      // Don't fail the rejection if email fails
    }
    
    res.json({ 
      message: 'Salon rejected successfully',
      salon 
    });
  } catch (err) {
    console.error('Error rejecting salon:', err);
    res.status(500).json({ message: 'Failed to reject salon' });
  }
});

module.exports = router;