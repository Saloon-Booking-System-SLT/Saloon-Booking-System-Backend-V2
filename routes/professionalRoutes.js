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

// ----------------- GET PROFESSIONALS -----------------
router.get("/:salonId", async (req, res) => {
  try {
    const professionals = await Professional.find({ salonId: req.params.salonId })
      .lean(); // Memory optimization
    res.json(professionals);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

module.exports = router;
