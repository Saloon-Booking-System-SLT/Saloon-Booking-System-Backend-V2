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
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Salon", salonSchema);