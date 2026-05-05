const axios = require('axios');

// SMS Templates
const smsTemplates = {
  appointmentConfirmation: (data) => {
    const { customerName, salonName, date, time, appointmentId } = data;
    return `Hi ${customerName}! Your appointment at ${salonName} is confirmed on ${date} at ${time}. ID: ${appointmentId}. Reply STOP to unsubscribe.`;
  },
  appointmentReminder: (data) => {
    const { customerName, salonName, date, time } = data;
    return `Reminder: Your appointment at ${salonName} is tomorrow at ${time}. See you then, ${customerName}!`;
  },
  appointmentCancellation: (data) => {
    const { customerName, salonName } = data;
    return `Hi ${customerName}, your appointment at ${salonName} has been cancelled. Please contact us to reschedule.`;
  },
  feedbackRequest: (data) => {
    const { customerName, salonName } = data;
    return `Hi ${customerName}, thank you for visiting ${salonName}! We'd love your feedback. Please reply with your rating (1-5 stars).`;
  },
  appointmentCompletion: (data) => {
    const { customerName, salonName } = data;
    return `Hi ${customerName}, thank you for choosing ${salonName}! We hope you enjoyed our service. Visit us again soon!`;
  }
};

class SMSService {
  constructor() {
    // Standard V3 Endpoint as per user documentation
    this.apiUrl = process.env.SMS_API_URL || 'https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxyURL.php';
    this.username = process.env.SMS_USERNAME;
    this.password = process.env.SMS_PASSWORD;
    this.alias = process.env.SMS_ALIAS || 'TEST';
    this.messageType = parseInt(process.env.SMS_MESSAGE_TYPE || '0');
    this.isConfigured = !!(this.username && this.password);
    
    if (this.isConfigured) {
      console.log(`[SMS Service] Mobitel Doc-Spec initialized successfully`);
      console.log(`   User: ${this.username}`);
      console.log(`   Alias: ${this.alias}`);
      console.log(`   URL: ${this.apiUrl}`);
    } else {
      console.log('[SMS Service] Mobitel Doc-Spec not configured - SMS notifications disabled');
    }
  }

  /**
   * Send SMS via Mobitel API matching exact documentation spec
   * @param {string} to - Recipient phone number
   * @param {string} message - SMS message text
   * @returns {Promise<Object>} Response from API
   */
  async sendSMS(to, message) {
    if (!this.isConfigured) {
      console.log('[SMS Service] not configured - skipping SMS');
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      if (!to || !message) {
        return { success: false, error: 'Missing recipient number or message' };
      }

      // Format phone number to 07XXXXXXXX as per documentation example
      let formattedTo = to.replace(/[^0-9]/g, '');
      if (formattedTo.startsWith('94')) {
        formattedTo = '0' + formattedTo.substring(2);
      } else if (!formattedTo.startsWith('0')) {
        formattedTo = '0' + formattedTo;
      }

      // Ensure message is within 160 characters
      const truncatedMessage = this.truncateMessage(message);

      console.log(`[SMS Service] Sending SMS to ${formattedTo} using exact documentation spec...`);
      
      // Mobitel Documentation "Request Body" structure:
      const payload = {
        username: this.username,
        password: this.password,
        from: this.alias,
        to: formattedTo,
        text: truncatedMessage,
        messageType: this.messageType,
        mesageType: this.messageType // Include the typo from documentation just in case
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log('[SMS Service] Mobitel API Response Status:', response.status);
      console.log('[SMS Service] Mobitel API Response Data:', JSON.stringify(response.data));

      const responseData = response.data;
      const responseCode = responseData?.code || parseInt(responseData) || response.status;
      
      if (responseCode === 200 || response.status === 200) {
        console.log(`[SMS Service] SMS sent successfully to ${formattedTo}`);
        return { 
          success: true, 
          to: formattedTo,
          service: 'Mobitel SMS Doc-Spec',
          apiResponse: responseData
        };
      } else {
        const errorMsg = this.getErrorMessage(responseCode);
        console.error(`[SMS Service] API error: ${errorMsg} (Code: ${responseCode})`);
        return { 
          success: false, 
          error: errorMsg,
          code: responseCode
        };
      }

    } catch (error) {
      console.error(`❌ SMS sending failed: ${error.message}`);
      
      let suggestion = '';
      if (error.code === 'ETIMEDOUT') {
        suggestion = 'SMS API timeout - check network connectivity';
      } else if (error.code === 'ECONNREFUSED') {
        suggestion = 'Could not connect to SMS API - check URL and firewall settings';
      } else if (error.response?.status === 401) {
        suggestion = 'Authentication failed - check SMS_USERNAME and SMS_PASSWORD';
      }

      return { 
        success: false, 
        error: error.message,
        suggestion: suggestion
      };
    }
  }

  /**
   * Validate Sri Lankan phone number format
   * Accepts formats: 07XXXXXXXX, 0771XXXXXX, +94771XXXXXX
   */
  validatePhoneNumber(phone) {
    if (!phone) return false;
    
    // Remove any spaces or dashes
    const cleaned = phone.replace(/[-\s]/g, '');
    
    // Sri Lankan mobile patterns
    const sriLankanMobileRegex = /^(?:0|0094|\+94)?([67][0-9]{8})$/;
    
    return sriLankanMobileRegex.test(cleaned);
  }

  /**
   * Format phone number to standard format for API
   * Converts to 07XXXXXXXX or 0771XXXXXX format
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove any non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Sri Lankan mobile patterns: should end with 9 digits starting with 7 or 6
    // e.g. 771234567 or 671234567
    const match = cleaned.match(/([67][0-9]{8})$/);
    
    if (match) {
      // Prepend 94 for standard format
      return '94' + match[1];
    }
    
    return null;
  }

  /**
   * Truncate message to 160 characters (SMS standard limit)
   */
  truncateMessage(message) {
    const maxLength = 160;
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 3) + '...';
    }
    return message;
  }

  /**
   * Get human-readable error message from Mobitel API response code
   */
  getErrorMessage(code) {
    const errorMessages = {
      200: 'Message received OK',
      151: 'Invalid session',
      152: 'Session is still in use for previous request',
      155: 'Service halted',
      156: 'Other network messaging disabled',
      157: 'IDD messages disabled',
      159: 'Failed credit check',
      160: 'No message found',
      161: 'Message exceeding 160 characters',
      162: 'Invalid message type found',
      164: 'Invalid group',
      165: 'No recipients found',
      166: 'Recipient list exceeding allowed limit',
      167: 'Invalid long number',
      168: 'Invalid short code',
      169: 'Invalid alias',
      170: 'Black listed numbers in number list',
      171: 'Non-white listed numbers in number list'
    };
    
    return errorMessages[code] || `Unknown error (Code: ${code})`;
  }

  /**
   * Send templated SMS
   */
  async sendTemplatedSMS(to, template, data) {
    if (!smsTemplates[template]) {
      console.warn(`⚠️ Unknown SMS template: ${template}`);
      return { success: false, error: `Unknown template: ${template}` };
    }

    try {
      const message = smsTemplates[template](data);
      const formattedPhone = this.formatPhoneNumber(to);
      
      if (!formattedPhone) {
        return { success: false, error: 'Invalid phone number' };
      }

      return await this.sendSMS(formattedPhone, message);
    } catch (error) {
      console.error(`❌ Templated SMS error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk SMS to multiple recipients
   */
  async sendBulkSMS(recipients, message) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }

    const results = [];
    
    for (const recipient of recipients) {
      const result = await this.sendSMS(recipient, message);
      results.push({
        to: recipient,
        ...result
      });
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Bulk SMS Results: ${successCount}/${results.length} successful`);
    
    return {
      success: successCount === results.length,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results: results
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isConfigured,
      service: 'Mobitel SMS V3',
      configured: this.isConfigured,
      alias: this.alias,
      messageType: (this.messageType === '0' || this.messageType === 0) ? 'Non-Promotional' : 'Promotional',
      apiUrl: this.apiUrl.substring(0, 50) + '...'
    };
  }
}

// Create and export singleton instance
const smsService = new SMSService();

module.exports = smsService;
