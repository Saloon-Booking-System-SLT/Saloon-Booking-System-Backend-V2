// Simple server test
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 10000,
  path: '/',
  method: 'GET'
};

console.log('Testing server connection...');

const req = http.request(options, (res) => {
  console.log('✅ Server responded!');
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response Body:', data);
  });
});

req.on('error', (error) => {
  console.log('❌ Request failed:', error.message);
  console.log('Error details:', error);
});

req.on('timeout', () => {
  console.log('❌ Request timed out');
});

req.setTimeout(5000);
req.end();