const emailService = require('./emailService');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail'); // SendGrid API

// SendGrid configuration for production
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('📧 SendGrid API initialized for production');
}

// Enhanced Gmail SMTP configuration for production
const createEmailTransporter = () => {
  try {
    console.log('📧 Creating enhanced Gmail SMTP transporter...');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.EMAIL_USER || 'saloonbookingsystem@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'buvl bjbt lfom zijs'
      },
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      },
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 60000, // 60 seconds
      pool: false, // Disable pooling for better compatibility
      maxConnections: 1,
      maxMessages: 1
    });

    console.log('📧 Enhanced Gmail SMTP transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Gmail SMTP configuration failed:', error);
    return null;
  }
};

// Twilio client configuration
const createTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // Only create Twilio client if proper credentials are provided
  if (accountSid && authToken && accountSid.trim() !== '' && authToken.trim() !== '' && accountSid.startsWith('AC')) {
    try {
      return twilio(accountSid, authToken);
    } catch (error) {
      console.warn('⚠️ Twilio initialization failed:', error.message);
      return null;
    }
  }
  
  console.log('📱 Twilio not configured - SMS notifications disabled');
  return null;
};

// Email templates
const emailTemplates = {
  appointmentConfirmation: (data) => {
    const { customerName, salonName, serviceName, date, time, totalAmount, appointmentId } = data;
    return {
      subject: `Appointment Confirmed - ${salonName}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment Confirmation</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #2c3e50; 
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .email-container { 
                    max-width: 650px; 
                    margin: 40px auto; 
                    background: #ffffff; 
                    border-radius: 16px; 
                    box-shadow: 0 20px 60px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: #ffffff; 
                    padding: 40px 30px; 
                    text-align: center;
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
                }
                .header h1 { 
                    font-size: 28px; 
                    font-weight: 600; 
                    margin-bottom: 8px;
                    position: relative;
                    z-index: 1;
                }
                .booking-id { 
                    background: rgba(255,255,255,0.15); 
                    padding: 8px 16px; 
                    border-radius: 25px; 
                    font-weight: 500; 
                    letter-spacing: 1px;
                    position: relative;
                    z-index: 1;
                }
                .content { padding: 40px 30px; }
                .greeting { 
                    font-size: 18px; 
                    color: #2c3e50; 
                    margin-bottom: 16px;
                    font-weight: 500;
                }
                .intro-text { 
                    color: #546e7a; 
                    margin-bottom: 30px; 
                    font-size: 16px;
                }
                .appointment-card { 
                    background: linear-gradient(135deg, #f8fbff 0%, #f1f8ff 100%); 
                    border: 1px solid #e3f2fd;
                    padding: 30px; 
                    border-radius: 12px; 
                    margin: 25px 0;
                    box-shadow: 0 4px 20px rgba(103,126,234,0.08);
                }
                .card-title { 
                    font-size: 20px; 
                    font-weight: 600; 
                    color: #1a237e; 
                    margin-bottom: 20px;
                    text-align: center;
                }
                .salon-name {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    font-size: 24px;
                    font-weight: 700;
                    text-align: center;
                    margin-bottom: 20px;
                    color: #667eea; /* Fallback for non-webkit browsers */
                }
                .detail-grid { 
                    display: grid; 
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-bottom: 20px;
                }
                .detail-item { 
                    padding: 16px;
                    background: #ffffff;
                    border-radius: 8px;
                    border-left: 4px solid #667eea;
                }
                .detail-label { 
                    font-size: 12px; 
                    text-transform: uppercase; 
                    letter-spacing: 1px; 
                    color: #78909c; 
                    margin-bottom: 4px;
                    font-weight: 600;
                }
                .detail-value { 
                    font-size: 16px; 
                    font-weight: 600; 
                    color: #263238;
                }
                .amount-highlight {
                    background: linear-gradient(135deg, #4caf50, #66bb6a);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    font-size: 18px;
                    font-weight: 700;
                    color: #4caf50; /* Fallback */
                }
                .info-section { 
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); 
                    border: 1px solid #ffcc02;
                    padding: 25px; 
                    border-radius: 12px; 
                    margin: 25px 0;
                    box-shadow: 0 4px 20px rgba(255,193,7,0.08);
                }
                .info-title { 
                    font-size: 18px; 
                    font-weight: 600; 
                    color: #e65100; 
                    margin-bottom: 16px;
                }
                .info-list { 
                    list-style: none; 
                    padding: 0;
                }
                .info-list li { 
                    color: #bf360c; 
                    margin: 12px 0; 
                    padding-left: 20px;
                    position: relative;
                    line-height: 1.5;
                }
                .info-list li::before {
                    content: '✓';
                    position: absolute;
                    left: 0;
                    color: #ff8f00;
                    font-weight: bold;
                }
                .contact-info { 
                    background: linear-gradient(135deg, #e8f5e8 0%, #f1f8e9 100%); 
                    padding: 20px; 
                    border-radius: 12px; 
                    margin: 25px 0;
                    text-align: center;
                    border: 1px solid #c8e6c9;
                }
                .footer { 
                    background: #f8f9fa; 
                    padding: 30px; 
                    text-align: center; 
                    border-top: 1px solid #e9ecef;
                }
                .footer-text { 
                    color: #6c757d; 
                    font-size: 14px; 
                    line-height: 1.5;
                    margin-bottom: 8px;
                }
                .company-signature {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #dee2e6;
                }
                .company-name {
                    font-weight: 600;
                    color: #495057;
                }
                @media (max-width: 600px) {
                    .email-container { margin: 20px; }
                    .content { padding: 30px 20px; }
                    .detail-grid { grid-template-columns: 1fr; }
                    .header { padding: 30px 20px; }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>Appointment Confirmed</h1>
                    <div class="booking-id">Booking ID: ${appointmentId}</div>
                </div>
                
                <div class="content">
                    <div class="greeting">Dear ${customerName},</div>
                    <div class="intro-text">
                        Great news! Your appointment has been confirmed. We're excited to see you and provide you with exceptional service.
                    </div>

                    <div class="salon-name">${salonName}</div>
                    
                    <div class="appointment-card">
                        <div class="card-title">Appointment Details</div>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Service</div>
                                <div class="detail-value">${serviceName}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Date</div>
                                <div class="detail-value">${date}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Time</div>
                                <div class="detail-value">${time}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Total Amount</div>
                                <div class="detail-value amount-highlight">LKR ${totalAmount}</div>
                            </div>
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="info-title">What to Expect</div>
                        <ul class="info-list">
                            <li>Please arrive 10 minutes before your appointment time</li>
                            <li>Bring a valid ID if this is your first visit</li>
                            <li>Let us know if you need to reschedule at least 24 hours in advance</li>
                            <li>Our team will be ready to provide you with exceptional service</li>
                        </ul>
                    </div>

                    <div class="contact-info">
                        <strong>Need to make changes or have questions?</strong><br>
                        Please contact the salon directly for any assistance.
                    </div>

                    <div style="text-align: center; margin-top: 30px; color: #546e7a; font-size: 16px;">
                        Thank you for choosing <strong>${salonName}</strong>!
                    </div>
                </div>

                <div class="footer">
                    <div class="footer-text">
                        This is an automated confirmation email from the Salon Booking System.
                    </div>
                    <div class="footer-text">
                        Please do not reply to this email. For support, contact the salon directly.
                    </div>
                    <div class="company-signature">
                        <div class="company-name">Salon Booking System</div>
                        <div style="color: #868e96; font-size: 12px; margin-top: 5px;">
                            Professional salon management solution
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `
        Appointment Confirmed!
        
        Dear ${customerName},
        
        Your appointment has been confirmed. Here are the details:
        
        Salon: ${salonName}
        Service: ${serviceName}
        Date: ${date}
        Time: ${time}
        Total Amount: LKR ${totalAmount}
        Booking ID: ${appointmentId}
        
        Please arrive 10 minutes early and bring a valid ID if it's your first visit.
        
        Thank you for choosing ${salonName}!
        
        - Salon Booking System
      `
    };
  },

  appointmentReminder: (data) => {
    const { customerName, salonName, serviceName, date, time, salonPhone } = data;
    return {
      subject: `⏰ Reminder: Your appointment tomorrow at ${salonName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%); color: #2d3436; padding: 30px 20px; text-align: center; }
                .content { padding: 30px; }
                .appointment-summary { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⏰ Appointment Reminder</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${customerName}</strong>,</p>
                    <p>This is a friendly reminder about your appointment <strong>tomorrow</strong>:</p>
                    
                    <div class="appointment-summary">
                        <h3 style="margin-top: 0;">📅 Tomorrow's Appointment</h3>
                        <p><strong>Salon:</strong> ${salonName}</p>
                        <p><strong>Service:</strong> ${serviceName}</p>
                        <p><strong>Date:</strong> ${date}</p>
                        <p><strong>Time:</strong> ${time}</p>
                        ${salonPhone ? `<p><strong>Contact:</strong> ${salonPhone}</p>` : ''}
                    </div>

                    <p>See you tomorrow! If you need to make any changes, please contact the salon as soon as possible.</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  passwordReset: (data) => {
    const { customerName, resetToken, resetUrl } = data;
    return {
      subject: '🔒 Reset Your Salon Booking Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 30px 20px; text-align: center; }
                .content { padding: 30px; }
                .reset-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 20px 0; font-weight: bold; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔒 Password Reset Request</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${customerName}</strong>,</p>
                    <p>We received a request to reset your password for your Salon Booking System account.</p>
                    
                    <div style="text-align: center;">
                        <a href="${resetUrl}" class="reset-button">Reset Your Password</a>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Important:</strong>
                        <ul>
                            <li>This link will expire in 1 hour for security reasons</li>
                            <li>If you didn't request this reset, please ignore this email</li>
                            <li>Never share this link with anyone</li>
                        </ul>
                    </div>
                    
                    <p>If the button doesn't work, copy and paste this link:</p>
                    <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Dear ${customerName},
        
        We received a request to reset your password.
        
        Click this link to reset your password: ${resetUrl}
        
        This link expires in 1 hour.
        
        If you didn't request this, please ignore this email.
        
        - Salon Booking System
      `
    };
  },

  promotionalEmail: (data) => {
    const { customerName, promotionTitle, promotionDescription, discountPercentage, validUntil, salonName, promotionCode } = data;
    return {
      subject: `🎉 Special Offer: ${promotionTitle} - ${salonName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; padding: 40px 20px; text-align: center; }
                .content { padding: 30px; }
                .discount-badge { background: linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%); color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; margin: 20px auto; }
                .promo-code { background: #ddd; padding: 15px; border-radius: 8px; font-size: 18px; font-weight: bold; text-align: center; border: 2px dashed #00b894; margin: 20px 0; }
                .cta-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 20px 0; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Special Offer Just For You!</h1>
                    <p>${promotionTitle}</p>
                </div>
                <div class="content">
                    <p>Dear <strong>${customerName}</strong>,</p>
                    
                    <div class="discount-badge">
                        ${discountPercentage}% OFF
                    </div>
                    
                    <div style="text-align: center;">
                        <h2 style="color: #00b894;">${promotionTitle}</h2>
                        <p style="font-size: 16px; color: #636e72;">${promotionDescription}</p>
                    </div>
                    
                    ${promotionCode ? `<div class="promo-code">
                        Use Code: <span style="color: #00b894;">${promotionCode}</span>
                    </div>` : ''}
                    
                    <div style="text-align: center;">
                        <a href="#" class="cta-button">Book Your Appointment Now</a>
                    </div>
                    
                    <p style="text-align: center; color: #e17055; font-weight: bold;">⏰ Offer valid until ${validUntil}</p>
                    
                    <p>Thank you for being a valued customer of <strong>${salonName}</strong>!</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  feedbackRequest: (data) => {
    const { customerName, salonName, serviceName, appointmentDate, feedbackUrl, appointmentId } = data;
    return {
      subject: `💭 How was your experience at ${salonName}?`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%); color: white; padding: 30px 20px; text-align: center; }
                .content { padding: 30px; }
                .stars { font-size: 30px; text-align: center; margin: 20px 0; }
                .feedback-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 20px 0; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💭 Your Feedback Matters!</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${customerName}</strong>,</p>
                    
                    <p>Thank you for visiting <strong>${salonName}</strong> on ${appointmentDate} for your ${serviceName} service!</p>
                    
                    <p>We'd love to hear about your experience. Your feedback helps us provide better service to you and other customers.</p>
                    
                    <div class="stars">⭐⭐⭐⭐⭐</div>
                    
                    <div style="text-align: center;">
                        <a href="${feedbackUrl}" class="feedback-button">Share Your Feedback</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #636e72; text-align: center;">Takes less than 2 minutes • Your honest opinion helps us improve</p>
                    
                    <p>Thank you for choosing <strong>${salonName}</strong>!</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  ownerNewBooking: (data) => {
    const { ownerName, salonName, customerName, serviceName, date, time, totalAmount, customerPhone } = data;
    return {
      subject: `🔔 New Booking - ${salonName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; padding: 30px 20px; text-align: center; }
                .content { padding: 30px; }
                .booking-details { background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔔 New Booking Alert</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${ownerName}</strong>,</p>
                    <p>You have received a new booking for <strong>${salonName}</strong>:</p>
                    
                    <div class="booking-details">
                        <h3 style="margin-top: 0;">📋 Booking Details</h3>
                        <p><strong>Customer:</strong> ${customerName}</p>
                        <p><strong>Service:</strong> ${serviceName}</p>
                        <p><strong>Date:</strong> ${date}</p>
                        <p><strong>Time:</strong> ${time}</p>
                        <p><strong>Amount:</strong> LKR ${totalAmount}</p>
                        ${customerPhone ? `<p><strong>Customer Phone:</strong> ${customerPhone}</p>` : ''}
                    </div>

                    <p>Please log in to your dashboard to manage this booking.</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  }
};

// SMS templates
const smsTemplates = {
  appointmentConfirmation: (data) => {
    const { customerName, salonName, date, time, appointmentId } = data;
    return `✅ Appointment Confirmed!\n\nHi ${customerName}, your appointment at ${salonName} is confirmed for ${date} at ${time}.\n\nBooking ID: ${appointmentId}\n\nThank you! - Salon Booking System`;
  },

  appointmentReminder: (data) => {
    const { customerName, salonName, date, time } = data;
    return `⏰ Reminder: Hi ${customerName}, you have an appointment tomorrow at ${salonName} on ${date} at ${time}. See you there!`;
  },

  passwordReset: (data) => {
    const { customerName, resetUrl } = data;
    return `🔒 Password Reset: Hi ${customerName}, click here to reset your password: ${resetUrl} (expires in 1 hour)`;
  },

  feedbackRequest: (data) => {
    const { customerName, salonName, feedbackUrl } = data;
    return `💭 Hi ${customerName}! How was your experience at ${salonName}? Share your feedback: ${feedbackUrl}`;
  }
};

class NotificationService {
  constructor() {
    // Professional Email Service is auto-initialized
    console.log('📧 Professional Email Service Status:', emailService.getStatus());

    try {
      this.twilioClient = createTwilioClient();
      if (this.twilioClient) {
        console.log('📱 Twilio service initialized');
      }
    } catch (error) {
      console.error('❌ Twilio service initialization failed:', error);
      this.twilioClient = null;
    }
  }

  // Test email connection using professional service
  async testEmailConnection() {
    console.log('🔍 Testing Professional Email Service...');
    return await emailService.testConnection();
  }

  // Professional email sending with advanced error handling
  async sendEmail(to, template, data) {
    try {
      console.log(`📧 Preparing ${template} email for: ${to}`);
      
      const emailContent = emailTemplates[template](data);
      
      // Use SendGrid API if available (for production/Render)
      if (process.env.SENDGRID_API_KEY && process.env.NODE_ENV === 'production') {
        return await this.sendEmailViaSendGrid(to, emailContent);
      }
      
      // Fallback to SMTP (for local development)
      const mailOptions = emailService.createMailOptions(
        to,
        emailContent.subject,
        emailContent.html,
        emailContent.text
      );

      // Send with professional retry logic
      const result = await emailService.sendEmail(mailOptions, 3);
      
      if (result.success) {
        console.log('✅ Professional email sent successfully:', {
          to: to,
          template: template,
          messageId: result.messageId,
          service: result.service,
          attempt: result.attempt
        });
      } else {
        console.error('❌ Professional email sending failed:', {
          to: to,
          template: template,
          error: result.error,
          code: result.code,
          suggestion: result.suggestion,
          attempts: result.attempts
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Email preparation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // SendGrid API email sending method
  async sendEmailViaSendGrid(to, emailContent) {
    try {
      const msg = {
        to: to,
        from: process.env.SENDGRID_FROM_EMAIL || 'saloonbookingsystem@gmail.com',
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      };

      console.log('📧 Sending email via SendGrid API...');
      const result = await sgMail.send(msg);
      
      console.log('✅ SendGrid email sent successfully:', {
        to: to,
        messageId: result[0].headers['x-message-id'],
        service: 'SendGrid API'
      });
      
      return {
        success: true,
        messageId: result[0].headers['x-message-id'],
        service: 'SendGrid API'
      };
      
    } catch (error) {
      console.error('❌ SendGrid email failed:', {
        error: error.message,
        code: error.code,
        response: error.response?.body
      });
      
      return {
        success: false,
        error: error.message,
        service: 'SendGrid API'
      };
    }
  }

  // Send SMS notification
  async sendSMS(to, template, data) {
    if (!this.twilioClient) {
      console.log('⚠️ Twilio not configured, skipping SMS');
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const message = smsTemplates[template](data);
      
      console.log(`📱 Sending ${template} SMS to: ${to}`);
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });

      console.log('✅ SMS sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ SMS sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send appointment confirmation (email + SMS)
  async sendAppointmentConfirmation(appointmentData) {
    const {
      customerEmail,
      customerPhone,
      customerName,
      salonName,
      serviceName,
      date,
      time,
      totalAmount,
      appointmentId
    } = appointmentData;

    const results = { email: null, sms: null };

    // Send email confirmation
    if (customerEmail) {
      results.email = await this.sendEmail(customerEmail, 'appointmentConfirmation', {
        customerName,
        salonName,
        serviceName,
        date,
        time,
        totalAmount,
        appointmentId
      });
    }

    // Send SMS confirmation
    if (customerPhone) {
      results.sms = await this.sendSMS(customerPhone, 'appointmentConfirmation', {
        customerName,
        salonName,
        date,
        time,
        appointmentId
      });
    }

    return results;
  }

  // Send appointment reminder
  async sendAppointmentReminder(appointmentData) {
    const {
      customerEmail,
      customerPhone,
      customerName,
      salonName,
      serviceName,
      date,
      time,
      salonPhone
    } = appointmentData;

    const results = { email: null, sms: null };

    if (customerEmail) {
      results.email = await this.sendEmail(customerEmail, 'appointmentReminder', {
        customerName,
        salonName,
        serviceName,
        date,
        time,
        salonPhone
      });
    }

    if (customerPhone) {
      results.sms = await this.sendSMS(customerPhone, 'appointmentReminder', {
        customerName,
        salonName,
        date,
        time
      });
    }

    return results;
  }

  // Notify salon owner of new booking
  async notifyOwnerNewBooking(ownerData, appointmentData) {
    const {
      ownerEmail,
      ownerName,
      salonName
    } = ownerData;

    const {
      customerName,
      serviceName,
      date,
      time,
      totalAmount,
      customerPhone
    } = appointmentData;

    if (ownerEmail) {
      return await this.sendEmail(ownerEmail, 'ownerNewBooking', {
        ownerName,
        salonName,
        customerName,
        serviceName,
        date,
        time,
        totalAmount,
        customerPhone
      });
    }

    return { success: false, error: 'Owner email not provided' };
  }

  // Send password reset email
  async sendPasswordReset(resetData) {
    const { customerEmail, customerName, resetToken, resetUrl } = resetData;
    
    if (customerEmail) {
      return await this.sendEmail(customerEmail, 'passwordReset', {
        customerName,
        resetToken,
        resetUrl
      });
    }
    
    return { success: false, error: 'Customer email not provided' };
  }

  // Send promotional email
  async sendPromotionalEmail(promotionData) {
    const {
      customerEmail,
      customerName,
      promotionTitle,
      promotionDescription,
      discountPercentage,
      validUntil,
      salonName,
      promotionCode
    } = promotionData;
    
    if (customerEmail) {
      return await this.sendEmail(customerEmail, 'promotionalEmail', {
        customerName,
        promotionTitle,
        promotionDescription,
        discountPercentage,
        validUntil,
        salonName,
        promotionCode
      });
    }
    
    return { success: false, error: 'Customer email not provided' };
  }

  // Send feedback request email
  async sendFeedbackRequest(feedbackData) {
    const {
      customerEmail,
      customerPhone,
      customerName,
      salonName,
      serviceName,
      appointmentDate,
      appointmentId,
      feedbackUrl
    } = feedbackData;

    const results = { email: null, sms: null };

    if (customerEmail) {
      results.email = await this.sendEmail(customerEmail, 'feedbackRequest', {
        customerName,
        salonName,
        serviceName,
        appointmentDate,
        appointmentId,
        feedbackUrl
      });
    }

    if (customerPhone) {
      results.sms = await this.sendSMS(customerPhone, 'feedbackRequest', {
        customerName,
        salonName,
        feedbackUrl
      });
    }

    return results;
  }

  // Bulk email sending for promotions
  async sendBulkPromotionalEmails(customerList, promotionData) {
    console.log(`📧 Sending promotional emails to ${customerList.length} customers...`);
    
    const results = {
      success: 0,
      failed: 0,
      results: []
    };

    for (const customer of customerList) {
      try {
        const emailData = {
          customerEmail: customer.email,
          customerName: customer.name,
          ...promotionData
        };
        
        const result = await this.sendPromotionalEmail(emailData);
        
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
        }
        
        results.results.push({
          email: customer.email,
          success: result.success,
          error: result.error
        });
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to send to ${customer.email}:`, error);
        results.failed++;
        results.results.push({
          email: customer.email,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Bulk email complete: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  // Schedule appointment reminders (to be called by a cron job)
  async sendDailyReminders() {
    try {
      console.log('📅 Checking for appointments to remind...');
      
      // Get tomorrow's date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Import Appointment model
      const Appointment = require('../models/Appointment');
      
      // Find appointments for tomorrow
      const tomorrowAppointments = await Appointment.find({
        date: tomorrowDateStr,
        status: { $nin: ['cancelled', 'completed'] }
      });
      
      console.log(`📧 Found ${tomorrowAppointments.length} appointments for tomorrow`);
      
      let remindersent = 0;
      
      for (const appointment of tomorrowAppointments) {
        try {
          const reminderData = {
            customerEmail: appointment.user.email,
            customerPhone: appointment.user.phone,
            customerName: appointment.user.name,
            salonName: appointment.salonName,
            serviceName: appointment.serviceName,
            date: appointment.date,
            time: appointment.time,
            salonPhone: appointment.salonPhone
          };
          
          const result = await this.sendAppointmentReminder(reminderData);
          
          if (result.email?.success || result.sms?.success) {
            remindersent++;
            console.log(`✅ Reminder sent to ${appointment.user.name}`);
          }
          
        } catch (error) {
          console.error(`❌ Failed to send reminder for appointment ${appointment._id}:`, error);
        }
      }
      
      console.log(`📊 Daily reminders complete: ${remindersent}/${tomorrowAppointments.length} sent`);
      return { sent: remindersent, total: tomorrowAppointments.length };
      
    } catch (error) {
      console.error('❌ Daily reminders failed:', error);
      return { error: error.message };
    }
  }
}

// Create and export singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;