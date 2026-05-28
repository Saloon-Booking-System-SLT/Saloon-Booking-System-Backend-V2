const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: false
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['Discount', 'Bundle', 'Seasonal', 'Flash Sale', 'Referral', 'Targeted'],
    default: 'Discount'
  },
  discountPercentage: Number,
  code: String, // Promo code
  validUntil: Date, // Alternative to endDate for display
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'scheduled'],
    default: 'scheduled'
  },
  // Email tracking fields
  emailsSent: {
    type: Number,
    default: 0
  },
  lastEmailSent: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Promotion', promotionSchema);