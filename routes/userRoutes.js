const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../utils/jwtUtils');
const { authenticateToken, requireCustomer } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');
const crypto = require('crypto');

// Email/Password Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email, and password are required' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        { phone: phone || '' }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          success: false,
          message: 'Email is already registered' 
        });
      }
      if (phone && existingUser.phone === phone) {
        return res.status(400).json({ 
          success: false,
          message: 'Phone number is already registered' 
        });
      }
    }

    // Create new user
    const user = new User({
      name,
      email,
      phone: phone || '',
      password,
      authMethod: 'email',
      role: 'customer',
      emailVerified: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    // Send verification email (optional)
    if (process.env.SEND_VERIFICATION_EMAIL === 'true') {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
      
      await notificationService.sendVerificationEmail({
        customerEmail: user.email,
        customerName: user.name,
        verificationUrl
      });
    }

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        photoURL: user.photoURL || '',
        role: user.role,
        gender: user.gender || '',
        address: user.address || [],
        favorites: user.favorites || [],
        emailVerified: user.emailVerified,
        authMethod: user.authMethod,
        createdAt: user.createdAt
      },
      message: 'Registration successful. Please check your email for verification.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false,
        message: `${field === 'email' ? 'Email' : 'Phone number'} is already registered` 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Email/Password Login
router.post('/email-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if user registered with email/password
    if (user.authMethod !== 'email') {
      return res.status(401).json({ 
        success: false,
        message: `Account was created with ${user.authMethod}. Please use ${user.authMethod === 'google' ? 'Google Sign-In' : 'the original sign-in method'}.` 
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Account is deactivated. Please contact support.' 
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        photoURL: user.photoURL || '',
        role: user.role,
        gender: user.gender || '',
        address: user.address || [],
        favorites: user.favorites || [],
        emailVerified: user.emailVerified,
        authMethod: user.authMethod,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Email login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Google login - Save or return user with JWT
router.post('/google-login', async (req, res) => {
  const { name, email, photoURL } = req.body;

  if (!email) {
    return res.status(400).json({ 
      success: false,
      message: 'Missing email' 
    });
  }

  try {
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({ 
        name: name || 'Google User',
        email: email,
        photoURL: photoURL || '',
        authMethod: 'google',
        role: 'customer',
        emailVerified: true,
        isActive: true
      });
      await user.save();
    } else {
      // Update user data if they already exist
      if (user.authMethod !== 'google' && user.password) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered with password. Please use email/password login.'
        });
      }
      
      user.name = name || user.name;
      user.photoURL = photoURL || user.photoURL;
      user.authMethod = 'google';
      user.lastLogin = new Date();
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
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
        phone: user.phone || '',
        gender: user.gender || '',
        address: user.address || [],
        favorites: user.favorites || [],
        emailVerified: user.emailVerified,
        authMethod: user.authMethod,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Phone login endpoint
router.post('/phone-login', async (req, res) => {
  const { phone, name } = req.body;

  if (!phone) {
    return res.status(400).json({ 
      success: false,
      message: 'Phone number is required' 
    });
  }

  try {
    let user = await User.findOne({ phone });
    
    if (!user) {
      user = new User({ 
        name: name || 'OTP User',
        phone,
        authMethod: 'phone',
        role: 'customer',
        isActive: true
      });
      await user.save();
    } else {
      user.lastLogin = new Date();
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
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        email: user.email || '',
        photoURL: user.photoURL || '',
        gender: user.gender || '',
        address: user.address || [],
        favorites: user.favorites || [],
        authMethod: user.authMethod,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get current user profile (protected)
router.get('/profile', authenticateToken, requireCustomer, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        photoURL: user.photoURL || '',
        gender: user.gender || '',
        address: user.address || [],
        role: user.role,
        favorites: user.favorites || [],
        emailVerified: user.emailVerified,
        authMethod: user.authMethod,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update user profile (protected)
router.put('/:id', authenticateToken, requireCustomer, async (req, res) => {
  try {
    // Ensure user can only update their own profile
    if (req.params.id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Can only update your own profile' 
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        photoURL: updatedUser.photoURL || '',
        gender: updatedUser.gender || '',
        address: updatedUser.address || [],
        role: updatedUser.role,
        favorites: updatedUser.favorites || [],
        emailVerified: updatedUser.emailVerified,
        authMethod: updatedUser.authMethod,
        lastLogin: updatedUser.lastLogin,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      },
      message: 'Profile updated successfully'
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ 
      success: false,
      message: "Error updating user",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Change password (protected)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Current and new passwords are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 6 characters long' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if user has a password (some users might have signed up with Google/Phone)
    if (!user.password) {
      return res.status(400).json({ 
        success: false,
        message: 'Account was created with OAuth. Please use the original sign-in method.' 
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ 
      success: true,
      message: 'Password updated successfully' 
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error updating password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true,
        message: 'If the email exists, a reset link has been sent' 
      });
    }
    
    // Check if user registered with email/password
    if (user.authMethod !== 'email') {
      return res.status(400).json({ 
        success: false,
        message: `Account was created with ${user.authMethod}. Please use ${user.authMethod === 'google' ? 'Google Sign-In' : 'the original sign-in method'}.` 
      });
    }
    
    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();
    
    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    // Send reset email
    const emailResult = await notificationService.sendPasswordReset({
      customerEmail: user.email,
      customerName: user.name,
      resetToken,
      resetUrl
    });
    
    if (emailResult.success) {
      res.json({ 
        success: true,
        message: 'Password reset email sent successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: 'Failed to send reset email' 
      });
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Token and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 6 characters long' 
      });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset token' 
      });
    }
    
    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.lastLogin = new Date();
    await user.save();
    
    // Generate new token for auto-login
    const newToken = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    });
    
    res.json({ 
      success: true,
      message: 'Password reset successfully',
      token: newToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: 'Token is required' 
      });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find user with valid verification token
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired verification token' 
      });
    }
    
    // Verify email
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    
    res.json({ 
      success: true,
      message: 'Email verified successfully' 
    });
    
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Validate token endpoint
router.post('/validate-token', authenticateToken, (req, res) => {
  res.json({
    success: true,
    valid: true,
    user: req.user
  });
});

// Send feedback request email
router.post('/send-feedback-request', authenticateToken, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    
    if (!appointmentId) {
      return res.status(400).json({ 
        success: false,
        message: 'Appointment ID is required' 
      });
    }
    
    // Find the appointment
    const Appointment = require('../models/Appointment');
    const appointment = await Appointment.findById(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ 
        success: false,
        message: 'Appointment not found' 
      });
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
      success: true,
      message: 'Feedback request sent',
      results: result
    });
    
  } catch (error) {
    console.error('Send feedback request error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's favorite salons
router.get('/favorites', authenticateToken, requireCustomer, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('favorites');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({ 
      success: true,
      favorites: user.favorites 
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add salon to favorites
router.post('/favorites/:salonId', authenticateToken, requireCustomer, async (req, res) => {
  try {
    const { salonId } = req.params;
    const userId = req.user.userId;

    // Check if salon exists
    const Salon = require('../models/Salon');
    const salon = await Salon.findById(salonId);
    if (!salon) {
      return res.status(404).json({ 
        success: false,
        message: 'Salon not found' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if salon is already in favorites
    if (user.favorites.includes(salonId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Salon already in favorites' 
      });
    }

    // Add to favorites
    user.favorites.push(salonId);
    await user.save();

    res.json({ 
      success: true,
      message: 'Salon added to favorites', 
      favorites: user.favorites 
    });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remove salon from favorites
router.delete('/favorites/:salonId', authenticateToken, requireCustomer, async (req, res) => {
  try {
    const { salonId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if salon is in favorites
    if (!user.favorites.includes(salonId)) {
      return res.status(404).json({ 
        success: false,
        message: 'Salon not in favorites' 
      });
    }

    // Remove from favorites
    user.favorites = user.favorites.filter(id => id.toString() !== salonId);
    await user.save();

    res.json({ 
      success: true,
      message: 'Salon removed from favorites', 
      favorites: user.favorites 
    });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Deactivate account (soft delete)
router.post('/deactivate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    user.isActive = false;
    await user.save();
    
    res.json({ 
      success: true,
      message: 'Account deactivated successfully' 
    });
    
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;