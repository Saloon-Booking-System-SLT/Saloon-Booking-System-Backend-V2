const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const TimeSlot = require("../models/TimeSlot");
const Professional = require("../models/Professional");
const dayjs = require("dayjs");

// 🔧 FIXED: Handle undefined/empty duration strings
const durationToMinutes = (durationStr) => {
  if (!durationStr || typeof durationStr !== 'string') {
    console.warn("⚠️ Invalid duration string:", durationStr);
    return 30; // Default to 30 minutes
  }
  
  const parts = durationStr.split(" ");
  let minutes = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const val = parseInt(parts[i]);
    const unit = parts[i + 1]?.toLowerCase() || ""; // 🔧 Added safe access
    if (unit.includes("hour")) minutes += (isNaN(val) ? 0 : val) * 60;
    else if (unit.includes("min")) minutes += isNaN(val) ? 0 : val;
  }
  return minutes || 30; // Default to 30 minutes if calculation fails
};

const computeEndTime = (startTime, duration) => {
  const [h, m] = startTime.split(":").map(Number);
  const totalStart = h * 60 + m;
  const totalEnd = totalStart + duration;
  const endH = String(Math.floor(totalEnd / 60)).padStart(2, "0");
  const endM = String(totalEnd % 60).padStart(2, "0");
  return `${endH}:${endM}`;
};

// 🔁 Auto-generate hourly time slots (9 AM - 6 PM) for all professionals for the next 7 days
const generateWeeklyTimeSlots = async () => {
  try {
    const professionals = await Professional.find();

    for (let i = 0; i < 7; i++) {
      const date = dayjs().add(i, "day").format("YYYY-MM-DD");

      for (const prof of professionals) {
        let currentTime = dayjs(`${date}T09:00`);
        const endTime = dayjs(`${date}T18:00`);

        while (currentTime.isBefore(endTime)) {
          const slotStart = currentTime.format("HH:mm");
          const slotEnd = currentTime.add(5, "minute").format("HH:mm");

          const exists = await TimeSlot.findOne({
            professionalId: prof._id,
            date,
            startTime: slotStart,
            endTime: slotEnd,
          });

          if (!exists) {
            await TimeSlot.create({
              salonId: prof.salonId,
              professionalId: prof._id,
              date,
              startTime: slotStart,
              endTime: slotEnd,
              isBooked: false,
            });
          }

          currentTime = currentTime.add(5, "minute");
        }
      }
    }
    console.log("✅ Weekly time slots generated successfully");
  } catch (error) {
    console.error("❌ Error generating weekly time slots:", error);
  }
};

// Run on server start
generateWeeklyTimeSlots();

// ✅ GET appointments by salonId with optional filters
router.get("/salon/:id", async (req, res) => {
  try {
    const salonId = req.params.id;
    const { date, professionalId } = req.query;
    
    console.log(`🔍 Fetching appointments for salon: ${salonId}`);
    console.log(`📅 Date filter: ${date || 'none'}`);
    console.log(`👨‍💼 Professional filter: ${professionalId || 'none'}`);
    
    const query = { salonId: salonId };
    if (date) query.date = date;
    if (professionalId) query.professionalId = professionalId;

    console.log('🔎 Query object:', JSON.stringify(query));

    const appointments = await Appointment.find(query)
      .sort({ date: 1, startTime: 1 })
      .populate("salonId")
      .populate("professionalId");

    console.log(`✅ Found ${appointments.length} appointments for salon ${salonId}`);

    res.json(appointments);
  } catch (err) {
    console.error("❌ Error fetching appointments:", err);
    res.status(500).json({ message: "Failed to fetch appointments", error: err.message });
  }
});

// 🧪 Test route to check all appointments in database
router.get("/test/all", async (req, res) => {
  try {
    console.log("🧪 Testing database connection...");
    
    const allAppointments = await Appointment.find();
    const totalCount = await Appointment.countDocuments();
    
    console.log(`📊 Total appointments in database: ${totalCount}`);
    
    // Group by salonId for debugging
    const bySalon = {};
    allAppointments.forEach(appt => {
      const salonId = appt.salonId?.toString() || 'unknown';
      if (!bySalon[salonId]) bySalon[salonId] = 0;
      bySalon[salonId]++;
    });
    
    console.log('📊 Appointments by salon:', bySalon);
    
    res.json({
      total: totalCount,
      bySalon,
      sample: allAppointments.slice(0, 3).map(a => ({
        id: a._id,
        salonId: a.salonId,
        date: a.date,
        status: a.status,
        user: a.user?.name
      }))
    });
  } catch (err) {
    console.error("❌ Test route error:", err);
    res.status(500).json({ message: "Test failed", error: err.message });
  }
});

// ✅ POST create new appointments + mark slot isBooked: true
// In your appointment POST route - Update to handle group bookings
router.post("/", async (req, res) => {
  try {
    console.log("📥 Received appointment request:", JSON.stringify(req.body, null, 2));
    
    const { phone, email, name, appointments = [], isGroupBooking = false, groupBookingId } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: "Phone or email is required" });
    }
    
    if (!appointments.length) {
      return res.status(400).json({ success: false, message: "No appointments provided" });
    }

    // Generate a group booking ID for family appointments
    const bookingGroupId = groupBookingId || `group-${Date.now()}`;

    const savedAppointments = await Promise.all(
      appointments.map(async (appt, index) => {
        console.log("📦 Processing appointment:", appt);
        
        // 🔧 FIXED: Provide default duration if missing
        const duration = appt.duration || "30 minutes";
        const durationMins = durationToMinutes(duration);
        const endTime = computeEndTime(appt.startTime, durationMins);

        console.log(`⏱️ Duration: ${duration} -> ${durationMins} minutes`);
        console.log(`⏰ Time: ${appt.startTime} -> ${endTime}`);

        const newAppt = new Appointment({
          salonId: appt.salonId,
          professionalId: appt.professionalId || null,
          services: [{ 
            name: appt.serviceName, 
            price: appt.price, 
            duration: duration 
          }],
          date: appt.date,
          startTime: appt.startTime,
          endTime,
          user: {
            name: appt.memberName || name || "Guest", // Use member name for group bookings
            phone: phone || "",
            email: email || "",
            photoURL: "",
          },
          status: "pending",
          // Add group booking information
          isGroupBooking: isGroupBooking,
          bookingGroupId: bookingGroupId,
          memberInfo: isGroupBooking ? {
            name: appt.memberName,
            category: appt.memberCategory
          } : null
        });

        const savedAppt = await newAppt.save();
        console.log("✅ Appointment saved:", savedAppt._id);

        // Mark time slots as booked
        if (appt.professionalId) {
          const updateResult = await TimeSlot.updateMany(
            {
              professionalId: appt.professionalId,
              date: appt.date,
              startTime: { $gte: appt.startTime },
              endTime: { $lte: endTime },
              isBooked: false,
            },
            { isBooked: true }
          );
          console.log(`🔒 Marked ${updateResult.modifiedCount} time slots as booked`);
        }

        return savedAppt;
      })
    );

    res.status(201).json({ 
      success: true, 
      message: "Appointments created successfully",
      data: savedAppointments,
      bookingGroupId: bookingGroupId
    });
    
  } catch (err) {
    console.error("❌ Error saving appointments:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to save appointments",
      error: err.message 
    });
  }
});

// ... rest of your routes remain the same
router.get("/", async (req, res) => {
  const { email, phone } = req.query;
  try {
    const query = email
      ? { "user.email": email }
      : phone
      ? { "user.phone": phone }
      : {};

    const result = await Appointment.find(query).sort({ createdAt: -1 }).populate("salonId");
    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching appointments:", err);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    await Appointment.findByIdAndDelete(req.params.id);

    await TimeSlot.updateMany(
      {
        professionalId: appointment.professionalId,
        date: appointment.date,
        startTime: { $gte: appointment.startTime },
        endTime: { $lte: appointment.endTime },
      },
      { isBooked: false }
    );

    res.json({ message: "Deleted successfully and slot updated" });
  } catch (err) {
    console.error("❌ Failed to delete appointment:", err);
    res.status(500).json({ message: "Failed to delete appointment" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Appointment not found" });

    if (status === "cancelled") {
      await TimeSlot.updateMany(
        {
          professionalId: updated.professionalId,
          date: updated.date,
          startTime: { $gte: updated.startTime },
          endTime: { $lte: updated.endTime },
        },
        { isBooked: false }
      );
    }

    res.json({ success: true, updated });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// In your appointments route - Update the reschedule endpoint
// Fixed reschedule endpoint - preserves original status
router.patch("/:id/reschedule", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { date, startTime, endTime, professionalId, createNew = false } = req.body;

    console.log("🔄 Reschedule request received:", {
      appointmentId, date, startTime, endTime, professionalId, createNew
    });

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "date, startTime and endTime are required" });
    }

    const oldAppointment = await Appointment.findById(appointmentId);
    if (!oldAppointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    console.log("📋 Old appointment found:", oldAppointment._id, "Status:", oldAppointment.status);

    // Free old time slots
    if (oldAppointment.professionalId && oldAppointment.date && oldAppointment.startTime && oldAppointment.endTime) {
      const freeResult = await TimeSlot.updateMany(
        {
          professionalId: oldAppointment.professionalId,
          date: oldAppointment.date,
          startTime: { $gte: oldAppointment.startTime },
          endTime: { $lte: oldAppointment.endTime },
        },
        { isBooked: false }
      );
      console.log(`🔓 Freed ${freeResult.modifiedCount} old time slots`);
    }

    let updatedAppointment;

    if (createNew) {
      // Create new appointment - preserve original status
      const newAppointment = new Appointment({
        salonId: oldAppointment.salonId,
        professionalId: professionalId || oldAppointment.professionalId,
        services: oldAppointment.services,
        date: date,
        startTime: startTime,
        endTime: endTime,
        user: oldAppointment.user,
        status: oldAppointment.status, // ✅ Preserve original status
        isRescheduled: true,
        originalAppointmentId: appointmentId
      });

      updatedAppointment = await newAppointment.save();
      console.log("✅ New appointment created:", updatedAppointment._id, "Status:", updatedAppointment.status);
      
      // Delete the old appointment
      await Appointment.findByIdAndDelete(appointmentId);
      console.log("🗑️ Old appointment deleted:", appointmentId);
    } else {
      // Update existing appointment - preserve status
      const updateData = {
        date: date,
        startTime: startTime,
        endTime: endTime,
        isRescheduled: true
      };
      
      // Only update professionalId if provided
      if (professionalId) {
        updateData.professionalId = professionalId;
      }
      
      // ✅ Status is NOT updated - it remains the same
      updatedAppointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        updateData,
        { new: true }
      );
      console.log("✅ Existing appointment updated:", updatedAppointment._id, "Status:", updatedAppointment.status);
    }

    // Mark new slots as booked
    const profId = professionalId || updatedAppointment.professionalId;
    if (profId && date && startTime && endTime) {
      const bookResult = await TimeSlot.updateMany(
        {
          professionalId: profId,
          date: date,
          startTime: { $gte: startTime },
          endTime: { $lte: endTime },
          isBooked: false,
        },
        { isBooked: true }
      );
      console.log(`🔒 Booked ${bookResult.modifiedCount} new time slots`);
    }

    res.json({ 
      success: true, 
      updated: updatedAppointment,
      oldAppointmentDeleted: createNew,
      message: "Appointment rescheduled successfully"
    });
  } catch (err) {
    console.error("❌ Error rescheduling appointment:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to reschedule appointment",
      error: err.message 
    });
  }
});

module.exports = router;