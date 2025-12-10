const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../utils/jwtUtils');
const { authenticateToken, requireCustomer } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');
const crypto = require('crypto');

// Google login - Save or return user with JWT
router.post('/google-login', async (req, res) => {
  const { name, email, photoURL } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Missing email' });
  }

  try {
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({ 
        name: name || 'Google User',
        email: email,
        photoURL: photoURL || '',
        role: 'customer'
      });
      await user.save();
    } else {
      // Update user data if they already exist
      user.name = name || user.name;
      user.photoURL = photoURL || user.photoURL;
      await user.save();
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email, // Make sure email is included
        photoURL: user.photoURL,
        role: user.role,
        phone: user.phone || '', // Ensure phone is included even if empty
        gender: user.gender || '',
        address: user.address || []
      }
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Phone login endpoint
router.post('/phone-login', async (req, res) => {
  const { phone, name } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  try {
    let user = await User.findOne({ phone });
    
    if (!user) {
      user = new User({ 
        name: name || 'OTP User',
        phone,
        role: 'customer'
      });
      await user.save();
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      phone: user.phone,
      role: user.role,
      name: user.name
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        email: user.email,
        photoURL: user.photoURL,
        gender: user.gender,
        address: user.address
      }
    });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get current user profile (protected)
router.get('/profile', authenticateToken, requireCustomer, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        photoURL: user.photoURL,
        gender: user.gender,
        ageCategory: user.ageCategory,
        address: user.address,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile (protected)
router.put('/:id', authenticateToken, requireCustomer, async (req, res) => {
  try {
    // Ensure user can only update their own profile
    if (req.params.id !== req.user.userId) {
      return res.status(403).json({ message: 'Can only update your own profile' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        photoURL: updatedUser.photoURL,
        gender: updatedUser.gender,
        ageCategory: updatedUser.ageCategory,
        address: updatedUser.address,
        role: updatedUser.role
      }
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Error updating user" });
  }
});

// Validate token endpoint
router.post('/validate-token', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    
    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();
    
    // Create reset URL (you'll need to update this with your frontend URL)
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    // Send reset email
    const emailResult = await notificationService.sendPasswordReset({
      customerEmail: user.email,
      customerName: user.name,
      resetToken,
      resetUrl
    });
    
    if (emailResult.success) {
      res.json({ message: 'Password reset email sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send reset email' });
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    
    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    
    // Update password (you might want to hash this depending on your User model)
    user.password = newPassword; // Add password hashing if needed
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send feedback request email
router.post('/send-feedback-request', authenticateToken, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    
    if (!appointmentId) {
      return res.status(400).json({ message: 'Appointment ID is required' });
    }
    
    // Find the appointment
    const Appointment = require('../models/Appointment');
    const appointment = await Appointment.findById(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Create feedback URL
    const feedbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/feedback?appointment=${appointmentId}`;
    
    // Send feedback request
    const result = await notificationService.sendFeedbackRequest({
      customerEmail: appointment.user.email,
      customerPhone: appointment.user.phone,
      customerName: appointment.user.name,
      salonName: appointment.salonName,
      serviceName: appointment.serviceName,
      appointmentDate: appointment.date,
      appointmentId,
      feedbackUrl
    });
    
    res.json({ 
      message: 'Feedback request sent',
      results: result
    });
    
  } catch (error) {
    console.error('Send feedback request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;