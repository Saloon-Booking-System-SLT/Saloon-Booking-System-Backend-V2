#!/usr/bin/env node

/**
 * Professional Email Service Test Script
 * Based on DQMS Success Pattern
 */

require('dotenv').config();
const emailService = require('./services/emailService');

async function testEmailService() {
  console.log('🧪 Professional Email Service Test Suite');
  console.log('==========================================');
  
  // Test 1: Environment Variables
  console.log('\n📋 Test 1: Environment Variables');
  console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Missing');
  console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '✅ Set' : '❌ Missing');
  console.log('EMAIL_HOST:', process.env.EMAIL_HOST || 'smtp.gmail.com (default)');
  console.log('EMAIL_PORT:', process.env.EMAIL_PORT || '587 (default)');
  
  // Test 2: Service Status
  console.log('\n🔧 Test 2: Service Status');
  const status = emailService.getStatus();
  console.log('Service Status:', JSON.stringify(status, null, 2));
  
  // Test 3: Connection Test
  console.log('\n🔍 Test 3: SMTP Connection Test');
  const connectionResult = await emailService.testConnection();
  console.log('Connection Test:', connectionResult ? '✅ Success' : '❌ Failed');
  
  // Test 4: Send Test Email
  if (connectionResult) {
    console.log('\n📧 Test 4: Sending Test Email');
    
    const testMailOptions = emailService.createMailOptions(
      process.env.EMAIL_USER || 'saloonbookingsystem@gmail.com',
      '🧪 Professional Email Service Test',
      `
        <h2>✅ Email Service Test Successful</h2>
        <p>This is a test email from the Professional Email Service.</p>
        <p><strong>Service:</strong> Gmail SMTP</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
      `,
      `
        ✅ Email Service Test Successful
        
        This is a test email from the Professional Email Service.
        
        Service: Gmail SMTP
        Time: ${new Date().toISOString()}
        Environment: ${process.env.NODE_ENV || 'development'}
      `
    );
    
    const emailResult = await emailService.sendEmail(testMailOptions);
    
    if (emailResult.success) {
      console.log('✅ Test email sent successfully!');
      console.log('Message ID:', emailResult.messageId);
      console.log('Service:', emailResult.service);
      console.log('Attempt:', emailResult.attempt);
    } else {
      console.log('❌ Test email failed:', emailResult.error);
      console.log('Code:', emailResult.code);
      console.log('Suggestion:', emailResult.suggestion);
    }
  } else {
    console.log('❌ Skipping email test due to connection failure');
  }
  
  // Test 5: Summary
  console.log('\n📊 Test Summary');
  console.log('==========================================');
  console.log('Environment Variables:', process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? '✅ OK' : '❌ Missing');
  console.log('Service Initialization:', status.initialized ? '✅ OK' : '❌ Failed');
  console.log('SMTP Connection:', connectionResult ? '✅ OK' : '❌ Failed');
  
  if (connectionResult) {
    console.log('\n🎉 Professional Email Service is working correctly!');
    console.log('You can now use it in production.');
  } else {
    console.log('\n⚠️ Email service needs attention.');
    console.log('Check your Gmail credentials and network connectivity.');
  }
}

// Run the test
testEmailService().catch(console.error);