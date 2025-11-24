const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true,
  },
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
  },
  professionalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Professional",
    default: null,
  },
  userEmail: { 
    type: String, 
    required: true 
  },
  customerName: { 
    type: String, 
    default: 'Anonymous' 
  },
  rating: { 
    type: Number, 
    min: 1, 
    max: 5, 
    required: true 
  },
  comment: { 
    type: String, 
    trim: true 
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model("Feedback", feedbackSchema);