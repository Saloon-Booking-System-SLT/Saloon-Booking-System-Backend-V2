// File: config/db.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://hesh2002:sas2002@cluster0.1sdbow8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 30000, // Keep trying to send operations for 30 seconds
      heartbeatFrequencyMS: 2000, // Check server health every 2 seconds
      retryWrites: true, // Automatically retry failed writes
      retryReads: true, // Automatically retry failed reads
    });
    logger.success('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection error:', err.message);
    // Don't exit process, let the app handle graceful degradation
    logger.warn('Server will continue without database connection');
  }
};

module.exports = connectDB;
