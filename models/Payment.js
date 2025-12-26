// backend/models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    unique: true,
    sparse: true // Allows null/undefined values to not violate uniqueness (important if transactionId is not immediately available)
  },
  provider: {
    type: String,
    enum: ['stripe', 'payhere'],
    required: true,
    default: 'payhere'
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'lkr'
  },
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'canceled', 'chargedback'],
    default: 'pending'
  },
  customerEmail: {
    type: String,
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster queries
paymentSchema.index({ appointmentId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);