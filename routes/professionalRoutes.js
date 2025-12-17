const express = require("express");
const router = express.Router();
const multer = require("multer");
const Professional = require("../models/Professional");

// Memory storage (no folders)
const upload = multer({ storage: multer.memoryStorage() }).fields([
  { name: "image", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
]);

// ----------------- ADD PROFESSIONAL -----------------
router.post("/", upload, async (req, res) => {
  try {
    const { name, service, serviceAvailability, salonId, gender, available } = req.body;

    const image = req.files?.image
      ? req.files.image[0].buffer.toString("base64")
      : null;
    const certificate = req.files?.certificate
      ? req.files.certificate[0].buffer.toString("base64")
      : null;

    const professional = new Professional({
      name,
      service,
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
router.put("/:id", upload, async (req, res) => {
  try {
    const { name, service, serviceAvailability, gender, available } = req.body;

    const updateData = { name, service, serviceAvailability, gender, available };

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

// ----------------- GET SINGLE PROFESSIONAL BY ID -----------------
router.get("/single/:id", async (req, res) => {
  try {
    const professional = await Professional.findById(req.params.id)
      .lean(); // Memory optimization
    
    if (!professional) {
      return res.status(404).json({ error: "Professional not found" });
    }
    
    res.json(professional);
  } catch (err) {
    console.error("FETCH SINGLE ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// ----------------- GET PROFESSIONALS BY SALON -----------------
router.get("/salon/:salonId", async (req, res) => {
  try {
    const professionals = await Professional.find({ salonId: req.params.salonId })
      .lean(); // Memory optimization
    res.json(professionals);
  } catch (err) {
    console.error("FETCH BY SALON ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// ----------------- GET ALL PROFESSIONALS (with optional salon filter) -----------------
// This endpoint maintains backward compatibility
// Usage: GET /api/professionals (all) or GET /api/professionals?salonId=xxx
router.get("/", async (req, res) => {
  try {
    const { salonId } = req.query;
    const filter = salonId ? { salonId } : {};
    
    const professionals = await Professional.find(filter)
      .lean(); // Memory optimization
    res.json(professionals);
  } catch (err) {
    console.error("FETCH ALL ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// ----------------- GET BY DYNAMIC ID (salon or professional) -----------------
// DEPRECATED: Kept for backward compatibility only
// This tries to determine if the ID is for a salon (has matching professionals)
// or a professional (direct match). Use specific endpoints above instead.
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, try to find it as a professional ID
    const professional = await Professional.findById(id).lean();
    
    if (professional) {
      return res.json(professional);
    }
    
    // Otherwise, treat it as a salon ID
    const professionals = await Professional.find({ salonId: id }).lean();
    res.json(professionals);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

module.exports = router;
