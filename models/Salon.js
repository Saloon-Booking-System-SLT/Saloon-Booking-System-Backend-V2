const mongoose = require("mongoose");

const salonSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  location: String,
  workingHours: String,
  services: [String],
  salonType: String,
  image: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
  role: {
    type: String,
    enum: ['owner'],
    default: 'owner'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // ✅ ADD THESE FIELDS FOR APPROVAL SYSTEM
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved' // ✅ Set to 'approved' for existing salons, or 'pending' for new workflow
  },
  rejectionReason: {
    type: String,
    default: null
  },
  // Reset password fields
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster queries
salonSchema.index({ approvalStatus: 1 });
salonSchema.index({ location: 1 });
salonSchema.index({ email: 1 });

module.exports = mongoose.model("Salon", salonSchema);