const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require("path");

// Load environment variables
dotenv.config();

// Route imports
const salonRoutes = require("./routes/salonRoutes");
const salonWithRatingsRoute = require("./routes/salonWithRatingsRoute");
const professionalsWithRatingsRoute = require("./routes/professionalsWithRatingsRoute");
const serviceRoutes = require('./routes/serviceRoutes');
const professionalRoutes = require("./routes/professionalRoutes");
const timeSlotRoutes = require("./routes/timeSlotRouts");
const appointmentRoutes = require("./routes/appointmentRoutes");
const userRoutes = require('./routes/userRoutes');
const feedbackRoutes = require("./routes/feedbackRoutes");
const familybookingRoutes = require("./routes/familybookingRoutes");
const adminRoutes = require("./routes/adminRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const loyaltyRoutes = require("./routes/loyaltyRoutes");
const paymentRoutes = require('./routes/payment'); // Import the new payment package

// Initialize Express app
const app = express();

// CORS Configuration - Super simple for debugging
const corsOptions = {
  origin: true, // Allow all origins for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'origin': req.headers.origin,
    'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
  });
  next();
});

// Request parsing middleware (consolidated)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Add explicit OPTIONS handling for debugging
app.options('*', (req, res) => {
  console.log(' OPTIONS preflight request:', {
    origin: req.headers.origin,
    method: req.headers['access-control-request-method'],
    headers: req.headers['access-control-request-headers']
  });
  res.sendStatus(200);
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log(" MongoDB connected");

    // Initialize email notification cron jobs after database connection
    try {
      const cronJobManager = require('./utils/cronJobs');
      cronJobManager.initialize();
      console.log(' Cron jobs initialized');
    } catch (error) {
      console.error('️ Cron job initialization failed:', error.message);
      console.log('️ Server will continue without scheduled notifications');
    }
  })
  .catch((err) => {
    console.error(" MongoDB connection error:", err);
    console.log('️ Server will continue without database connection');
  });

// Health check route for debugging CORS
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK - DEPLOYED 1.1.1',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Salon Booking System Backend API - Version 1.1.1',
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.1.1'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/salons', salonWithRatingsRoute);  // Optimized ratings endpoint
app.use('/api/salons', salonRoutes);          // Includes /login and /register
app.use('/api/services', serviceRoutes);
app.use('/api/professionals', professionalsWithRatingsRoute); // Optimized professionals endpoint
app.use('/api/professionals', professionalRoutes);
app.use('/api/timeslots', timeSlotRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/uploads/services", express.static(path.join(__dirname, "uploads/services")));
app.use("/uploads/professionals", express.static(path.join(__dirname, "uploads/professionals")));
app.use("/api/familybooking", familybookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/payments', paymentRoutes);

// PAYMENT ROUTES - with error handling
console.log(' Loading payment routes...');
// PAYMENT ROUTES
app.use('/api/payments', paymentRoutes);
console.log(' Payment routes registered at /api/payments');


// CORS test route
app.get('/api/test', (req, res) => {
  res.json({
    message: '✅ CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('✅ Salon API is running!');
});

// Global error handlers - Production-safe (no process.exit)
process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  } else {
    console.log('️ Production mode: Server continuing despite error');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(' Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  } else {
    console.log('️ Production mode: Server continuing despite error');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(' SIGTERM received, shutting down gracefully');
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(` Server is running at http://localhost:${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(` Production server running on port ${PORT}`);
    console.log(` CORS enabled for production domains`);
  }
  console.log(` Payment endpoint: POST http://localhost:${PORT}/api/payments/create-payment-intent`);
});

// Handle server errors
server.on('error', (error) => {
  console.error(' Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(` Port ${PORT} is already in use`);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
});
