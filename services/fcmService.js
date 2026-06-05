const admin = require('firebase-admin');
const User = require('../models/User');

// ─────────────────────────────────────────────
// Firebase Admin — single initialisation guard
// ─────────────────────────────────────────────
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized || admin.apps.length > 0) return;

  try {
    const projectId    = process.env.FIREBASE_PROJECT_ID;
    const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey   = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('⚠️  Firebase Admin: Missing FIREBASE_* env vars — push notifications disabled.');
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        // .env stores \n as literal \\n — convert back to actual newlines
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
  } catch (err) {
    console.error('❌ Firebase Admin init failed:', err.message);
  }
};

// Initialise on module load
initializeFirebase();

// ─────────────────────────────────────────────
// Core: send a single push to one FCM token
// ─────────────────────────────────────────────
/**
 * Send a raw FCM push notification to a single device token.
 *
 * @param {string} fcmToken  - Device registration token
 * @param {string} title     - Notification title
 * @param {string} body      - Notification body text
 * @param {Object} data      - Optional key-value data payload (all values must be strings)
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!firebaseInitialized && admin.apps.length === 0) {
    console.warn('⚠️  Firebase not initialized — skipping push notification');
    return { success: false, error: 'Firebase not initialized' };
  }

  if (!fcmToken) {
    console.warn('⚠️  sendPushNotification: No FCM token provided');
    return { success: false, error: 'No FCM token' };
  }

  // Ensure all data values are strings (FCM requirement)
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = String(value ?? '');
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'salon_booking_channel',
        sound: 'default',
        priority: 'high',
        defaultVibrateTimings: true,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    console.log(`✅ FCM push sent — messageId: ${messageId} | title: "${title}"`);
    return { success: true, messageId };
  } catch (err) {
    console.error('❌ FCM push failed:', err.code, err.message);
    // Token is stale/invalid — clear it from DB so we don't retry it
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      try {
        await User.updateOne({ fcmToken }, { $unset: { fcmToken: '' } });
        console.log('🗑️  Stale FCM token removed from DB');
      } catch (dbErr) {
        console.error('❌ Failed to remove stale FCM token:', dbErr.message);
      }
    }
    return { success: false, error: err.message };
  }
};

// ─────────────────────────────────────────────
// High-level: appointment confirmation push
// ─────────────────────────────────────────────
/**
 * Send an "Appointment Confirmed" push notification.
 * Looks up the user by email OR phone to retrieve their FCM token.
 *
 * @param {{
 *   customerEmail?: string,
 *   customerPhone?: string,
 *   customerName: string,
 *   salonName: string,
 *   serviceName: string,
 *   date: string,
 *   time: string,
 *   totalAmount: number,
 *   appointmentId: string
 * }} notificationData
 */
const sendAppointmentConfirmationPush = async (notificationData) => {
  const {
    customerEmail,
    customerPhone,
    customerName,
    salonName,
    serviceName,
    date,
    time,
    totalAmount,
    appointmentId,
  } = notificationData;

  try {
    // Find user by email or phone to get their FCM token
    const query = [];
    if (customerEmail) query.push({ email: customerEmail });
    if (customerPhone) query.push({ phone: customerPhone });

    if (query.length === 0) {
      console.warn('⚠️  sendAppointmentConfirmationPush: No email or phone provided');
      return { success: false, error: 'No identifier provided' };
    }

    const user = await User.findOne({ $or: query }).select('fcmToken name').lean();

    if (!user) {
      console.log(`ℹ️  No user found for push notification (email: ${customerEmail}, phone: ${customerPhone})`);
      return { success: false, error: 'User not found' };
    }

    if (!user.fcmToken) {
      console.log(`ℹ️  User found but has no FCM token — push skipped`);
      return { success: false, error: 'No FCM token for user' };
    }

    const title = '✅ Appointment Confirmed!';
    const body  = `Your appointment at ${salonName} on ${date} at ${time} is confirmed.`;

    const data = {
      type:          'appointmentConfirmation',
      appointmentId: appointmentId || '',
      salonName:     salonName     || '',
      serviceName:   serviceName   || '',
      date:          date          || '',
      time:          time          || '',
      totalAmount:   String(totalAmount ?? 0),
    };

    return await sendPushNotification(user.fcmToken, title, body, data);
  } catch (err) {
    console.error('❌ sendAppointmentConfirmationPush error:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendPushNotification,
  sendAppointmentConfirmationPush,
};
