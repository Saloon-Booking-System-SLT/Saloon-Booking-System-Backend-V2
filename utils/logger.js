/**
 * Production-safe logger utility
 * Reduces console output in production for better performance
 */

const isDev = process.env.NODE_ENV !== 'production';

const logger = {
  /**
   * Info level logs - only in development
   */
  info: (...args) => {
    if (isDev) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Error level logs - always logged
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Warning level logs - only in development
   */
  warn: (...args) => {
    if (isDev) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Debug level logs - only in development
   */
  debug: (...args) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Success level logs - only in development
   */
  success: (...args) => {
    if (isDev) {
      console.log('[SUCCESS]', ...args);
    }
  },

  /**
   * HTTP request logs - only in development
   */
  http: (...args) => {
    if (isDev) {
      console.log('[HTTP]', ...args);
    }
  }
};

module.exports = logger;
