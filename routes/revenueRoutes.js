const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Service = require('../models/Service');
const Professional = require('../models/Professional');
const dayjs = require('dayjs');
const mongoose = require('mongoose');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isBetween = require('dayjs/plugin/isBetween');

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);

// Helper function to calculate revenue metrics correctly
const calculateRevenueMetrics = (appointments, payments) => {
  let collectedAmount = 0; // Successfully paid amounts
  let pendingPayments = 0; // Pending amounts
  let totalRevenue = 0; // collectedAmount + pendingPayments
  
  const paymentMap = {};
  payments.forEach(payment => {
    paymentMap[payment.appointmentId.toString()] = payment;
  });

  appointments.forEach(appointment => {
    const appointmentPrice = appointment.services?.reduce(
      (sum, service) => sum + (service.price || 0), 0
    ) || 0;

    const payment = paymentMap[appointment._id.toString()];
    const paymentStatus = payment?.status || appointment.paymentStatus || 'pending';
    
    if (paymentStatus === 'paid' || paymentStatus === 'completed' || paymentStatus === 'succeeded') {
      // Successfully paid
      collectedAmount += appointmentPrice;
      totalRevenue += appointmentPrice;
    } else if (paymentStatus === 'pending' || appointment.status === 'pending' || appointment.status === 'confirmed') {
      // Pending payment
      pendingPayments += appointmentPrice;
      totalRevenue += appointmentPrice;
    }
  });

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    collectedAmount: parseFloat(collectedAmount.toFixed(2)),
    pendingPayments: parseFloat(pendingPayments.toFixed(2))
  };
};

// ✅ Get detailed revenue report for salon with filters
// ✅ Get detailed revenue report for salon with filters - FIXED FILTERING
router.get('/detailed/salon/:salonId', async (req, res) => {
  try {
    const { salonId } = req.params;
    let { startDate, endDate, period = 'monthly', serviceId, professionalId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(salonId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid salon ID format' 
      });
    }

    // Set default date range based on period
    if (!startDate || !endDate) {
      const today = dayjs();
      switch(period) {
        case 'today':
          startDate = today.format('YYYY-MM-DD');
          endDate = today.format('YYYY-MM-DD');
          break;
        case 'week':
          startDate = today.subtract(7, 'day').format('YYYY-MM-DD');
          endDate = today.format('YYYY-MM-DD');
          break;
        case 'month':
        default:
          startDate = today.subtract(30, 'day').format('YYYY-MM-DD');
          endDate = today.format('YYYY-MM-DD');
          break;
        case 'quarter':
          startDate = today.subtract(90, 'day').format('YYYY-MM-DD');
          endDate = today.format('YYYY-MM-DD');
          break;
        case 'year':
          startDate = today.subtract(365, 'day').format('YYYY-MM-DD');
          endDate = today.format('YYYY-MM-DD');
          break;
      }
    }

    // Build query object
    const query = {
      salonId: salonId,
      date: { 
        $gte: startDate, 
        $lte: endDate 
      }
    };

    console.log(`🔍 Filter parameters:`, {
      startDate,
      endDate,
      serviceId,
      professionalId
    });

    // Get all appointments for the salon within date range
    const allAppointments = await Appointment.find(query)
      .populate('professionalId', 'name')
      .lean();

    console.log(`📊 Found ${allAppointments.length} total appointments for date range`);

    // Now filter appointments manually
    let filteredAppointments = allAppointments;

    // Filter by service if provided and not 'all'
    if (serviceId && serviceId !== 'all') {
      console.log(`🔍 Filtering by service ID: ${serviceId}`);
      
      // First, get the service to get its name
      const service = await Service.findById(serviceId);
      if (service) {
        const serviceName = service.name;
        console.log(`🔍 Service name for filtering: ${serviceName}`);
        
        filteredAppointments = filteredAppointments.filter(appointment => {
          // Check if any service in the appointment matches the service name
          return appointment.services?.some(apptService => 
            apptService.name && apptService.name.toLowerCase() === serviceName.toLowerCase()
          );
        });
        console.log(`📊 After service filter: ${filteredAppointments.length} appointments`);
      } else {
        console.log(`❌ Service not found with ID: ${serviceId}`);
      }
    }

    // Filter by professional if provided and not 'all'
    if (professionalId && professionalId !== 'all') {
      console.log(`🔍 Filtering by professional ID: ${professionalId}`);
      
      filteredAppointments = filteredAppointments.filter(appointment => {
        // Check if professionalId matches (either as string or ObjectId)
        const appointmentProfId = appointment.professionalId?._id?.toString() || 
                                  appointment.professionalId?.toString();
        
        return appointmentProfId && appointmentProfId.toString() === professionalId.toString();
      });
      console.log(`📊 After professional filter: ${filteredAppointments.length} appointments`);
    }

    console.log(`✅ Final filtered appointments: ${filteredAppointments.length}`);

    // Get all payments for these appointments
    const appointmentIds = filteredAppointments.map(a => a._id);
    const payments = await Payment.find({
      appointmentId: { $in: appointmentIds }
    }).lean();

    // Calculate revenue metrics using the helper function
    const revenueMetrics = calculateRevenueMetrics(filteredAppointments, payments);
    
    // Trackers for detailed analysis
    const dailyRevenueMap = {}; // For collected amounts only
    const monthlyRevenueMap = {}; // For collected amounts only
    const paymentMethodsMap = {};
    const servicesMap = {};
    const professionalRevenueMap = {};
    const detailedReportMap = {};

    const paymentMap = {};
    payments.forEach(payment => {
      paymentMap[payment.appointmentId.toString()] = payment;
    });

    // Process each appointment for analytics
    filteredAppointments.forEach(appointment => {
      const appointmentPrice = appointment.services?.reduce(
        (sum, service) => sum + (service.price || 0), 0
      ) || 0;
      
      const payment = paymentMap[appointment._id.toString()];
      const paymentStatus = payment?.status || appointment.paymentStatus || 'pending';
      const paymentMethod = payment?.provider || appointment.paymentMethod || 'cash';
      const paymentMethodDisplay = paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);

      const aptDate = appointment.date;
      const serviceName = appointment.services?.[0]?.name || 'Unknown Service';
      const professionalName = appointment.professionalId?.name || 'Any Professional';

      // Track detailed report (includes all revenue)
      const reportKey = `${aptDate}_${serviceName}_${professionalName}`;
      if (!detailedReportMap[reportKey]) {
        detailedReportMap[reportKey] = {
          date: aptDate,
          service: serviceName,
          professional: professionalName,
          appointments: 0,
          revenue: 0
        };
      }
      detailedReportMap[reportKey].appointments += 1;
      detailedReportMap[reportKey].revenue += appointmentPrice;

      // Only track collected amounts for daily/monthly revenue and analytics
      if (paymentStatus === 'paid' || paymentStatus === 'completed' || paymentStatus === 'succeeded') {
        // Daily revenue tracking (collected amounts only)
        dailyRevenueMap[aptDate] = (dailyRevenueMap[aptDate] || 0) + appointmentPrice;

        // Monthly revenue tracking (collected amounts only)
        const monthKey = dayjs(aptDate).format('YYYY-MM');
        monthlyRevenueMap[monthKey] = (monthlyRevenueMap[monthKey] || 0) + appointmentPrice;

        // Payment method tracking
        paymentMethodsMap[paymentMethodDisplay] = (paymentMethodsMap[paymentMethodDisplay] || 0) + 1;

        // Service tracking (collected revenue only)
        appointment.services?.forEach(service => {
          const serviceName = service.name || 'Unknown Service';
          if (!servicesMap[serviceName]) {
            servicesMap[serviceName] = {
              revenue: 0,
              bookings: 0
            };
          }
          servicesMap[serviceName].revenue += service.price || 0;
          servicesMap[serviceName].bookings += 1;
        });

        // Professional tracking (collected revenue only)
        if (appointment.professionalId) {
          const profName = appointment.professionalId.name || professionalName;
          if (!professionalRevenueMap[profName]) {
            professionalRevenueMap[profName] = {
              name: profName,
              revenue: 0,
              bookings: 0
            };
          }
          professionalRevenueMap[profName].revenue += appointmentPrice;
          professionalRevenueMap[profName].bookings += 1;
        }
      }
    });

    // Process and sort data
    const dailyRevenueArray = Object.entries(dailyRevenueMap)
      .map(([date, revenue]) => ({ 
        date, 
        revenue: parseFloat(revenue.toFixed(2)) 
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const monthlyDataArray = Object.entries(monthlyRevenueMap)
      .map(([month, revenue]) => ({ 
        month, 
        revenue: parseFloat(revenue.toFixed(2)) 
      }))
      .sort((a, b) => new Date(a.month) - new Date(b.month));

    const paymentMethodsArray = Object.entries(paymentMethodsMap)
      .map(([method, count]) => ({ 
        method, 
        count 
      }))
      .sort((a, b) => b.count - a.count);

    const topServicesArray = Object.entries(servicesMap)
      .map(([name, data]) => ({
        name,
        revenue: parseFloat(data.revenue.toFixed(2)),
        bookings: data.bookings
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topProfessionalsArray = Object.values(professionalRevenueMap)
      .map(prof => ({
        ...prof,
        revenue: parseFloat(prof.revenue.toFixed(2))
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const detailedReportArray = Object.values(detailedReportMap)
      .map(item => ({
        ...item,
        revenue: parseFloat(item.revenue.toFixed(2))
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Response data
    const responseData = {
      success: true,
      data: {
        summary: {
          totalRevenue: revenueMetrics.totalRevenue, // Collected + Pending
          totalAppointments: filteredAppointments.length,
          pendingPayments: revenueMetrics.pendingPayments, // Only pending amounts
          collectedAmount: revenueMetrics.collectedAmount, // Only collected amounts
          averageRevenuePerBooking: revenueMetrics.collectedAmount > 0 && filteredAppointments.length > 0 
            ? parseFloat((revenueMetrics.collectedAmount / filteredAppointments.length).toFixed(2)) 
            : 0
        },
        timeSeries: {
          daily: dailyRevenueArray, // Collected amounts only
          monthly: monthlyDataArray  // Collected amounts only
        },
        analytics: {
          paymentMethods: paymentMethodsArray,
          topServices: topServicesArray,
          topProfessionals: topProfessionalsArray
        },
        detailedReport: detailedReportArray, // All revenue (collected + pending)
        filters: {
          dateRange: {
            start: startDate,
            end: endDate,
            period: period
          },
          serviceId: serviceId || 'all',
          professionalId: professionalId || 'all'
        },
        generatedAt: new Date().toISOString()
      }
    };

    console.log(`✅ Revenue report generated for ${salonId}:`, {
      appointments: filteredAppointments.length,
      totalRevenue: revenueMetrics.totalRevenue,
      collectedAmount: revenueMetrics.collectedAmount,
      pendingPayments: revenueMetrics.pendingPayments,
      serviceFilter: serviceId,
      professionalFilter: professionalId
    });

    res.json(responseData);

  } catch (error) {
    console.error('❌ Error generating detailed revenue report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate revenue report', 
      error: error.message 
    });
  }
});
// ✅ Get revenue statistics for dashboard
router.get('/dashboard/:salonId', async (req, res) => {
  try {
    const { salonId } = req.params;
    
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD');
    const lastMonthStart = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

    // Get today's appointments
    const todayAppointments = await Appointment.find({
      salonId: salonId,
      date: today
    }).lean();

    // Get payments for today's appointments
    const todayAppointmentIds = todayAppointments.map(a => a._id);
    const todayPayments = await Payment.find({
      appointmentId: { $in: todayAppointmentIds }
    }).lean();

    // Calculate today's revenue metrics
    const todayMetrics = calculateRevenueMetrics(todayAppointments, todayPayments);

    // Get yesterday's appointments
    const yesterdayAppointments = await Appointment.find({
      salonId: salonId,
      date: yesterday
    }).lean();

    // Get payments for yesterday's appointments
    const yesterdayAppointmentIds = yesterdayAppointments.map(a => a._id);
    const yesterdayPayments = await Payment.find({
      appointmentId: { $in: yesterdayAppointmentIds }
    }).lean();

    // Calculate yesterday's revenue metrics
    const yesterdayMetrics = calculateRevenueMetrics(yesterdayAppointments, yesterdayPayments);

    // Get this month's appointments
    const thisMonthAppointments = await Appointment.find({
      salonId: salonId,
      date: { $gte: thisMonthStart, $lte: today }
    }).lean();

    // Get payments for this month's appointments
    const thisMonthAppointmentIds = thisMonthAppointments.map(a => a._id);
    const thisMonthPayments = await Payment.find({
      appointmentId: { $in: thisMonthAppointmentIds }
    }).lean();

    // Calculate this month's revenue metrics
    const thisMonthMetrics = calculateRevenueMetrics(thisMonthAppointments, thisMonthPayments);

    // Get last month's appointments
    const lastMonthAppointments = await Appointment.find({
      salonId: salonId,
      date: { $gte: lastMonthStart, $lte: lastMonthEnd }
    }).lean();

    // Get payments for last month's appointments
    const lastMonthAppointmentIds = lastMonthAppointments.map(a => a._id);
    const lastMonthPayments = await Payment.find({
      appointmentId: { $in: lastMonthAppointmentIds }
    }).lean();

    // Calculate last month's revenue metrics
    const lastMonthMetrics = calculateRevenueMetrics(lastMonthAppointments, lastMonthPayments);

    // Calculate today's metrics
    const todayStats = {
      appointments: todayAppointments.length,
      totalRevenue: todayMetrics.totalRevenue,
      collectedAmount: todayMetrics.collectedAmount,
      pendingPayments: todayMetrics.pendingPayments
    };

    // Calculate trends (based on collected amounts)
    const dailyTrend = yesterdayMetrics.collectedAmount > 0 
      ? ((todayMetrics.collectedAmount - yesterdayMetrics.collectedAmount) / yesterdayMetrics.collectedAmount * 100).toFixed(1)
      : todayMetrics.collectedAmount > 0 ? 100 : 0;

    const monthlyTrend = lastMonthMetrics.collectedAmount > 0
      ? ((thisMonthMetrics.collectedAmount - lastMonthMetrics.collectedAmount) / lastMonthMetrics.collectedAmount * 100).toFixed(1)
      : thisMonthMetrics.collectedAmount > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        today: todayStats,
        thisMonth: {
          totalRevenue: thisMonthMetrics.totalRevenue,
          collectedAmount: thisMonthMetrics.collectedAmount,
          pendingPayments: thisMonthMetrics.pendingPayments,
          appointments: thisMonthAppointments.length
        },
        trends: {
          daily: parseFloat(dailyTrend),
          monthly: parseFloat(monthlyTrend)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

// ✅ Export revenue data as CSV
router.get('/export/:salonId', async (req, res) => {
  try {
    const { salonId } = req.params;
    const { startDate, endDate, serviceId, professionalId } = req.query;

    // Get revenue data
    const revenueResponse = await require('axios').get(
      `${req.protocol}://${req.get('host')}/api/revenue/detailed/salon/${salonId}`,
      { 
        params: { 
          startDate, 
          endDate, 
          serviceId, 
          professionalId 
        } 
      }
    );

    if (!revenueResponse.data.success) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to fetch revenue data' 
      });
    }

    const data = revenueResponse.data.data;
    const filters = data.filters;
    
    // Generate CSV content
    let csvContent = 'SALON REVENUE REPORT\n';
    csvContent += `Generated on: ${dayjs(data.generatedAt).format('YYYY-MM-DD HH:mm:ss')}\n`;
    csvContent += `Period: ${filters.dateRange.start} to ${filters.dateRange.end}\n`;
    csvContent += `Service: ${filters.serviceId === 'all' ? 'All Services' : filters.serviceId}\n`;
    csvContent += `Professional: ${filters.professionalId === 'all' ? 'All Professionals' : filters.professionalId}\n\n`;
    
    // Summary section
    csvContent += 'SUMMARY\n';
    csvContent += 'Metric,Value\n';
    csvContent += `Total Revenue (Collected + Pending),LKR ${data.summary.totalRevenue.toLocaleString()}\n`;
    csvContent += `Total Appointments,${data.summary.totalAppointments}\n`;
    csvContent += `Pending Payments,LKR ${data.summary.pendingPayments.toLocaleString()}\n`;
    csvContent += `Collected Amount (Paid),LKR ${data.summary.collectedAmount.toLocaleString()}\n`;
    csvContent += `Average Revenue per Booking,LKR ${data.summary.averageRevenuePerBooking.toLocaleString()}\n\n`;
    
    // Detailed Report
    csvContent += 'DETAILED REPORT (All Appointments)\n';
    csvContent += 'Date,Service,Professional,Total Appointments,Total Revenue\n';
    data.detailedReport.forEach(item => {
      csvContent += `${item.date},${item.service},${item.professional},${item.appointments},LKR ${item.revenue.toLocaleString()}\n`;
    });
    csvContent += '\n';
    
    // Daily Revenue (Collected Only)
    csvContent += 'DAILY REVENUE (Collected Amounts Only)\n';
    csvContent += 'Date,Revenue\n';
    data.timeSeries.daily.forEach(day => {
      csvContent += `${day.date},LKR ${day.revenue.toLocaleString()}\n`;
    });
    csvContent += '\n';
    
    // Top Services (Collected Revenue Only)
    csvContent += 'TOP SERVICES (By Collected Revenue)\n';
    csvContent += 'Service,Bookings,Revenue\n';
    data.analytics.topServices.forEach(service => {
      csvContent += `${service.name},${service.bookings},LKR ${service.revenue.toLocaleString()}\n`;
    });
    csvContent += '\n';
    
    // Top Professionals (Collected Revenue Only)
    csvContent += 'TOP PROFESSIONALS (By Collected Revenue)\n';
    csvContent += 'Professional,Bookings,Revenue\n';
    data.analytics.topProfessionals.forEach(prof => {
      csvContent += `${prof.name},${prof.bookings},LKR ${prof.revenue.toLocaleString()}\n`;
    });
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=revenue_report_${dayjs().format('YYYY-MM-DD')}.csv`);
    
    res.send(csvContent);

  } catch (error) {
    console.error('❌ Error exporting revenue report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to export revenue report', 
      error: error.message 
    });
  }
});

// ✅ Get available services for filter dropdown
router.get('/services/:salonId', async (req, res) => {
  try {
    const { salonId } = req.params;
    
    const services = await Service.find({ salonId: salonId })
      .select('_id name price')
      .lean();

    res.json({
      success: true,
      data: services
    });

  } catch (error) {
    console.error('❌ Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: error.message
    });
  }
});

// ✅ Get available professionals for filter dropdown
router.get('/professionals/:salonId', async (req, res) => {
  try {
    const { salonId } = req.params;
    
    const professionals = await Professional.find({ salonId: salonId })
      .select('_id name')
      .lean();

    res.json({
      success: true,
      data: professionals
    });

  } catch (error) {
    console.error('❌ Error fetching professionals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professionals',
      error: error.message
    });
  }
});

module.exports = router;