module.exports = {
  // Test environment - Node.js for backend testing
  testEnvironment: 'node',
  
  // Where to look for test files
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.test.js'
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'utils/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output for better debugging
  verbose: true
};
