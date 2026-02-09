const express = require("express");
const router = express.Router();
const multer = require("multer");
const mongoose = require("mongoose");
const Professional = require("../models/Professional");

// Memory storage (no folders)
const upload = multer({ storage: multer.memoryStorage() }).fields([
  { name: "image", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
]);

// ----------------- ADD PROFESSIONAL -----------------
/**
 * Create a new professional
 * Body can include 'services' array of Service ObjectIds
 */
router.post("/", upload, async (req, res) => {
  try {
    const { name, service, services, serviceAvailability, salonId, gender, available } = req.body;

    const image = req.files?.image
      ? req.files.image[0].buffer.toString("base64")
      : null;
    const certificate = req.files?.certificate
      ? req.files.certificate[0].buffer.toString("base64")
      : null;

    // Parse services array if provided as JSON string
    let parsedServices = [];
    if (services) {
      try {
        parsedServices = typeof services === 'string' ? JSON.parse(services) : services;
      } catch (e) {
        console.warn("Could not parse services array:", e);
      }
    }

    const professional = new Professional({
      name,
      service, // Legacy field
      services: parsedServices, // New array field
      serviceAvailability,
      salonId,
      gender,
      available,
      image,
      certificate,
    });

    await professional.save();
    res.status(201).json({ message: "Saved Successfully", data: professional });
  } catch (err) {
    console.error("CREATE ERROR:", err);
    res.status(500).json({ error: "Save failed", details: err.message });
  }
});

// ----------------- UPDATE PROFESSIONAL -----------------
/**
 * Update professional details
 * Can update 'services' array via this endpoint
 */
router.put("/:id", upload, async (req, res) => {
  try {
    const { name, service, services, serviceAvailability, gender, available } = req.body;

    const updateData = { name, service, serviceAvailability, gender, available };

    // Parse and update services array if provided
    if (services) {
      try {
        updateData.services = typeof services === 'string' ? JSON.parse(services) : services;
      } catch (e) {
        console.warn("Could not parse services array:", e);
      }
    }

    if (req.files?.image) {
      updateData.image = req.files.image[0].buffer.toString("base64");
    }
    if (req.files?.certificate) {
      updateData.certificate = req.files.certificate[0].buffer.toString("base64");
    }

    const updated = await Professional.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ error: "Professional not found" });

    res.json({ message: "Updated Successfully", data: updated });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

// ----------------- ADMIN: ASSIGN SERVICES TO PROFESSIONAL -----------------
/**
 * ADMIN FEATURE: Assign services to a professional
 * 
 * This endpoint allows salon admins to update which services a professional can perform.
 * 
 * Usage:
 *   PUT /api/professionals/:id/services
 *   Body: { "services": ["serviceId1", "serviceId2", "serviceId3"] }
 * 
 * TODO for Admin Panel:
 *   1. Fetch all services for the salon
 *   2. Display checkboxes for each service
 *   3. On save, call this endpoint with selected service IDs
 *   4. Add validation to ensure services belong to the same salon as the professional
 */
router.put("/:id/services", async (req, res) => {
  try {
    const { services } = req.body;
    
    if (!services || !Array.isArray(services)) {
      return res.status(400).json({ error: "Services array is required" });
    }

    // Convert string IDs to ObjectIds
    const serviceObjectIds = services.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const updated = await Professional.findByIdAndUpdate(
      req.params.id, 
      { services: serviceObjectIds },
      { new: true }
    ).populate('services', 'name price duration'); // Populate for response

    if (!updated) {
      return res.status(404).json({ error: "Professional not found" });
    }

    console.log(`✅ Assigned ${services.length} services to professional ${updated.name}`);
    res.json({ 
      message: "Services assigned successfully", 
      data: updated,
      assignedServices: updated.services
    });
  } catch (err) {
    console.error("ASSIGN SERVICES ERROR:", err);
    res.status(500).json({ error: "Failed to assign services", details: err.message });
  }
});

// ----------------- DELETE PROFESSIONAL -----------------
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Professional.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Professional not found" });

    res.json({ message: "Deleted Successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Delete failed", details: err.message });
  }
});

// ----------------- GET PROFESSIONALS BY SALON -----------------
/**
 * Get all professionals for a salon
 * Populates the 'services' array with full Service details
 */
router.get("/:salonId", async (req, res) => {
  try {
    const professionals = await Professional.find({ salonId: req.params.salonId })
      .populate('services', 'name price duration gender') // Populate service details
      .lean();
    res.json(professionals);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// ----------------- GET PROFESSIONALS BY SERVICE IDs -----------------
/**
 * Get professionals who can perform specific services
 * 
 * Usage:
 *   GET /api/professionals/by-services/:salonId?serviceIds=id1,id2,id3
 * 
 * This is used when user selects services and we need to show
 * only the professionals who can perform those services.
 * 
 * Returns professionals who can do ANY of the requested services.
 * Frontend can then filter to show which professionals match each service.
 */
router.get("/by-services/:salonId", async (req, res) => {
  try {
    const { salonId } = req.params;
    const { serviceIds } = req.query;

    if (!serviceIds) {
      return res.status(400).json({ error: "serviceIds query parameter is required" });
    }

    // Parse comma-separated service IDs
    const serviceIdArray = serviceIds.split(',').map(id => id.trim());
    
    console.log(`🔍 Finding professionals for salon ${salonId} with services: ${serviceIdArray}`);

    // Find professionals who have ANY of the requested services
    const professionals = await Professional.find({
      salonId: salonId,
      services: { $in: serviceIdArray },
      available: true
    })
    .populate('services', 'name price duration gender')
    .lean();

    console.log(`✅ Found ${professionals.length} professionals matching the services`);

    // Add helper field to show which requested services each professional can do
    const result = professionals.map(pro => ({
      ...pro,
      matchingServices: pro.services
        .filter(s => serviceIdArray.includes(s._id.toString()))
        .map(s => s._id.toString()),
      canDoAllRequested: serviceIdArray.every(
        reqId => pro.services.some(s => s._id.toString() === reqId)
      )
    }));

    res.json(result);
  } catch (err) {
    console.error("FETCH BY SERVICES ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// ----------------- GET PROFESSIONALS FOR A SINGLE SERVICE -----------------
/**
 * Get professionals who can perform a specific service
 * 
 * Usage:
 *   GET /api/professionals/for-service/:salonId/:serviceId
 * 
 * This is used in the popup when user selects a service
 * to show available professionals for that service.
 */
router.get("/for-service/:salonId/:serviceId", async (req, res) => {
  try {
    const { salonId, serviceId } = req.params;
    
    console.log(`🔍 Finding professionals for salon ${salonId} who can do service ${serviceId}`);

    const professionals = await Professional.find({
      salonId: salonId,
      services: serviceId,
      available: true
    })
    .populate('services', 'name price duration gender')
    .lean();

    console.log(`✅ Found ${professionals.length} professionals for service ${serviceId}`);

    res.json(professionals);
  } catch (err) {
    console.error("FETCH FOR SERVICE ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

module.exports = router;
