const cron = require('node-cron');
const notificationService = require('../services/notificationService');
const logger = require('./logger');

/**
 * Cron Jobs for Automated Email Notifications
 * Salon Booking System
 */

class CronJobManager {
  constructor() {
    this.jobs = new Map();
  }

  // Initialize all cron jobs
  initialize() {
    logger.debug('Initializing Cron Jobs for Email Notifications...');
    
    try {
      // Daily appointment reminders at 9 AM
      this.setupDailyReminders();
      
      // Feedback request follow-up (day after appointment)
      this.setupFeedbackRequests();
      
      logger.debug('Cron Jobs initialized successfully');
    } catch (error) {
      logger.error('Error initializing cron jobs:', error);
      logger.warn('Continuing without scheduled notifications');
    }
  }

  // Send appointment reminders every day at 9 AM
  setupDailyReminders() {
    const reminderJob = cron.schedule('0 9 * * *', async () => {
      logger.info('Running daily appointment reminders...');
      try {
        const result = await notificationService.sendDailyReminders();
        logger.debug('Daily reminders sent:', result);
      } catch (error) {
        logger.error('Daily reminders failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Colombo' // Sri Lanka timezone
    });

    this.jobs.set('dailyReminders', reminderJob);
    logger.debug('Daily appointment reminders scheduled for 9:00 AM');
  }

  // Send feedback requests every day at 10 AM (for previous day's completed appointments)
  setupFeedbackRequests() {
    const feedbackJob = cron.schedule('0 10 * * *', async () => {
      console.log('Running daily feedback requests...');
      try {
        await this.sendDailyFeedbackRequests();
      } catch (error) {
        console.error('Daily feedback requests failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Colombo'
    });

    this.jobs.set('feedbackRequests', feedbackJob);
    console.log('Daily feedback requests scheduled for 10:00 AM');
  }

  // Send feedback requests for yesterday's completed appointments
  async sendDailyFeedbackRequests() {
    try {
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = yesterday.toISOString().split('T')[0];

      // Import Appointment model
      const Appointment = require('../models/Appointment');

      // Find completed appointments from yesterday that haven't been reviewed
      const completedAppointments = await Appointment.find({
        date: yesterdayDateStr,
        status: 'completed'
      });

      console.log(`Found ${completedAppointments.length} completed appointments from yesterday`);

      let feedbackRequestsSent = 0;

      for (const appointment of completedAppointments) {
        try {
          // Check if feedback already exists
          const Feedback = require('../models/feedbackModel');
          const existingFeedback = await Feedback.findOne({
            appointmentId: appointment._id,
            userEmail: appointment.user.email
          });

          // Only send if no feedback exists
          if (!existingFeedback) {
            const feedbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/feedback?appointment=${appointment._id}`;

            const result = await notificationService.sendFeedbackRequest({
              customerEmail: appointment.user.email,
              customerPhone: appointment.user.phone,
              customerName: appointment.user.name,
              salonName: appointment.salonName,
              serviceName: appointment.serviceName,
              appointmentDate: appointment.date,
              appointmentId: appointment._id,
              feedbackUrl
            });

            if (result.email?.success || result.sms?.success) {
              feedbackRequestsSent++;
              console.log(`Feedback request sent to ${appointment.user.name}`);
            }
          }

        } catch (error) {
          console.error(`Failed to send feedback request for appointment ${appointment._id}:`, error);
        }
      }

      console.log(`Feedback requests complete: ${feedbackRequestsSent}/${completedAppointments.length} sent`);
      return { sent: feedbackRequestsSent, total: completedAppointments.length };

    } catch (error) {
      console.error('Daily feedback requests failed:', error);
      throw error;
    }
  }

  // Start a specific job
  startJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      console.log(`Started cron job: ${jobName}`);
    } else {
      console.error(`❌ Job not found: ${jobName}`);
    }
  }

  // Stop a specific job
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      console.log(`Stopped cron job: ${jobName}`);
    } else {
      console.error(`❌ Job not found: ${jobName}`);
    }
  }

  // Get status of all jobs
  getJobStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running || false,
        scheduled: job.scheduled || false
      };
    });
    return status;
  }

  // Manual trigger for testing
  async triggerDailyReminders() {
    console.log('Manually triggering daily reminders...');
    return await notificationService.sendDailyReminders();
  }

  async triggerFeedbackRequests() {
    console.log('Manually triggering feedback requests...');
    return await this.sendDailyFeedbackRequests();
  }
}

// Create singleton instance
const cronJobManager = new CronJobManager();

module.exports = cronJobManager;