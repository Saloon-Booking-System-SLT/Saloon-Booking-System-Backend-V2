#!/usr/bin/env node

/**
 * SendGrid Email Test
 * Test SendGrid API integration
 */

require('dotenv').config();

async function testSendGridSetup() {
  console.log('🧪 SENDGRID EMAIL TEST');
  console.log('======================');
  
  // Check environment variables
  console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || '❌ Missing');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  
  if (!process.env.SENDGRID_API_KEY) {
    console.log('\n❌ SendGrid not configured. Add SENDGRID_API_KEY to your environment variables.');
    return;
  }
  
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: 'ojitharajapaksha@gmail.com', // Change to your email
      from: process.env.SENDGRID_FROM_EMAIL || 'saloonbookingsystem@gmail.com',
      subject: '🧪 SendGrid Test - Salon Booking System',
      text: 'SendGrid email service is working correctly!',
      html: `
        <h2>✅ SendGrid Test Successful!</h2>
        <p>Your SendGrid email service is configured and working properly.</p>
        <p><strong>Service:</strong> SendGrid API</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Status:</strong> Production Ready ✅</p>
      `,
    };
    
    console.log('\n📧 Sending test email via SendGrid...');
    const result = await sgMail.send(msg);
    
    console.log('✅ SendGrid email sent successfully!');
    console.log('Message ID:', result[0].headers['x-message-id']);
    console.log('Status:', result[0].statusCode);
    
  } catch (error) {
    console.error('❌ SendGrid test failed:', error.message);
    console.error('Response:', error.response?.body);
  }
}

testSendGridSetup().catch(console.error);