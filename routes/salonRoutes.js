const express = require("express");
const router = express.Router();
const Salon = require("../models/Salon");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const { generateToken } = require("../utils/jwtUtils");
const { authenticateToken, requireOwner } = require("../middleware/authMiddleware");

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Function to upload to Cloudinary
const uploadToCloudinary = (buffer, folder = "salons") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ✅ Register salon
router.post("/register", upload.single("image"), async (req, res) => {
  try {
    const { name, email, password, phone, workingHours, location, services, salonType, coordinates } = req.body;

    const existingSalon = await Salon.findOne({ email });
    if (existingSalon) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let imageUrl = null;
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "salons");
      imageUrl = uploadResult.secure_url;
    }

    const newSalon = new Salon({
      name,
      email,
      password: hashedPassword,
      phone,
      workingHours,
      location,
      services: Array.isArray(services) ? services : [services],
      salonType,
      coordinates: coordinates ? JSON.parse(coordinates) : {},
      image: imageUrl,
      role: 'owner'
    });

    await newSalon.save();

    // Generate JWT token for the new salon owner
    const token = generateToken({
      userId: newSalon._id,
      email: newSalon.email,
      role: 'owner',
      salonName: newSalon.name
    });

    res.status(201).json({ 
      message: "Salon registered successfully",
      token,
      salon: {
        id: newSalon._id,
        name: newSalon.name,
        email: newSalon.email,
        phone: newSalon.phone,
        location: newSalon.location,
        services: newSalon.services,
        workingHours: newSalon.workingHours,
        image: newSalon.image,
        role: newSalon.role
      }
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Login with JWT
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const salon = await Salon.findOne({ email });
    if (!salon) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, salon.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = generateToken({
      userId: salon._id,
      email: salon.email,
      role: 'owner',
      salonName: salon.name
    });

    res.json({
      message: "Login successful",
      token,
      salon: {
        id: salon._id,
        name: salon.name,
        email: salon.email,
        phone: salon.phone,
        location: salon.location,
        services: salon.services,
        workingHours: salon.workingHours,
        image: salon.image,
        role: salon.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get all salons (public) - Only show approved salons
router.get("/", async (req, res) => {
  try {
    const { location } = req.query;
    const query = { 
      approvalStatus: 'approved',
      ...(location && { location: { $regex: location, $options: "i" } })
    };
    const salons = await Salon.find(query).select('-password');
    res.json(salons);
  } catch (err) {
    console.error("Get salons error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Nearby salons (public)
router.get("/nearby", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ message: "Latitude and longitude required" });
  }

  try {
    const allSalons = await Salon.find({ approvalStatus: 'approved' }).select('-password');
    const districts = {
      colombo: { lat: 6.9271, lng: 79.8612 },
      kandy: { lat: 7.2906, lng: 80.6337 },
      galle: { lat: 6.0535, lng: 80.221 },
      jaffna: { lat: 9.6615, lng: 80.0255 },
       matara: { lat: 5.9549, lng: 80.5549 },
      kurunegala: { lat: 7.4868, lng: 80.3659 },
      anuradhapura: { lat: 8.3114, lng: 80.4037 },
      negombo: { lat: 7.2083, lng: 79.8358 },
      ratnapura: { lat: 6.6828, lng: 80.3992 },
      batticaloa: { lat: 7.7184, lng: 81.7001 },
      "nuwara eliya": { lat: 6.9497, lng: 80.7891 },
    };

    const getDistance = (lat1, lng1, lat2, lng2) => {
      const toRad = (v) => (v * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const nearbySalons = [];
    for (let salon of allSalons) {
      const salonLocation = salon.location?.toLowerCase() || "";
      for (let district in districts) {
        if (salonLocation.includes(district)) {
          const dist = getDistance(parseFloat(lat), parseFloat(lng), districts[district].lat, districts[district].lng);
          if (dist <= 25) nearbySalons.push(salon);
        }
      }
    }

    res.json(nearbySalons);
  } catch (err) {
    console.error("Nearby salons error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get salon by ID (public)
router.get("/:id", async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id).select('-password');
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }
    res.json(salon);
  } catch (err) {
    console.error("Get salon by ID error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update salon by ID (protected - owner only)
router.put("/:id", authenticateToken, requireOwner, upload.single("image"), async (req, res) => {
  try {
    // Ensure owner can only update their own salon
    if (req.params.id !== req.user.userId) {
      return res.status(403).json({ message: 'Can only update your own salon' });
    }

    const updatedData = { ...req.body };
    
    // Handle password update
    if (updatedData.password) {
      updatedData.password = await bcrypt.hash(updatedData.password, 10);
    }

    // Handle image upload
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "salons");
      updatedData.image = uploadResult.secure_url;
    }

    const salon = await Salon.findByIdAndUpdate(
      req.params.id, 
      updatedData, 
      { new: true }
    ).select('-password');
    
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    res.json(salon);
  } catch (err) {
    console.error("Update salon error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get owner profile (protected)
router.get("/owner/profile", authenticateToken, requireOwner, async (req, res) => {
  try {
    const salon = await Salon.findById(req.user.userId).select('-password');
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    res.json({
      salon: {
        id: salon._id,
        name: salon.name,
        email: salon.email,
        phone: salon.phone,
        location: salon.location,
        services: salon.services,
        workingHours: salon.workingHours,
        image: salon.image,
        role: salon.role,
        salonType: salon.salonType,
        coordinates: salon.coordinates
      }
    });
  } catch (err) {
    console.error("Get owner profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Clean up duplicate salons (admin utility)
router.delete("/cleanup/duplicates", async (req, res) => {
  try {
    const salons = await Salon.find();
    const duplicatesRemoved = [];
    const seenEmails = new Set();
    const seenNames = new Set();
    
    for (let salon of salons) {
      const emailKey = salon.email.toLowerCase();
      const nameLocationKey = `${salon.name.toLowerCase()}-${salon.location.toLowerCase()}`;
      
      if (seenEmails.has(emailKey) || seenNames.has(nameLocationKey)) {
        await Salon.findByIdAndDelete(salon._id);
        duplicatesRemoved.push({
          id: salon._id,
          name: salon.name,
          email: salon.email,
          reason: seenEmails.has(emailKey) ? 'Duplicate email' : 'Duplicate name+location'
        });
      } else {
        seenEmails.add(emailKey);
        seenNames.add(nameLocationKey);
      }
    }

    res.json({
      message: `Cleanup completed. Removed ${duplicatesRemoved.length} duplicate salons.`,
      duplicatesRemoved
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;