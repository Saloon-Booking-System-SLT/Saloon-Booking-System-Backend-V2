// ✅ 3. models/Appointment.js
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: "Salon", required: true },
  professionalId: { type: mongoose.Schema.Types.ObjectId, ref: "Professional" },
  services: [
    {
      name: String,
      price: Number,
      duration: String,
    },
  ],
  user: {
    name: String,
    email: String,
    phone: String,
    photoURL: String,
  },
  date: String, // YYYY-MM-DD
  startTime: String, // HH:mm
  endTime: String,   // HH:mm
  status: { type: String, default: "pending" },

  // Add group booking fields
  isGroupBooking: { type: Boolean, default: false },
  bookingGroupId: String,
  memberInfo: {
    name: String,
    category: String
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});


module.exports = mongoose.model("Appointment", appointmentSchema);

