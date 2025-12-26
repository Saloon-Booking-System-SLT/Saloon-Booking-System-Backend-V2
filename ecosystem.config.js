/**
 * PM2 Ecosystem Configuration
 * For production deployment with process management
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop salon-backend
 *   pm2 restart salon-backend
 *   pm2 logs salon-backend
 */

module.exports = {
  apps: [{
    name: 'salon-backend',
    script: 'server.js',
    instances: 1,
    exec_mode: 'cluster',
    
    // Memory management
    max_memory_restart: '400M', // Restart if memory exceeds 400MB
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    
    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Process management
    autorestart: true,
    watch: false, // Set to true for development
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true
  }]
};
