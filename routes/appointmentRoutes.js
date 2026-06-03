const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Professional = require("../models/Professional");
const Salon = require("../models/Salon");
const dayjs = require("dayjs");
const notificationService = require("../services/notificationService");
const { isSlotConflicting, parseDurationMins } = require("../utils/conflictEngine");

// 🔧 FIXED: Handle undefined/empty duration strings
const durationToMinutes = (durationStr) => {
  if (typeof durationStr === "number" && !isNaN(durationStr)) return durationStr;
  if (!durationStr) return 30;

  const str = String(durationStr).toLowerCase().trim();

  // Handle formats like "1h 30min", "1 hour 30 mins", "1h", "30 mins", "20min"
  const hourRegex = /(\d+)\s*(?:hour|hr|h)s?/g;
  const minRegex = /(\d+)\s*(?:min|m)s?/g;

  let totalMins = 0;

  // Extract hours
  let hourMatch;
  while ((hourMatch = hourRegex.exec(str)) !== null) {
    totalMins += parseInt(hourMatch[1], 10) * 60;
  }

  // Extract minutes
  let minMatch;
  while ((minMatch = minRegex.exec(str)) !== null) {
    totalMins += parseInt(minMatch[1], 10);
  }

  // Fallback: if no units were matched but a standalone number is present
  if (totalMins === 0) {
    const standaloneNum = parseInt(str.replace(/[^\d]/g, ""), 10);
    if (!isNaN(standaloneNum) && standaloneNum > 0) {
      if (str.includes("hour") || str.includes("h")) {
        return standaloneNum * 60;
      }
      return standaloneNum;
    }
  }

  return totalMins > 0 ? totalMins : 30;
};

const computeEndTime = (startTime, duration) => {
  const [h, m] = startTime.split(":").map(Number);
  const totalStart = h * 60 + m;
  const totalEnd = totalStart + duration;
  const endH = String(Math.floor(totalEnd / 60)).padStart(2, "0");
  const endM = String(totalEnd % 60).padStart(2, "0");
  return `${endH}:${endM}`;
};

// ✅ Slot pre-generation removed — slots are now computed dynamically
// by GET /api/timeslots using the conflict engine (utils/conflictEngine.js).

// ✅ GET appointments by salonId with optional filters
router.get("/salon/:id", async (req, res) => {
  try {
    const salonId = req.params.id;
    const { date, professionalId } = req.query;

 console.log(` Fetching appointments for salon: ${salonId}`);
 console.log(` Date filter: ${date || 'none'}`);
 console.log(`‍ Professional filter: ${professionalId || 'none'}`);

    const query = { salonId: salonId };
    if (date) query.date = date;
    if (professionalId) query.professionalId = professionalId;

 console.log(' Query object:', JSON.stringify(query));

    const appointments = await Appointment.find(query)
      .sort({ date: 1, startTime: 1 })
      .populate("salonId", "name location")
      .populate("professionalId", "name")
      .lean();

 console.log(` Found ${appointments.length} appointments for salon ${salonId}`);

    res.json(appointments);
  } catch (err) {
 console.error(" Error fetching appointments:", err);
    res.status(500).json({ message: "Failed to fetch appointments", error: err.message });
  }
});

// 🧪 Test route to check all appointments in database
router.get("/test/all", async (req, res) => {
  try {
 console.log(" Testing database connection...");

    const allAppointments = await Appointment.find().limit(100).lean();
    const totalCount = await Appointment.countDocuments();

 console.log(` Total appointments in database: ${totalCount}`);

    // Group by salonId for debugging
    const bySalon = {};
    allAppointments.forEach(appt => {
      const salonId = appt.salonId?.toString() || 'unknown';
      if (!bySalon[salonId]) bySalon[salonId] = 0;
      bySalon[salonId]++;
    });

 console.log(' Appointments by salon:', bySalon);

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
 console.error(" Test route error:", err);
    res.status(500).json({ message: "Test failed", error: err.message });
  }
});

// ✅ POST create new appointments + mark slot isBooked: true
// In your appointment POST route - Update to handle group bookings
router.post("/", async (req, res) => {
  try {
 console.log(" Received appointment request:", JSON.stringify(req.body, null, 2));

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
 console.log(" Processing appointment:", appt);

        // Handle services - can be an array (new format) or individual fields (legacy format)
        let servicesArray = [];
        let totalDurationMins = 0;

        if (appt.services && Array.isArray(appt.services) && appt.services.length > 0) {
          // NEW FORMAT: services is an array of {name, price, duration}
 console.log(" Using new services array format");
          servicesArray = appt.services.map(s => ({
            name: s.name || '',
            price: s.price || 0,
            duration: s.duration || '30 minutes'
          }));
          // Calculate total duration from all services
          totalDurationMins = servicesArray.reduce((sum, s) => sum + durationToMinutes(s.duration), 0);
        } else if (appt.serviceName) {
          // LEGACY FORMAT: individual serviceName, price, duration fields
 console.log(" Using legacy individual fields format");
          const duration = appt.duration || "30 minutes";
          servicesArray = [{
            name: appt.serviceName,
            price: appt.price || 0,
            duration: duration
          }];
          totalDurationMins = durationToMinutes(duration);
        } else {
          // FALLBACK: No service data provided
 console.warn("️ No service data found in appointment, using defaults");
          servicesArray = [{
            name: 'Service',
            price: 0,
            duration: '30 minutes'
          }];
          totalDurationMins = 30;
        }

 console.log(" Final services array:", JSON.stringify(servicesArray));
 console.log(`⏱️ Total Duration: ${totalDurationMins} minutes`);

        const endTime = computeEndTime(appt.startTime, totalDurationMins);
 console.log(`⏰ Time: ${appt.startTime} -> ${endTime}`);

        const newAppt = new Appointment({
          salonId: appt.salonId,
          professionalId: appt.professionalId || null,
          services: servicesArray,
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

        // ✅ Server-side closed day & temporary closures check
        const salonData = await Salon.findById(appt.salonId).select("closedDay temporaryClosures").lean();
        if (salonData) {
          // Check temporary closures
          if (salonData.temporaryClosures && salonData.temporaryClosures.length > 0) {
            const matchingClosure = salonData.temporaryClosures.find(closure => {
              return appt.date >= closure.startDate && appt.date <= closure.endDate;
            });

            if (matchingClosure) {
              if (matchingClosure.type === "full") {
                throw new Error(
                  `CLOSED: The salon is closed on this date (${appt.date}) due to: ${matchingClosure.reason || "Holiday"}.`
                );
              } else if (matchingClosure.type === "short" && matchingClosure.startTime && matchingClosure.endTime) {
                const timeToMins = (t) => {
                  const [h, m] = t.split(":").map(Number);
                  return h * 60 + m;
                };
                const closureStart = timeToMins(matchingClosure.startTime);
                const closureEnd = timeToMins(matchingClosure.endTime);
                const reqStart = timeToMins(appt.startTime);
                const reqEnd = reqStart + totalDurationMins;

                if (Math.max(closureStart, reqStart) < Math.min(closureEnd, reqEnd)) {
                  throw new Error(
                    `CLOSED: The salon is temporarily closed on ${appt.date} between ${matchingClosure.startTime} and ${matchingClosure.endTime} (${matchingClosure.reason || "Staff Meeting"}).`
                  );
                }
              }
            }
          }

          // Check weekly closed day
          if (salonData.closedDay && salonData.closedDay.toLowerCase() !== "none") {
            const [year, month, day] = appt.date.split("-").map(Number);
            const parsedDate = new Date(year, month - 1, day);
            const dayOfWeek = parsedDate.toLocaleDateString("en-US", { weekday: "long" });

            if (dayOfWeek.toLowerCase() === salonData.closedDay.toLowerCase()) {
              throw new Error(
                `CLOSED: The salon is closed on ${dayOfWeek}s. Booking not allowed.`
              );
            }
          }
        }

        // ✅ Server-side conflict guard — prevent double-booking
        if (appt.professionalId && appt.professionalId !== "any") {
          const existingAppointments = await Appointment.find({
            professionalId: appt.professionalId,
            date:           appt.date,
            status:         { $in: ["pending", "confirmed", "rescheduled"] },
          }).select("professionalId date startTime endTime status").lean();

          // Fetch professional's leaves and add them as virtual appointments for conflict check
          const pro = await Professional.findById(appt.professionalId).select("leaves").lean();
          if (pro && pro.leaves && pro.leaves.length > 0) {
            pro.leaves.forEach(leave => {
              if (leave.date === appt.date) {
                if (leave.type === "full") {
                  existingAppointments.push({
                    professionalId: pro._id,
                    date: appt.date,
                    startTime: "00:00",
                    endTime: "23:59",
                    status: "confirmed"
                  });
                } else if (leave.type === "short" && leave.startTime && leave.endTime) {
                  existingAppointments.push({
                    professionalId: pro._id,
                    date: appt.date,
                    startTime: leave.startTime,
                    endTime: leave.endTime,
                    status: "confirmed"
                  });
                }
              }
            });
          }

          const totalDuration = totalDurationMins;
          const hasConflict   = isSlotConflicting(
            existingAppointments,
            String(appt.professionalId),
            appt.date,
            appt.startTime,
            totalDuration
          );

          if (hasConflict) {
            throw new Error(
              `CONFLICT: The selected time slot (${appt.startTime}) for ${appt.date} ` +
              `is already booked for this professional.`
            );
          }
        }

        const savedAppt = await newAppt.save();
        console.log("✅ Appointment saved:", savedAppt._id);

        return savedAppt;
      })
    );

 console.log(` ${savedAppointments.length} appointments created successfully`);

    // Send notifications for all created appointments
    try {
 console.log(' Starting notification process...');
 console.log(' Email provided:', email);
 console.log(' Phone provided:', phone);

      // Get salon information for notifications
      const firstAppointment = savedAppointments[0];
 console.log(' First appointment:', firstAppointment.salonId);

      const salon = await Salon.findById(firstAppointment.salonId);
 console.log(' Salon found:', salon ? salon.name : 'Not found');

      if (!salon) {
 console.log('️ Salon not found for notifications');
      } else {
 console.log(' Processing notifications for', savedAppointments.length, 'appointments');

        // Send customer confirmation for each appointment
        for (const appointment of savedAppointments) {
 console.log(' Processing notification for appointment:', appointment._id);

          // Calculate service names and total amount from all services
          const serviceNames = appointment.services.map(s => s.name).filter(n => n).join(', ') || 'Service';
          const totalAmount = appointment.services.reduce((sum, s) => sum + (s.price || 0), 0);

          const notificationData = {
            customerEmail: email,
            customerPhone: phone,
            customerName: appointment.user.name || name || 'Guest',
            salonName: salon.name,
            serviceName: serviceNames,
            date: dayjs(appointment.date).format('MMMM DD, YYYY'),
            time: appointment.startTime,
            totalAmount: totalAmount,
            appointmentId: appointment._id.toString().slice(-6).toUpperCase()
          };

 console.log(' Notification data prepared:', {
            email: notificationData.customerEmail,
            phone: notificationData.customerPhone,
            salonName: notificationData.salonName,
            serviceName: notificationData.serviceName,
            totalAmount: notificationData.totalAmount
          });

          // Send confirmation to customer
 console.log(' Calling sendAppointmentConfirmation...');
          const confirmationResult = await notificationService.sendAppointmentConfirmation(notificationData);
 console.log(' Customer notification result:', confirmationResult);

          // Send notification to salon owner
          if (salon.email) {
 console.log(' Sending owner notification to:', salon.email);
            const ownerNotificationData = {
              ownerEmail: salon.email,
              ownerName: salon.name,
              salonName: salon.name,
              customerName: appointment.user.name || name || 'Guest',
              serviceName: serviceNames,
              date: dayjs(appointment.date).format('MMMM DD, YYYY'),
              time: appointment.startTime,
              totalAmount: totalAmount,
              customerPhone: phone
            };

            const ownerNotificationResult = await notificationService.notifyOwnerNewBooking(
              { ownerEmail: salon.email, ownerName: salon.name, salonName: salon.name },
              ownerNotificationData
            );
 console.log(' Owner notification result:', ownerNotificationResult);
          } else {
 console.log(' No salon owner email found');
          }
        }
 console.log(' All notifications processed');
      }
    } catch (notificationError) {
 console.error(' Notification error:', notificationError);
 console.error(' Notification error stack:', notificationError.stack);
      // Don't fail the appointment creation if notifications fail
    }

    res.status(201).json({
      success: true,
      message: "Appointments created successfully",
      data: savedAppointments,
      bookingGroupId: bookingGroupId
    });

  } catch (err) {
 console.error(" Error saving appointments:", err);
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

    const result = await Appointment.find(query)
      .sort({ createdAt: -1 })
      .populate("salonId", "name location")
      .populate("professionalId", "name");
    res.json(result);
  } catch (err) {
 console.error(" Error fetching appointments:", err);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    await Appointment.findByIdAndDelete(req.params.id);

    // ✅ No TimeSlot update needed — slots are dynamic
    res.json({ message: "Deleted successfully" });
  } catch (err) {
 console.error(" Failed to delete appointment:", err);
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
 console.log(' Sending confirmation notification for appointment:', updated._id);
        const confirmationResult = await notificationService.sendAppointmentConfirmation(notificationData);
 console.log(' Confirmation notification result:', confirmationResult);
      } catch (notificationError) {
 console.error(' Confirmation notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    // Send completion email when appointment is completed
    if (status === "completed" && updated.user?.email) {
      try {
 console.log(' Sending completion notification for appointment:', updated._id);
        const completionResult = await notificationService.sendAppointmentCompletion(notificationData);
 console.log(' Completion notification result:', completionResult);
      } catch (notificationError) {
 console.error(' Completion notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    // Send cancellation email when appointment is cancelled
    if ((status === "cancelled" || status === "cancel") && updated.user?.email) {
      try {
 console.log(' Sending cancellation notification for appointment:', updated._id);
        const cancellationData = {
          ...notificationData,
          cancellationReason: req.body.cancellationReason || null
        };
        const cancellationResult = await notificationService.sendAppointmentCancellation(cancellationData);
 console.log(' Cancellation notification result:', cancellationResult);
      } catch (notificationError) {
 console.error(' Cancellation notification error:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    // ✅ No TimeSlot update needed when cancelling — slots are dynamic

    res.json({ success: true, updated });
  } catch (err) {
 console.error(" Error updating status:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// In your appointments route - Update the reschedule endpoint
// Fixed reschedule endpoint - preserves original status
router.patch("/:id/reschedule", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { date, startTime, endTime, professionalId, createNew = false } = req.body;

 console.log(" Reschedule request received:", {
      appointmentId, date, startTime, endTime, professionalId, createNew
    });

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "date, startTime and endTime are required" });
    }

    const oldAppointment = await Appointment.findById(appointmentId);
    if (!oldAppointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

 console.log(" Old appointment found:", oldAppointment._id, "Status:", oldAppointment.status);

    // ✅ Server-side closed day & temporary closures check for reschedule
    const salonData = await Salon.findById(oldAppointment.salonId).select("closedDay temporaryClosures").lean();
    if (salonData) {
      // Check temporary closures
      if (salonData.temporaryClosures && salonData.temporaryClosures.length > 0) {
        const matchingClosure = salonData.temporaryClosures.find(closure => {
          return date >= closure.startDate && date <= closure.endDate;
        });

        if (matchingClosure) {
          if (matchingClosure.type === "full") {
            return res.status(409).json({
              success: false,
              message: `The salon is closed on this date (${date}) due to: ${matchingClosure.reason || "Holiday"}. Reschedule not allowed.`
            });
          } else if (matchingClosure.type === "short" && matchingClosure.startTime && matchingClosure.endTime) {
            // Find total duration from appointment services
            const totalDurationMins = oldAppointment.services.reduce((sum, s) => sum + durationToMinutes(s.duration), 0);
            
            const timeToMins = (t) => {
              const [h, m] = t.split(":").map(Number);
              return h * 60 + m;
            };
            const closureStart = timeToMins(matchingClosure.startTime);
            const closureEnd = timeToMins(matchingClosure.endTime);
            const reqStart = timeToMins(startTime);
            const reqEnd = reqStart + totalDurationMins;

            if (Math.max(closureStart, reqStart) < Math.min(closureEnd, reqEnd)) {
              return res.status(409).json({
                success: false,
                message: `The salon is temporarily closed on ${date} between ${matchingClosure.startTime} and ${matchingClosure.endTime} (${matchingClosure.reason || "Staff Meeting"}). Reschedule not allowed.`
              });
            }
          }
        }
      }

      // Check weekly closed day
      if (salonData.closedDay && salonData.closedDay.toLowerCase() !== "none") {
        const [year, month, day] = date.split("-").map(Number);
        const parsedDate = new Date(year, month - 1, day);
        const dayOfWeek = parsedDate.toLocaleDateString("en-US", { weekday: "long" });

        if (dayOfWeek.toLowerCase() === salonData.closedDay.toLowerCase()) {
          return res.status(409).json({
            success: false,
            message: `The salon is closed on ${dayOfWeek}s. Reschedule not allowed.`
          });
        }
      }
    }

    // ✅ No need to free old time slots — slots are computed dynamically

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
 console.log(" New appointment created:", updatedAppointment._id, "Status:", updatedAppointment.status);

      // Delete the old appointment
      await Appointment.findByIdAndDelete(appointmentId);
 console.log("️ Old appointment deleted:", appointmentId);
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
 console.log(" Existing appointment updated:", updatedAppointment._id, "Status:", updatedAppointment.status);
    }

    // ✅ Server-side conflict guard for reschedule
    const profId = professionalId || String(updatedAppointment.professionalId);
    if (profId && profId !== "any" && date && startTime && endTime) {
      const rescheduleApptId = createNew ? null : updatedAppointment._id;

      const existingForConflict = await Appointment.find({
        professionalId: profId,
        date:           date,
        status:         { $in: ["pending", "confirmed", "rescheduled"] },
        ...(rescheduleApptId ? { _id: { $ne: rescheduleApptId } } : {}),
      }).select("professionalId date startTime endTime status").lean();

      // Fetch professional's leaves and add them as virtual appointments for conflict check
      const pro = await Professional.findById(profId).select("leaves").lean();
      if (pro && pro.leaves && pro.leaves.length > 0) {
        pro.leaves.forEach(leave => {
          if (leave.date === date) {
            if (leave.type === "full") {
              existingForConflict.push({
                professionalId: pro._id,
                date: date,
                startTime: "00:00",
                endTime: "23:59",
                status: "confirmed"
              });
            } else if (leave.type === "short" && leave.startTime && leave.endTime) {
              existingForConflict.push({
                professionalId: pro._id,
                date: date,
                startTime: leave.startTime,
                endTime: leave.endTime,
                status: "confirmed"
              });
            }
          }
        });
      }

      const durationMins = parseDurationMins(
        updatedAppointment.services?.[0]?.duration || "30 minutes"
      );

      const hasConflict = isSlotConflicting(
        existingForConflict,
        String(profId),
        date,
        startTime,
        durationMins
      );

      if (hasConflict) {
        return res.status(409).json({
          success: false,
          message: `The selected time slot (${startTime} on ${date}) is already taken. Please choose another time.`
        });
      }
    }

    // Send notifications for rescheduled appointment
    try {
      const salon = await Salon.findById(updatedAppointment.salonId);
      if (salon) {
        const serviceNames = updatedAppointment.services.map(s => s.name).filter(n => n).join(', ') || 'Service';
        const totalAmount = updatedAppointment.services.reduce((sum, s) => sum + (s.price || 0), 0);

        const notificationData = {
          customerEmail: updatedAppointment.user?.email || oldAppointment.user?.email,
          customerPhone: updatedAppointment.user?.phone || oldAppointment.user?.phone,
          customerName: updatedAppointment.user?.name || oldAppointment.user?.name || 'Guest',
          salonName: salon.name,
          serviceName: serviceNames,
          date: dayjs(updatedAppointment.date).format('MMMM DD, YYYY'),
          time: updatedAppointment.startTime,
          totalAmount: totalAmount,
          appointmentId: updatedAppointment._id.toString().slice(-6).toUpperCase()
        };

        console.log('Sending reschedule notification...', {
          email: notificationData.customerEmail,
          phone: notificationData.customerPhone,
          salonName: notificationData.salonName
        });
        const rescheduleResult = await notificationService.sendAppointmentReschedule(notificationData);
        console.log('Reschedule notification result:', rescheduleResult);
      } else {
        console.warn('Salon not found for rescheduled appointment:', updatedAppointment.salonId);
      }
    } catch (notificationError) {
      console.error('Failed to send reschedule notification:', notificationError);
    }

    res.json({
      success: true,
      updated: updatedAppointment,
      oldAppointmentDeleted: createNew,
      message: "Appointment rescheduled successfully"
    });
  } catch (err) {
 console.error(" Error rescheduling appointment:", err);
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
 console.log(' Testing notification service...');

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
 console.log(' Test notification result:', result);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      result: result
    });
  } catch (error) {
 console.error(' Test notification failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test notification failed',
      error: error.message
    });
  }
});

// 🔍 GET order details by orderId (bookingGroupId or _id)
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
 console.log(` Fetching order details for Order ID: ${orderId}`);

    let query = { bookingGroupId: orderId };

    // If orderId is a valid ObjectId, search by _id OR bookingGroupId
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = {
        $or: [
          { bookingGroupId: orderId },
          { _id: orderId }
        ]
      };
    }

    const appointments = await Appointment.find(query)
      .populate("salonId", "name location")
      .populate("professionalId", "name")
      .lean();

    if (!appointments || appointments.length === 0) {
 console.log(` No appointments found for Order ID: ${orderId}`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Calculating totals and extracting common info
    const totalAmount = appointments.reduce((sum, appt) => {
      const price = appt.services?.[0]?.price || 0;
      return sum + price;
    }, 0);

    const firstAppt = appointments[0];
    const salon = firstAppt.salonId || {};

    // Construct the response
    const responseData = {
      success: true,
      data: {
        bookingId: orderId, // Return the requested ID
        salon: {
          name: salon.name || "Unknown Salon",
          location: salon.location || "Unknown Location"
        },
        customerName: firstAppt.user?.name || "Guest",
        totalAmount: totalAmount,
        isGroupBooking: appointments.length > 1,
        appointments: appointments.map(appt => ({
          serviceName: appt.services?.[0]?.name || "Unknown Service",
          professionalName: appt.professionalId?.name || "Any Professional",
          price: appt.services?.[0]?.price || 0,
          date: appt.date,
          startTime: appt.startTime,
          endTime: appt.endTime,
          memberName: appt.memberInfo?.name || appt.user?.name || "Guest"
        }))
      }
    };

 console.log(` Order details retrieved successfully for Order ID: ${orderId}`);
    res.json(responseData);

  } catch (err) {
 console.error(" Error fetching order details:", err);
    res.status(500).json({ success: false, message: "Failed to fetch order details", error: err.message });
  }
});

module.exports = router;