const express = require("express");
const router = express.Router();
const Salon = require("../models/Salon");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const { generateToken } = require("../utils/jwtUtils");
const { authenticateToken, requireOwner } = require("../middleware/authMiddleware");
const notificationService = require("../services/notificationService");

const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Configure email transporter (add this at the top of your file)
// Enhanced email transporter configuration
let emailTransporter;

try {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASSWORD;
  
  console.log('🔧 Email Configuration Check:');
  console.log('   EMAIL_USER exists:', !!emailUser);
  console.log('   EMAIL_PASSWORD exists:', !!emailPass);
  
  if (!emailUser || !emailPass) {
    throw new Error('Email credentials not found in environment variables');
  }

  emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  console.log('✅ Email transporter configured successfully');
  
  // Test the connection
  emailTransporter.verify((error, success) => {
    if (error) {
      console.log('❌ Email transporter verification failed:', error.message);
    } else {
      console.log('✅ Email transporter is ready to send messages');
    }
  });
} catch (error) {
  console.error('❌ Email transporter setup failed:', error.message);
  console.log('💡 Please check your .env file and ensure EMAIL_USER and EMAIL_PASSWORD are set');
  emailTransporter = null;
}

// ✅ Forgot Password - Send reset email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    const salon = await Salon.findOne({ email });
    if (!salon) {
      return res.status(404).json({ message: "No account found with that email address." });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    
    // Set token expiry (1 hour)
    salon.resetPasswordToken = resetPasswordToken;
    salon.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    
    await salon.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: salon.email,
      subject: "Salon Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00AEEF;">Password Reset Request</h2>
          <p>Hello ${salon.name},</p>
          <p>You requested to reset your password for your salon account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #00AEEF; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            If the button doesn't work, copy and paste this link in your browser:<br>
            ${resetUrl}
          </p>
        </div>
      `
    };

    // Send email
    await emailTransporter.sendMail(mailOptions);

    res.json({ 
      message: "Password reset email sent successfully. Please check your inbox." 
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// ✅ Reset Password - Validate token and update password
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the token to compare with stored token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const salon = await Salon.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!salon) {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }

    // Hash new password and update
    salon.password = await bcrypt.hash(password, 10);
    salon.resetPasswordToken = undefined;
    salon.resetPasswordExpires = undefined;

    await salon.save();

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: salon.email,
      subject: "Password Reset Successful",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1FAF38;">Password Reset Successful</h2>
          <p>Hello ${salon.name},</p>
          <p>Your password has been successfully reset.</p>
          <p>If you didn't make this change, please contact us immediately.</p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({ message: "Password reset successfully. You can now login with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Function to send registration confirmation email
const sendRegistrationEmail = async (salonData) => {
  const { name, email } = salonData;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .container {
          max-width: 600px;
          margin: 0 auto;
          font-family: Arial, sans-serif;
          background-color: #f9f9f9;
          padding: 20px;
        }
        .email-content {
          background-color: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          color: #00AEEF;
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .success-icon {
          font-size: 60px;
          color: #1FAF38;
          margin-bottom: 20px;
        }
        .title {
          color: #333;
          font-size: 24px;
          margin-bottom: 20px;
        }
        .message {
          color: #666;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .salon-name {
          color: #00AEEF;
          font-weight: bold;
        }
        .status-box {
          background: linear-gradient(135deg, #FFE4B5 0%, #FFF8DC 100%);
          border: 2px solid #FFA500;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
          text-align: center;
        }
        .status-text {
          color: #FF8C00;
          font-weight: bold;
          font-size: 16px;
        }
        .next-steps {
          background-color: #f8f9fa;
          border-left: 4px solid #00AEEF;
          padding: 15px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #888;
          font-size: 14px;
        }
        .contact-info {
          background-color: #f0f9ff;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-content">
          <div class="header">
            <div class="logo">🏢 Salon Booking System</div>
            <div class="success-icon">✅</div>
            <h1 class="title">Registration Successful!</h1>
          </div>
          
          <div class="message">
            Dear <span class="salon-name">${name}</span> Team,
          </div>
          
          <div class="message">
            Congratulations! Your salon has been successfully registered with our Salon Booking System. We're excited to have you join our platform.
          </div>
          
          <div class="status-box">
            <div class="status-text">⏳ Your registration is currently under review</div>
          </div>
          
          <div class="next-steps">
            <h3 style="color: #00AEEF; margin-top: 0;">What happens next?</h3>
            <ul style="color: #666;">
              <li>Our admin team will review your salon registration</li>
              <li>You'll receive an email notification once approved</li>
              <li>After approval, you can start managing bookings and services</li>
              <li>The review process typically takes 1-2 business days</li>
            </ul>
          </div>
          
          <div class="contact-info">
            <h4 style="color: #00AEEF; margin-top: 0;">Need Help?</h4>
            <p style="color: #666; margin: 5px 0;">If you have any questions, please don't hesitate to contact our support team:</p>
            <p style="color: #666; margin: 5px 0;">📧 Email: support@salonbookingsystem.com</p>
            <p style="color: #666; margin: 5px 0;">📞 Phone: +94 11 123 4567</p>
          </div>
          
          <div class="message">
            Thank you for choosing Salon Booking System. We look forward to helping your business grow!
          </div>
          
          <div class="footer">
            <p>Best regards,<br>
            <strong>Salon Booking System Team</strong></p>
            <p style="font-size: 12px; color: #aaa;">
              This is an automated email. Please do not reply to this address.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    Salon Booking System - Registration Successful!
    
    Dear ${name} Team,
    
    Congratulations! Your salon has been successfully registered with our Salon Booking System.
    
    Status: Your registration is currently under review
    
    What happens next?
    - Our admin team will review your salon registration
    - You'll receive an email notification once approved
    - After approval, you can start managing bookings and services
    - The review process typically takes 1-2 business days
    
    Need Help?
    Email: support@salonbookingsystem.com
    Phone: +94 11 123 4567
    
    Thank you for choosing Salon Booking System!
    
    Best regards,
    Salon Booking System Team
  `;

  try {
    const mailOptions = emailService.createMailOptions(
      email,
      "🎉 Welcome to Salon Booking System - Registration Successful!",
      htmlContent,
      textContent
    );

    const result = await emailService.sendEmail(mailOptions);
    
    if (result.success) {
      console.log(`✅ Registration email sent successfully to ${email}`);
      return { success: true, messageId: result.messageId };
    } else {
      console.error(`❌ Failed to send registration email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error sending registration email to ${email}:`, error);
    return { success: false, error: error.message };
  }
};
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

    console.log(`🔄 Registration attempt for: ${email}`);

    // ALWAYS try to send email first using professional notification service
    let emailSent = false;
    let emailError = null;
    
    try {
      console.log(`📧 Attempting to send registration email to: ${email}`);
      const emailResult = await notificationService.sendSalonRegistrationConfirmation({
        salonName: name,
        ownerEmail: email
      });
      
      if (emailResult.success) {
        console.log(`✅ Registration email sent successfully to ${email}`);
        emailSent = true;
      } else {
        console.error(`❌ Registration email failed: ${emailResult.error}`);
        emailError = emailResult.error;
      }
    } catch (error) {
      console.error(`❌ Failed to send registration email to ${email}:`, error.message);
      emailError = error.message;
    }

    // Try database operations (but don't fail if MongoDB is down)
    let dbSuccess = false;
    let dbError = null;
    let newSalon = null;
    let token = null;

    try {
      console.log(`🔍 Checking for existing email in database...`);
      const existingSalon = await Salon.findOne({ email }).maxTimeMS(15000); // Use maxTimeMS for timeout
      if (existingSalon) {
        return res.status(400).json({ 
          message: "Email already exists", 
          emailSent: emailSent 
        });
      }

      console.log(`🔐 Hashing password...`);
      const hashedPassword = await bcrypt.hash(password, 10);

      let imageUrl = null;
      if (req.file) {
        console.log(`📸 Uploading image to Cloudinary...`);
        const uploadResult = await uploadToCloudinary(req.file.buffer, "salons");
        imageUrl = uploadResult.secure_url;
      }

      console.log(`💾 Creating new salon record...`);
      newSalon = new Salon({
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

      console.log(`💾 Saving salon to database...`);
      await newSalon.save(); // Remove timeout from save - use global connection timeout
      console.log(`✅ Salon saved to database successfully`);

      // Generate JWT token
      token = generateToken({
        userId: newSalon._id,
        email: newSalon.email,
        role: 'owner',
        salonName: newSalon.name
      });

      dbSuccess = true;

    } catch (error) {
      console.error(`❌ Database operation failed:`, error.message);
      dbError = error.message;
    }

    // Return appropriate response based on what succeeded
    if (dbSuccess) {
      // Both email and database succeeded
      console.log(`🎉 Full registration successful for ${email}`);
      res.status(201).json({ 
        message: "Salon registered successfully",
        emailSent: emailSent,
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
          role: newSalon.role,
          approvalStatus: newSalon.approvalStatus
        }
      });
    } else if (emailSent) {
      // Email sent but database failed
      console.log(`⚠️ Partial registration for ${email} - email sent, database failed`);
      res.status(202).json({ 
        message: "Registration email sent successfully! Your registration is being processed.",
        emailSent: true,
        databaseError: true,
        error: "Database temporarily unavailable - your registration will be completed soon",
        dbError: dbError
      });
    } else {
      // Both failed
      console.log(`❌ Registration failed completely for ${email}`);
      res.status(503).json({ 
        message: "Registration failed. Please try again later.",
        emailSent: false,
        databaseError: true,
        error: "Service temporarily unavailable",
        emailError: emailError,
        dbError: dbError
      });
    }

  } catch (err) {
    console.error("Unexpected registration error:", err);
    res.status(500).json({ 
      message: "Unexpected server error",
      error: err.message
    });
  }
});

// ✅ Email-only registration (for testing when DB is down)
router.post("/register-email-test", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // Send registration confirmation email
    try {
      await sendRegistrationEmail({ name, email });
      console.log(`📧 Registration email sent to ${email}`);
      
      res.status(200).json({ 
        message: "Registration email sent successfully",
        emailSent: true,
        recipient: email
      });
      
    } catch (emailError) {
      console.error(`❌ Failed to send registration email to ${email}:`, emailError);
      res.status(500).json({ 
        message: "Failed to send registration email",
        emailSent: false,
        error: emailError.message
      });
    }

  } catch (err) {
    console.error("Email registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Login with JWT - UPDATED WITH APPROVAL STATUS CHECK
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

    // Generate JWT token (even for pending salons so they can see pending message)
    const token = generateToken({
      userId: salon._id,
      email: salon.email,
      role: 'owner',
      salonName: salon.name
    });

    // Return salon data with approval status
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
        role: salon.role,
        approvalStatus: salon.approvalStatus, // ✅ Include approval status
        rejectionReason: salon.rejectionReason // ✅ Include rejection reason if any
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get owner's salon information (protected - owner only)
router.get("/owner/my-salon", authenticateToken, requireOwner, async (req, res) => {
  try {
    console.log("🔍 Fetching salon for owner ID:", req.user.userId);
    
    // The salon ID is the same as the owner's user ID
    const salon = await Salon.findById(req.user.userId).select('-password');
    
    if (!salon) {
      console.log("❌ No salon found for owner:", req.user.userId);
      return res.status(404).json({ 
        message: "No salon found for your account. Please contact admin.",
        success: false 
      });
    }

    console.log("✅ Salon found:", salon.name);
    
    // Return salon data in the same format as profile endpoint
    res.json({
      _id: salon._id,
      name: salon.name,
      email: salon.email,
      phone: salon.phone,
      location: salon.location,
      services: salon.services,
      workingHours: salon.workingHours,
      image: salon.image,
      salonType: salon.salonType,
      coordinates: salon.coordinates,
      approvalStatus: salon.approvalStatus,
      rejectionReason: salon.rejectionReason,
      role: salon.role
    });
  } catch (err) {
    console.error("❌ Error fetching owner salon:", err);
    res.status(500).json({ 
      message: "Server error while fetching salon information",
      error: err.message 
    });
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
        coordinates: salon.coordinates,
        approvalStatus: salon.approvalStatus,
        rejectionReason: salon.rejectionReason
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