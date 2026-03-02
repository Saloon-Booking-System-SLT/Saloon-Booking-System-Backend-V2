// Test Gmail with alternative port configuration
require('dotenv').config();
const emailService = require('./services/emailService');

async function testAlternativePort() {
 console.log(' Testing Alternative SMTP Ports for Hosting Compatibility');
 console.log('=' .repeat(60));
  
  // Test with different ports
  const ports = [465, 587, 25, 2525];
  
  for (const port of ports) {
 console.log(`\n Testing Port ${port}...`);
    
    // Set environment variable temporarily
    process.env.EMAIL_PORT = port.toString();
    
    try {
      // Reinitialize service with new port
      await emailService.reinitialize();
      
      const status = emailService.getStatus();
 console.log(` Port ${port} Status:`, status);
      
      if (status.connected) {
 console.log(` Port ${port} works! This port is not blocked.`);
        
        // Send a test email if connection works
        const testEmail = emailService.createMailOptions(
          'ojitharajapaksha@gmail.com',
          `🔧 Port ${port} Test - Salon Booking System`,
          `<div style="padding: 20px; background: #f0f8ff; border: 2px solid #4CAF50; border-radius: 10px;">
            <h2 style="color: #4CAF50;">✅ Port ${port} Working!</h2>
            <p>Your salon booking system can now send emails using SMTP port ${port}.</p>
            <p><strong>Configuration:</strong></p>
            <ul>
              <li>Host: smtp.gmail.com</li>
              <li>Port: ${port}</li>
              <li>Secure: ${port === 465 ? 'Yes (SSL)' : 'No (STARTTLS)'}</li>
              <li>Service: Gmail SMTP</li>
            </ul>
            <p style="color: #666;">This port is not blocked by your hosting provider.</p>
          </div>`,
          `Port ${port} Test Success! Your salon booking system can send emails using port ${port}.`
        );
        
        const result = await emailService.sendEmail(testEmail);
        if (result.success) {
 console.log(` Test email sent successfully via port ${port}!`);
 console.log(` Message ID: ${result.messageId}`);
          break; // Stop testing once we find a working port
        }
      } else {
 console.log(` Port ${port} is blocked or failed`);
      }
      
    } catch (error) {
 console.log(` Port ${port} failed:`, error.message);
    }
  }
  
 console.log('\n Port Testing Complete');
 console.log(' Use the working port in your production environment variables');
}

testAlternativePort().catch(console.error);