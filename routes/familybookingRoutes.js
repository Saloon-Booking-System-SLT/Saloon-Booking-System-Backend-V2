const express = require('express');
const router = express.Router();
const FamilyBooking = require('../models/familybooking');
const TimeSlot = require('../models/TimeSlot');
const Service = require('../models/Service');
const Professional = require('../models/Professional');

// Create a family/group booking
router.post('/', async (req, res) => {
  try {
    const {
      customerInfo,
      salonId,
      bookingDate,
      appointments,
      specialInstructions
    } = req.body;

    console.log('Creating family/group booking with data:', {
      customerInfo,
      salonId,
      bookingDate,
      appointments: appointments?.length
    });

    // Validate required fields
    if (!customerInfo || !customerInfo.name || !customerInfo.email || !customerInfo.phone || 
        !salonId || !bookingDate || !appointments || appointments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerInfo (name, email, phone), salonId, bookingDate, and appointments are required'
      });
    }

    // Calculate total price and validate services
    let totalPrice = 0;
    const servicePromises = appointments.map(async (appointment) => {
      const service = await Service.findOne({ 
        $or: [
          { _id: appointment.serviceId },
          { name: appointment.serviceName }
        ]
      });
      if (!service) {
        throw new Error(`Service not found for ID: ${appointment.serviceId || appointment.serviceName}`);
      }
      return service;
    });

    const services = await Promise.all(servicePromises);
    services.forEach((service, index) => {
      totalPrice += service.price;
      // Add service details to appointment
      appointments[index].serviceDetails = {
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    // Check time slot availability for each appointment
    const availabilityPromises = appointments.map(async (appointment) => {
      if (appointment.startTime && appointment.professionalId) {
        const existingBooking = await TimeSlot.findOne({
          salonId,
          professionalId: appointment.professionalId,
          date: bookingDate,
          startTime: appointment.startTime,
          isBooked: true
        });

        if (existingBooking) {
          throw new Error(`Time slot ${appointment.startTime} is already booked for professional ${appointment.professionalId}`);
        }
      }
    });

    await Promise.all(availabilityPromises);

    // Create the family booking
    const familyBooking = new FamilyBooking({
      customerInfo,
      salonId,
      bookingDate: new Date(bookingDate),
      appointments: appointments.map(appointment => ({
        familyMember: appointment.familyMember,
        serviceId: appointment.serviceId,
        professionalId: appointment.professionalId,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        notes: appointment.notes,
        serviceDetails: appointment.serviceDetails,
        status: 'confirmed'
      })),
      totalPrice,
      specialInstructions: specialInstructions || '',
      status: 'confirmed'
    });

    await familyBooking.save();

    // Create time slots for each appointment
    const timeSlotPromises = appointments.map(async (appointment) => {
      if (appointment.startTime && appointment.professionalId) {
        const timeSlot = new TimeSlot({
          salonId,
          professionalId: appointment.professionalId,
          date: bookingDate,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          isBooked: true,
          appointmentId: familyBooking._id,
          serviceType: 'family-booking'
        });
        return timeSlot.save();
      }
    }).filter(Boolean);

    await Promise.all(timeSlotPromises);

    // Populate the saved booking with service and professional details
    const populatedBooking = await FamilyBooking.findById(familyBooking._id)
      .populate('appointments.serviceId')
      .populate('appointments.professionalId')
      .populate('salonId');

    res.status(201).json({
      success: true,
      message: 'Family/Group booking created successfully',
      data: populatedBooking
    });

  } catch (error) {
    console.error('Family booking creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating family booking',
      error: error.message
    });
  }
});

// Get family bookings by customer email/phone
router.get('/customer', async (req, res) => {
  try {
    const { email, phone, page = 1, limit = 10 } = req.query;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    const query = {};
    if (email) query['customerInfo.email'] = email;
    if (phone) query['customerInfo.phone'] = phone;

    const bookings = await FamilyBooking.find(query)
      .populate('appointments.serviceId')
      .populate('appointments.professionalId')
      .populate('salonId', 'name location phone') // Only select needed fields
      .sort({ bookingDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // Memory optimization

    const total = await FamilyBooking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get family bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching family bookings',
      error: error.message
    });
  }
});

// Get available time slots for family booking
router.get('/available-slots', async (req, res) => {
  try {
    const { salonId, date, duration = 60 } = req.query;

    console.log('Fetching available slots for:', { salonId, date, duration });

    if (!salonId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Salon ID and date are required'
      });
    }

    // Get all professionals for the salon with limit
    const professionals = await Professional.find({ 
      salonId, 
      available: true 
    })
    .select('_id name available') // Only select needed fields
    .limit(50) // Limit to prevent memory issues
    .lean();

    // Generate available time slots
    const availableSlots = generateTimeSlots('9:00 AM', '6:00 PM', parseInt(duration));

    // Get booked slots for the date with field selection
    const bookedSlots = await TimeSlot.find({
      salonId,
      date: date,
      isBooked: true
    })
    .select('startTime') // Only select needed field
    .lean();

    const bookedTimes = bookedSlots.map(slot => slot.startTime);
    const filteredSlots = availableSlots.filter(slot => !bookedTimes.includes(slot));

    res.json({
      success: true,
      data: {
        availableSlots: filteredSlots,
        professionals: professionals.length > 0 ? professionals : [
          { _id: 'any', name: 'Any staff member' },
          { _id: '1', name: 'Sarah' },
          { _id: '2', name: 'Emily' },
          { _id: '3', name: 'Jessica' }
        ]
      }
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available slots',
      error: error.message
    });
  }
});

// Cancel a family booking
router.put('/:bookingId/cancel', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { cancellationReason } = req.body;

    const booking = await FamilyBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.appointments.forEach(appointment => {
      appointment.status = 'cancelled';
    });
    await booking.save();

    // Free up time slots
    await TimeSlot.updateMany(
      { 
        appointmentId: bookingId
      },
      { 
        isBooked: false,
        appointmentId: null 
      }
    );

    res.json({
      success: true,
      message: 'Family booking cancelled successfully',
      data: booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling booking',
      error: error.message
    });
  }
});

// Get all family bookings (for admin)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, salonId } = req.query;
    
    const query = {};
    if (salonId) {
      query.salonId = salonId;
    }

    const bookings = await FamilyBooking.find(query)
      .populate('appointments.serviceId')
      .populate('appointments.professionalId')
      .populate('salonId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await FamilyBooking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get all family bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings',
      error: error.message
    });
  }
});

// Get specific family booking by ID
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await FamilyBooking.findById(bookingId)
      .populate('appointments.serviceId')
      .populate('appointments.professionalId')
      .populate('salonId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: booking
    });

  } catch (error) {
    console.error('Get family booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking',
      error: error.message
    });
  }
});

// Helper function to generate time slots
function generateTimeSlots(startTime, endTime, interval) {
  const slots = [];
  
  const timeToMinutes = (timeStr) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  };

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  
  for (let minutes = startMinutes; minutes < endMinutes; minutes += interval) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    const timeString = new Date(2000, 0, 1, hours, mins).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    slots.push(timeString);
  }

  return slots;
}

module.exports = router;