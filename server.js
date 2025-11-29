const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require("path");

// Load environment variables
dotenv.config();

// Route imports
const salonRoutes = require("./routes/salonRoutes");
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

const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 CORS Request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('✅ No origin - allowing request');
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin in allowed list - allowing request');
      return callback(null, true);
    }
    
    // Check if origin matches Vercel pattern (more flexible)
    if (origin.includes('vercel.app') && origin.includes('saloon-booking-system')) {
      console.log('✅ Vercel domain detected - allowing request');
      return callback(null, true);
    }
    
    // For development - allow any localhost
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      console.log('✅ Local development - allowing request');
      return callback(null, true);
    }
    
    console.log('❌ CORS blocked origin:', origin);
    console.log('📋 Allowed origins:', allowedOrigins);
    return callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
  },
  credentials: true, // Allow credentials for authentication
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with', 'Access-Control-Allow-Origin'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Middleware
app.use(cors(corsOptions));

// Add explicit OPTIONS handling for debugging
app.options('*', (req, res) => {
  console.log('🔧 OPTIONS preflight request:', {
    origin: req.headers.origin,
    method: req.headers['access-control-request-method'],
    headers: req.headers['access-control-request-headers']
  });
  res.sendStatus(200);
});

app.use(express.json());
app.use(express.json({ limit: "10mb" })); // handle JSON
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // handle form data

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("✅ MongoDB connected");
  
  // Initialize email notification cron jobs after database connection
  const cronJobManager = require('./utils/cronJobs');
  cronJobManager.initialize();
})
.catch((err) => console.error("❌ MongoDB connection error:", err));

// Health check route for debugging CORS
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check called from origin:', req.headers.origin);
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
    message: 'Salon Booking System Backend API',
    status: 'running',
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    allowedOrigins: allowedOrigins
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
app.use('/api/salons', salonRoutes);          // Includes /login and /register
app.use('/api/services', serviceRoutes);
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
console.log('🔄 Loading payment routes...');
try {
  const paymentRoutes = require("./routes/paymentRoutes");
  app.use('/api/payments', paymentRoutes);
  console.log('✅ Payment routes registered at /api/payments');
} catch (error) {
  console.log('❌ Failed to load payment routes:', error.message);
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
  res.send('✅ Salon API is running!');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
  console.log(`💳 Payment endpoint: POST http://localhost:${PORT}/api/payments/create-payment-intent`);
});
