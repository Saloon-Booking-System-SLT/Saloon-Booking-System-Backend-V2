/**
 * Load Testing Script
 * Tests backend performance under concurrent load
 * 
 * Usage: node load-test.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'https://saloon-booking-system-backend-v2.onrender.com';
const CONCURRENT_REQUESTS = 50;
const ENDPOINTS_TO_TEST = [
  { path: '/api/salons/with-ratings', method: 'GET', name: 'Salons with Ratings' },
  { path: '/api/professionals/675cc2e881c7fab55fa2e2c6/with-ratings', method: 'GET', name: 'Professionals with Ratings' },
  { path: '/health', method: 'GET', name: 'Health Check' }
];

/**
 * Test a single endpoint
 */
async function testEndpoint(endpoint, requestNum) {
  const startTime = Date.now();
  
  try {
    const response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.path}`,
      timeout: 30000
    });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      status: response.status,
      duration,
      endpoint: endpoint.name,
      requestNum
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      error: error.message,
      duration,
      endpoint: endpoint.name,
      requestNum
    };
  }
}

/**
 * Run load test for a specific endpoint
 */
async function loadTestEndpoint(endpoint) {
  console.log(`\n📊 Testing: ${endpoint.name}`);
  console.log(`🔗 Endpoint: ${endpoint.method} ${endpoint.path}`);
  console.log(`🚀 Sending ${CONCURRENT_REQUESTS} concurrent requests...\n`);
  
  const startTime = Date.now();
  
  // Create array of promises
  const promises = Array(CONCURRENT_REQUESTS)
    .fill(null)
    .map((_, i) => testEndpoint(endpoint, i + 1));
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  
  const totalDuration = Date.now() - startTime;
  
  // Analyze results
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const durations = results.filter(r => r.success).map(r => r.duration);
  
  const avgDuration = durations.length > 0 
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  
  // Print results
  console.log('📈 Results:');
  console.log(`  ✅ Successful: ${successful}/${CONCURRENT_REQUESTS}`);
  console.log(`  ❌ Failed: ${failed}/${CONCURRENT_REQUESTS}`);
  console.log(`  ⏱️  Total Time: ${totalDuration}ms`);
  console.log(`  📊 Average Response: ${avgDuration}ms`);
  console.log(`  ⚡ Fastest: ${minDuration}ms`);
  console.log(`  🐌 Slowest: ${maxDuration}ms`);
  console.log(`  💪 Requests/second: ${Math.round((CONCURRENT_REQUESTS / totalDuration) * 1000)}`);
  
  // Print failures if any
  if (failed > 0) {
    console.log('\n❌ Failures:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  Request ${r.requestNum}: ${r.error}`);
    });
  }
  
  return {
    endpoint: endpoint.name,
    successful,
    failed,
    avgDuration,
    totalDuration
  };
}

/**
 * Main load test runner
 */
async function runLoadTests() {
  console.log('🧪 SALON BOOKING SYSTEM - LOAD TEST');
  console.log('====================================');
  console.log(`🎯 Target: ${BASE_URL}`);
  console.log(`📊 Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`📋 Endpoints to Test: ${ENDPOINTS_TO_TEST.length}`);
  
  const allResults = [];
  
  for (const endpoint of ENDPOINTS_TO_TEST) {
    const result = await loadTestEndpoint(endpoint);
    allResults.push(result);
    
    // Wait 2 seconds between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n\n📊 OVERALL SUMMARY');
  console.log('==================');
  
  allResults.forEach(result => {
    const successRate = ((result.successful / CONCURRENT_REQUESTS) * 100).toFixed(1);
    console.log(`\n${result.endpoint}:`);
    console.log(`  Success Rate: ${successRate}%`);
    console.log(`  Avg Response: ${result.avgDuration}ms`);
    console.log(`  Total Time: ${result.totalDuration}ms`);
  });
  
  console.log('\n✅ Load test complete!');
}

// Run the tests
runLoadTests().catch(error => {
  console.error('❌ Load test failed:', error);
  process.exit(1);
});
