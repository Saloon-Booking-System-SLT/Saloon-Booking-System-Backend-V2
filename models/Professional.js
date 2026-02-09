const mongoose = require("mongoose");

/**
 * Professional Schema
 * 
 * Each professional belongs to a salon and can perform multiple services.
 * The 'services' field links to Service documents by ObjectId for data consistency.
 * 
 * ADMIN FEATURE TODO:
 * - Create admin endpoint to assign/update services array for each professional
 * - Admin panel UI to select which services a professional can perform
 * - Validation to ensure assigned services belong to the same salon
 */
const professionalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  
  // LEGACY: Single service as string (kept for backward compatibility)
  // Will be deprecated once all data is migrated to 'services' array
  service: { type: String, required: false },
  
  // NEW: Array of Service ObjectIds that this professional can perform
  // Example: ["serviceId_facial", "serviceId_manicure", "serviceId_pedicure"]
  // ADMIN FEATURE: Salon owner will assign these via admin panel
  services: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service"
  }],
  
  serviceAvailability: { type: String, required: true },
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
  },
  gender: {
    type: String,
    enum: ["Male", "Female"],
    required: true,
  },
  available: {
    type: Boolean,
    default: true,
  },
  image: { type: String },       // base64 string
  certificate: { type: String }, // base64 string
});

// Index for faster queries when filtering by services
professionalSchema.index({ services: 1 });
professionalSchema.index({ salonId: 1, services: 1 });

module.exports = mongoose.model("Professional", professionalSchema);
