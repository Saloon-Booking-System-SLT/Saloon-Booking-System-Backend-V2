const express = require("express");
const router = express.Router();
const Service = require("../models/Service");
const upload = require("../middleware/uploadServiceImage");
const { getPaginationParams, buildPaginatedResponse } = require("../utils/queryHelpers");

// ➕ Add new service
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, price, duration, gender, salonId } = req.body;
    const imagePath = req.file ? `services/${req.file.filename}` : null;

    const service = new Service({
      name,
      price,
      duration,
      gender,
      salonId,
      image: imagePath,
    });

    await service.save();
    res.status(201).json(service);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to add service" });
  }
});

// 📄 Get all services for a salon
router.get("/:salonId", async (req, res) => {
  try {
    const services = await Service.find({ salonId: req.params.salonId })
      .lean(); // Memory optimization
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

// ✏️ Update a service
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.image = `services/${req.file.filename}`;
    }
    const updated = await Service.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: "Failed to update service" });
  }
});

// ❌ Delete a service
router.delete("/:id", async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete service" });
  }
});

// Get all services (for family booking) with backward compatibility
router.get('/', async (req, res) => {
  try {
    // Backward compatibility: if no pagination params, return old format
    if (!req.query.page && !req.query.limit) {
      const services = await Service.find()
        .limit(200) // Safety limit
        .lean();
      return res.json({
        success: true,
        data: services
      });
    }
    
    // New pagination support
    const { page, limit } = getPaginationParams(req.query);
    const skip = (page - 1) * limit;
    
    const [services, total] = await Promise.all([
      Service.find()
        .skip(skip)
        .limit(limit)
        .lean(),
      Service.countDocuments()
    ]);
    
    const response = buildPaginatedResponse(services, total, page, limit);
    res.json(response);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching services'
    });
  }
});

module.exports = router;
