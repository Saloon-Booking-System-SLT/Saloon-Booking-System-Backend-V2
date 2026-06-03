const mongoose = require("mongoose");

const salonSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  location: String,
  workingHours: String,       // Human-readable display string e.g. "9AM - 8PM"
  openTime: {
    type: String,
    default: "09:00",          // HH:MM 24-hour format for conflict engine
  },
  closeTime: {
    type: String,
    default: "20:00",          // HH:MM 24-hour format for conflict engine
  },
  closedDay: {
    type: String,
    default: "Sunday",         // E.g. "Sunday", "Monday", or "None"
  },
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
    enum: ['pending', 'approved', 'rejected', 'terminated'],
    default: 'pending' // ✅ New salons default to pending
  },
  rejectionReason: {
    type: String,
    default: null
  },
  // Reset password fields
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  temporaryClosures: [{
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },   // YYYY-MM-DD
    type: { type: String, enum: ["full", "short"], default: "full" },
    startTime: { type: String }, // HH:MM
    endTime: { type: String },   // HH:MM
    reason: { type: String }
  }],
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