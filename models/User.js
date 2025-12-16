const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const addressSchema = new mongoose.Schema({
  type: String,
  text: String,
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // Password field for email/password registration
  password: {
    type: String,
    minlength: 6,
    // Only required for users who register with email/password
    // Google/OAuth users won't have this field
    required: function() {
      return this.authMethod === 'email';
    }
  },
  // Track authentication method
  authMethod: {
    type: String,
    enum: ['google', 'phone', 'email', 'facebook'],
    default: 'email'
  },
  photoURL: String,
  phone: {
    type: String,
    sparse: true, // Allows multiple null values but unique for non-null
    trim: true
  },
  gender: String,
  address: [addressSchema],
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon'
  }],
  role: {
    type: String,
    enum: ['customer', 'admin', 'salon_owner'],
    default: 'customer'
  },
  // Password reset fields
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  // Email verification
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  // Update updatedAt timestamp
  if (this.isModified()) {
    this.updatedAt = Date.now();
  }
  
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = require('crypto').randomBytes(32).toString('hex');
  this.resetPasswordToken = require('crypto')
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  return resetToken;
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = require('crypto').randomBytes(32).toString('hex');
  this.emailVerificationToken = require('crypto')
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 86400000; // 24 hours
  return verificationToken;
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

module.exports = mongoose.model("User", userSchema);