const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require("path");

// Load environment variables
dotenv.config();

// Utilities
const logger = require('./utils/logger');
const { apiLimiter, authLimiter, uploadLimiter } = require('./middleware/rateLimiter');

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
// const paymentRoutes = require("./routes/paymentRoutes");

// Initialize Express app
const app = express();

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000', // Local development
  'http://127.0.0.1:3000', // Alternative localhost
  'https://saloon-booking-system-frontend-web-eight.vercel.app', // Your actual Vercel URL
  'https://saloon-booking-system-frontend-web-v2.vercel.app', // Alternative domain pattern
  'https://vercel.app', // Any Vercel subdomain
  'https://saloon-booking-system-frontend-web-git-main-saloon-booking-system-slt.vercel.app' // Git branch deployments
];

// Add production frontend URL from environment variable
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// CORS Configuration - More permissive for production
const corsOptions = {
  origin: function (origin, callback) {
    logger.http('CORS Request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin - allowing request');
      return callback(null, true);
    }
    
    // For production - be more permissive with Vercel domains
    if (process.env.NODE_ENV === 'production') {
      // Allow any Vercel app domain
      if (origin.includes('vercel.app') || 
          origin.includes('saloon-booking-system') || 
          origin.includes('localhost')) {
        console.log('Production: Allowed domain - allowing request');
        return callback(null, true);
      }
    }
    
    // Check if origin is in allowed list
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://saloon-booking-system-frontend-web-eight.vercel.app',
      'https://saloon-booking-system-frontend-web-v2.vercel.app',
      'https://vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      console.log('Origin in allowed list - allowing request');
      return callback(null, true);
    }
    
    // For development - allow any localhost
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      console.log('Local development - allowing request');
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    console.log('Allowed origins:', allowedOrigins);
    
    // In production, be more lenient to avoid blocking legitimate requests
    if (process.env.NODE_ENV === 'production') {
      console.log('Production mode: Allowing request anyway');
      return callback(null, true);
    }
    
    return callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
  },
  credentials: true, // Allow credentials for authentication
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with', 'Access-Control-Allow-Origin'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));

// EMERGENCY: Ultra-permissive CORS if needed
// Uncomment the next 4 lines if deployment still has CORS issues
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Fallback CORS headers for production
app.use((req, res, next) => {
  // Set CORS headers manually as fallback
  const origin = req.headers.origin;
  if (origin && (
    origin.includes('vercel.app') || 
    origin.includes('saloon-booking-system') || 
    origin.includes('localhost') ||
    process.env.NODE_ENV === 'production'
  )) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-requested-with');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Add explicit OPTIONS handling for debugging
app.options('*', (req, res) => {
  logger.debug('OPTIONS preflight request:', {
    origin: req.headers.origin,
    method: req.headers['access-control-request-method'],
    headers: req.headers['access-control-request-headers']
  });
  res.sendStatus(200);
});

app.use(express.json());
app.use(express.json({ limit: "10mb" })); // handle JSON
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // handle form data

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Apply strict rate limiting to auth endpoints
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/salons/login', authLimiter);
app.use('/api/salons/register', authLimiter);
app.use('/api/admin/login', authLimiter);

// Apply upload rate limiting
app.use('/api/services', uploadLimiter);
app.use('/api/professionals', uploadLimiter);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  logger.success("MongoDB connected");
  
  // Initialize email notification cron jobs after database connection
  try {
    const cronJobManager = require('./utils/cronJobs');
    cronJobManager.initialize();
    logger.success('Cron jobs initialized');
  } catch (error) {
    logger.warn('Cron job initialization failed:', error.message);
    logger.warn('Server will continue without scheduled notifications');
  }
})
.catch((err) => {
  logger.error("MongoDB connection error:", err);
  logger.warn('Server will continue without database connection');
});

// Health check route for debugging CORS
app.get('/api/health', (req, res) => {
  logger.http('Health check called from origin:', req.headers.origin);
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Salon Booking System Backend API - Updated',
    status: 'running',
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    version: '1.1.0',
    allowedOrigins: allowedOrigins
  });
});

app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      heapUsagePercent: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      connections: mongoose.connections.length,
      readyState: mongoose.connection.readyState
    },
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform
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
// app.use('/api/payments', paymentRoutes);

// PAYMENT ROUTES - with error handling
logger.debug('Loading payment routes...');
try {
  const paymentRoutes = require("./routes/paymentRoutes");
  app.use('/api/payments', paymentRoutes);
  logger.debug('Payment routes registered at /api/payments');
} catch (error) {
  logger.warn('Failed to load payment routes:', error.message);
}

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
  res.send('Salon API is running!');
});

// Global error handlers - Production-safe (no process.exit)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  } else {
    logger.warn('Production mode: Server continuing despite error');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  } else {
    logger.warn('Production mode: Server continuing despite error');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.success(`Server is running at http://localhost:${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Production server running on port ${PORT}`);
    logger.info(`CORS enabled for production domains`);
  }
  logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.debug(`Memory limit: ${process.execArgv.find(arg => arg.includes('max-old-space-size')) || 'default'}`);
  logger.debug(`Payment endpoint: POST http://localhost:${PORT}/api/payments/create-payment-intent`);
});

// Handle server errors
server.on('error', (error) => {
  logger.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
});
