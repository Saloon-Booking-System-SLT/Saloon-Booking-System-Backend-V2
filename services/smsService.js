// services/smsService.js
const axios = require('axios');

const SMS_CONFIG = {
  baseURL: process.env.SMS_BASE_URL || 'https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxy.php',
  username: process.env.SMS_USERNAME,
  password: process.env.SMS_PASSWORD,
  alias: process.env.SMS_ALIAS, // e.g. "SalonApp"
  type: 0 // 0 = transactional, 1 = promotional
};

/**
 * Format Sri Lankan numbers to international format
 * 0771234567 -> 94771234567
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;

  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    return '94' + cleaned.substring(1);
  }

  if (cleaned.startsWith('94')) {
    return cleaned;
  }

  // fallback (just return cleaned)
  return cleaned;
}

/**
 * Trim message to 160 chars (gateway limit)
 */
function normalizeMessage(message) {
  if (!message) return '';

  if (message.length > 160) {
    console.warn('SMS truncated to 160 chars');
    return message.substring(0, 160);
  }

  return message;
}

/**
 * Send SMS via Mobitel gateway
 */
async function sendSMS({ to, message }) {
  try {
    if (!to || !message) {
      throw new Error('Missing "to" or "message"');
    }

    const phone = formatPhoneNumber(to);
    const msg = normalizeMessage(message);

    const response = await axios.get(SMS_CONFIG.baseURL, {
      params: {
        m: msg,
        r: phone,
        a: SMS_CONFIG.alias,
        u: SMS_CONFIG.username,
        p: SMS_CONFIG.password,
        t: SMS_CONFIG.type
      },
      timeout: 10000
    });

    const code = Number(response.data);

    if (code === 200) {
      return {
        success: true,
        code: 200,
        message: 'SMS sent successfully'
      };
    }

    // Handle known gateway errors
    const errorMap = {
      151: 'Invalid session',
      152: 'Session in use',
      155: 'Service halted',
      159: 'Insufficient credits',
      160: 'No message found',
      161: 'Message too long',
      167: 'Invalid phone number',
      169: 'Invalid sender alias'
    };

    return {
      success: false,
      code,
      error: errorMap[code] || 'Unknown SMS error'
    };

  } catch (error) {
    console.error('SMS Service Error:', error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prebuilt message templates (optional but useful)
 */
function buildAppointmentMessage({ name, salonName, date, time }) {
  return `Hi ${name}, your appointment at ${salonName} is confirmed on ${date} at ${time}.`;
}

module.exports = {
  sendSMS,
  buildAppointmentMessage
};