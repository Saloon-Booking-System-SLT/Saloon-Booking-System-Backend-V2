const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const TimeSlot = require("../models/TimeSlot");
const Professional = require("../models/Professional");
const Salon = require("../models/Salon");
const dayjs = require("dayjs");
const notificationService = require("../services/notificationService");
const { getPaginationParams, buildPaginatedResponse } = require("../utils/queryHelpers");

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

// 🔁 OPTIMIZED: Generate time slots in batches to avoid memory issues
const generateWeeklyTimeSlots = async () => {
  try {
    // Use cursor to process professionals one by one
    const cursor = Professional.find().select('_id salonId').lean().cursor();
    let professionalCount = 0;

    for await (const prof of cursor) {
      for (let i = 0; i < 7; i++) {
        const date = dayjs().add(i, "day").format("YYYY-MM-DD");
        let currentTime = dayjs(`${date}T09:00`);
        const endTime = dayjs(`${date}T18:00`);

        // Batch insert slots for this professional on this day
        const slotsToCreate = [];

        while (currentTime.isBefore(endTime)) {
          const slotStart = currentTime.format("HH:mm");
          const slotEnd = currentTime.add(5, "minute").format("HH:mm");

          // Check if exists - use lean() and limit result
          const exists = await TimeSlot.findOne({
            professionalId: prof._id,
            date,
            startTime: slotStart,
            endTime: slotEnd,
          }).select('_id').lean();

          if (!exists) {
            slotsToCreate.push({
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

        // Batch insert to reduce DB calls
        if (slotsToCreate.length > 0) {
          await TimeSlot.insertMany(slotsToCreate, { ordered: false, lean: true });
        }
      }
      professionalCount++;
    }
    
    console.log(`✅ Weekly time slots generated for ${professionalCount} professionals`);
  } catch (error) {
    // Ignore duplicate key errors from insertMany
    if (error.code !== 11000) {
      console.error("❌ Error generating weekly time slots:", error);
    }
  }
};

// DISABLED: Don't run on server start - this causes memory issues
// Only run if explicitly triggered or via cron job
// generateWeeklyTimeSlots();

// Endpoint to manually trigger slot generation (for admin/cron use)
router.post("/generate-slots", async (req, res) => {
  try {
    await generateWeeklyTimeSlots();
    res.json({ success: true, message: "Time slots generated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ OPTIMIZED: GET appointments by salonId with pagination
router.get("/salon/:id", async (req, res) => {
  try {
    const salonId = req.params.id;
    const { date, professionalId, page, limit } = req.query;
    
    console.log(`🔍 Fetching appointments for salon: ${salonId}`);
    console.log(`📅 Date filter: ${date || 'none'}`);
    console.log(`👨‍💼 Professional filter: ${professionalId || 'none'}`);
    
    const query = { salonId: salonId };
    if (date) query.date = date;
    if (professionalId) query.professionalId = professionalId;

    console.log('🔎 Query object:', JSON.stringify(query));

    const { skip, limit: validLimit } = getPaginationParams({ page, limit });
    
    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .sort({ date: 1, startTime: 1 })
        .skip(skip)
        .limit(validLimit)
        .populate("salonId", "name") // Only select name field
        .populate("professionalId", "name") // Only select name field
        .lean(), // Use lean for memory efficiency
      Appointment.countDocuments(query)
    ]);

    console.log(`✅ Found ${appointments.length} appointments for salon ${salonId}`);

    const response = buildPaginatedResponse(appointments, total, parseInt(page) || 1, validLimit);
    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching appointments:", err);
    res.status(500).json({ message: "Failed to fetch appointments", error: err.message });
  }
});

// 🧪 OPTIMIZED: Test route with pagination
router.get("/test/all", async (req, res) => {
  try {
    console.log("🧪 Testing database connection...");
    
    const { page, limit } = getPaginationParams(req.query);
    
    const totalCount = await Appointment.countDocuments();
    const allAppointments = await Appointment.find()
      .select('_id salonId date status user.name') // Only select needed fields
      .limit(limit)
      .lean();
    
    console.log(`📊 Total appointments in database: ${totalCount}`);
    
    // Group by salonId for debugging (use only first page for grouping)
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
      })),
      pagination: { page, limit }
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

    console.log(`✅ ${savedAppointments.length} appointments created successfully`);

    // Send notifications for all created appointments
    try {
      console.log('📧 Starting notification process...');
      console.log('📧 Email provided:', email);
      console.log('📧 Phone provided:', phone);
      
      // Get salon information for notifications
      const firstAppointment = savedAppointments[0];
      console.log('📧 First appointment:', firstAppointment.salonId);
      
      const salon = await Salon.findById(firstAppointment.salonId);
      console.log('📧 Salon found:', salon ? salon.name : 'Not found');
      
      if (!salon) {
        console.log('⚠️ Salon not found for notifications');
      } else {
        console.log('📧 Processing notifications for', savedAppointments.length, 'appointments');
        
        // Send customer confirmation for each appointment
        for (const appointment of savedAppointments) {
          console.log('📧 Processing notification for appointment:', appointment._id);
          
          const notificationData = {
            customerEmail: email,
            customerPhone: phone,
            customerName: appointment.user.name || name || 'Guest',
            salonName: salon.name,
            serviceName: appointment.services[0]?.name || 'Service',
            date: dayjs(appointment.date).format('MMMM DD, YYYY'),
            time: appointment.startTime,
            totalAmount: appointment.services[0]?.price || 0,
            appointmentId: appointment._id.toString().slice(-6).toUpperCase()
          };
          
          console.log('📧 Notification data prepared:', {
            email: notificationData.customerEmail,
            phone: notificationData.customerPhone,
            salonName: notificationData.salonName,
            serviceName: notificationData.serviceName
          });

          // Send confirmation to customer
          console.log('📧 Calling sendAppointmentConfirmation...');
          const confirmationResult = await notificationService.sendAppointmentConfirmation(notificationData);
          console.log('📧 Customer notification result:', confirmationResult);

          // Send notification to salon owner
          if (salon.email) {
            console.log('📧 Sending owner notification to:', salon.email);
            const ownerNotificationData = {
              ownerEmail: salon.email,
              ownerName: salon.name,
              salonName: salon.name,
              customerName: appointment.user.name || name || 'Guest',
              serviceName: appointment.services[0]?.name || 'Service',
              date: dayjs(appointment.date).format('MMMM DD, YYYY'),
              time: appointment.startTime,
              totalAmount: appointment.services[0]?.price || 0,
              customerPhone: phone
            };

            const ownerNotificationResult = await notificationService.notifyOwnerNewBooking(
              { ownerEmail: salon.email, ownerName: salon.name, salonName: salon.name },
              ownerNotificationData
            );
            console.log('📧 Owner notification result:', ownerNotificationResult);
          } else {
            console.log('📧 No salon owner email found');
          }
        }
        console.log('📧 All notifications processed');
      }
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError);
      console.error('❌ Notification error stack:', notificationError.stack);
      // Don't fail the appointment creation if notifications fail
    }

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

// OPTIMIZED: Get appointments with backward compatibility
router.get("/", async (req, res) => {
  const { email, phone, page, limit } = req.query;
  try {
    const query = email
      ? { "user.email": email }
      : phone
      ? { "user.phone": phone }
      : {};

    // Backward compatibility: if no pagination params, return array directly
    if (!page && !limit) {
      const result = await Appointment.find(query)
        .sort({ createdAt: -1 })
        .limit(100) // Safety limit
        .populate("salonId", "name email phone")
        .lean();
      return res.json(result);
    }

    // New pagination support
    const { skip, limit: validLimit } = getPaginationParams({ page, limit });
    
    const [result, total] = await Promise.all([
      Appointment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit)
        .populate("salonId", "name email phone")
        .lean(),
      Appointment.countDocuments(query)
    ]);
    
    const response = buildPaginatedResponse(result, total, parseInt(page) || 1, validLimit);
    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching appointments:", err);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .select('_id professionalId date startTime endTime') // Only select needed fields
      .lean();
      
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
    ).populate('salonId');

    if (!updated) return res.status(404).json({ message: "Appointment not found" });

    // Common notification data
    const notificationData = {
      customerEmail: updated.user?.email,
      customerPhone: updated.user?.phone,
      customerName: updated.user?.name || 'Guest',
      salonName: updated.salonId?.name || 'Salon',
      serviceName: updated.services[0]?.name || 'Service',
      date: dayjs(updated.date).format('MMMM DD, YYYY'),
      time: updated.startTime,
      totalAmount: updated.services[0]?.price || 0,
      appointmentId: updated._id.toString().slice(-6).toUpperCase()
    };

    // Send confirmation email when appointment is confirmed
    if (status === "confirmed" && updated.user?.email) {
      try {
        console.log('📧 Sending confirmation notification for appointment:', updated._id);
        const confirmationResult = await notificationService.sendAppointmentConfirmation(notificationData);
        console.log('📧 Confirmation notification result:', confirmationResult);
      } catch (notificationError) {
        console.error('❌ Confirmation notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    // Send completion email when appointment is completed
    if (status === "completed" && updated.user?.email) {
      try {
        console.log('📧 Sending completion notification for appointment:', updated._id);
        const completionResult = await notificationService.sendAppointmentCompletion(notificationData);
        console.log('📧 Completion notification result:', completionResult);
      } catch (notificationError) {
        console.error('❌ Completion notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    // Send cancellation email when appointment is cancelled
    if ((status === "cancelled" || status === "cancel") && updated.user?.email) {
      try {
        console.log('📧 Sending cancellation notification for appointment:', updated._id);
        const cancellationData = {
          ...notificationData,
          cancellationReason: req.body.cancellationReason || null
        };
        const cancellationResult = await notificationService.sendAppointmentCancellation(cancellationData);
        console.log('📧 Cancellation notification result:', cancellationResult);
      } catch (notificationError) {
        console.error('❌ Cancellation notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

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

// 📧 Test notification endpoint
router.post("/test-notification", async (req, res) => {
  try {
    console.log('🧪 Testing notification service...');
    
    const testData = {
      customerEmail: 'test@example.com',
      customerPhone: '+1234567890',
      customerName: 'Test Customer',
      salonName: 'Test Salon',
      serviceName: 'Test Service',
      date: 'December 25, 2024',
      time: '10:00 AM',
      totalAmount: 50,
      appointmentId: 'TEST123'
    };

    const result = await notificationService.sendAppointmentConfirmation(testData);
    console.log('🧪 Test notification result:', result);
    
    res.json({ 
      success: true, 
      message: 'Test notification sent successfully',
      result: result 
    });
  } catch (error) {
    console.error('❌ Test notification failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Test notification failed',
      error: error.message 
    });
  }
});

module.exports = router;