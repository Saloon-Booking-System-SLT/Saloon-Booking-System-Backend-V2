const nodemailer = require('nodemailer');

// Load environment variables if not already loaded
if (!process.env.EMAIL_USER) {
  require('dotenv').config();
}

// Professional Email Service - Based on DQMS Success Pattern
class EmailService {
  constructor() {
    this.transporter = null;
    this.isConnected = false;
    this.initialize();
  }

  // Initialize Gmail SMTP with professional configuration
  initialize() {
    try {
      console.log('📧 Initializing Professional Email Service (DQMS-style)...');
      
      // Validate environment variables
      const emailUser = process.env.EMAIL_USER;
      const emailPassword = process.env.EMAIL_PASSWORD;
      
      if (!emailUser || !emailPassword) {
        throw new Error('Email credentials not found in environment variables');
      }

      console.log('🔧 Email Configuration:', {
        user: emailUser.substring(0, 3) + '***@' + emailUser.split('@')[1],
        host: 'smtp.gmail.com',
        port: 587,
        secure: false
      });

      // Professional Gmail SMTP Configuration
      const config = {
        service: 'gmail',
        host: 'smtp.gmail.com', 
        port: parseInt(process.env.EMAIL_PORT) || 465, // Try 465 (SSL) if 587 is blocked
        secure: (process.env.EMAIL_PORT === '465') ? true : false, // SSL for 465, STARTTLS for 587
        auth: {
          user: emailUser,
          pass: emailPassword
        },
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        },
        // Professional timeout settings
        connectionTimeout: 60000, // 60 seconds
        greetingTimeout: 30000,   // 30 seconds
        socketTimeout: 60000,     // 60 seconds
        // Connection pooling for reliability
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        // Additional options
        logger: false,
        debug: process.env.NODE_ENV === 'development'
      };

      this.transporter = nodemailer.createTransport(config);
      
      console.log('✅ Professional Email Service initialized successfully');
      
      // Test connection
      this.testConnection();
      
    } catch (error) {
      console.error('❌ Email Service initialization failed:', error.message);
      this.transporter = null;
    }
  }

  // Test SMTP connection
  async testConnection() {
    if (!this.transporter) {
      console.log('❌ No transporter available for testing');
      return false;
    }

    try {
      console.log('🔍 Testing Gmail SMTP connection...');
      await this.transporter.verify();
      console.log('✅ Gmail SMTP connection test successful');
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('❌ Gmail SMTP connection test failed:', {
        message: error.message,
        code: error.code,
        command: error.command
      });

      // Provide helpful suggestions
      if (error.code === 'ETIMEDOUT') {
        console.log('💡 Suggestion: SMTP ports may be blocked by hosting provider');
      } else if (error.responseCode === 535) {
        console.log('💡 Suggestion: Check Gmail app password and 2FA settings');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('💡 Suggestion: Check network connectivity and firewall settings');
      }

      this.isConnected = false;
      return false;
    }
  }

  // Professional email sending with retry logic
  async sendEmail(mailOptions, retryCount = 3) {
    if (!this.transporter) {
      console.log('⚠️ Email service not available');
      return { success: false, error: 'Email service not configured' };
    }

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`📧 Sending email (attempt ${attempt}/${retryCount})...`);
        console.log('📝 Email details:', {
          from: mailOptions.from,
          to: mailOptions.to,
          subject: mailOptions.subject
        });

        const result = await this.transporter.sendMail(mailOptions);
        
        console.log('✅ Email sent successfully:', {
          messageId: result.messageId,
          response: result.response,
          attempt: attempt
        });

        return { 
          success: true, 
          messageId: result.messageId,
          attempt: attempt,
          service: 'Gmail SMTP'
        };

      } catch (error) {
        console.error(`❌ Email sending failed (attempt ${attempt}/${retryCount}):`, {
          message: error.message,
          code: error.code,
          command: error.command,
          response: error.response
        });

        // If it's the last attempt, return the error
        if (attempt === retryCount) {
          // Provide helpful error messages
          let suggestion = '';
          if (error.code === 'ETIMEDOUT') {
            suggestion = 'SMTP connection timeout - ports may be blocked';
          } else if (error.responseCode === 535) {
            suggestion = 'Authentication failed - check Gmail app password';
          } else if (error.code === 'ECONNREFUSED') {
            suggestion = 'Connection refused - check network connectivity';
          }

          return { 
            success: false, 
            error: error.message,
            code: error.code,
            suggestion: suggestion,
            attempts: retryCount
          };
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Create standardized mail options
  createMailOptions(to, subject, htmlContent, textContent) {
    const fromEmail = process.env.EMAIL_USER || 'saloonbookingsystem@gmail.com';
    
    return {
      from: `"Salon Booking System" <${fromEmail}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent,
      // Professional headers
      headers: {
        'X-Mailer': 'Salon Booking System',
        'X-Priority': '1',
        'Importance': 'high'
      }
    };
  }

  // Get service status
  getStatus() {
    return {
      initialized: !!this.transporter,
      connected: this.isConnected,
      service: 'Gmail SMTP',
      user: process.env.EMAIL_USER ? 
        process.env.EMAIL_USER.substring(0, 3) + '***@' + process.env.EMAIL_USER.split('@')[1] : 
        'Not configured'
    };
  }

  // Reinitialize service if needed
  async reinitialize() {
    console.log('🔄 Reinitializing Email Service...');
    this.transporter = null;
    this.isConnected = false;
    this.initialize();
    return await this.testConnection();
  }
}

// Create and export singleton instance
const emailService = new EmailService();

module.exports = emailService;