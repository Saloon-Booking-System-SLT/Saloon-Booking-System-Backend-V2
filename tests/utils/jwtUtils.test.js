/**
 * Unit Tests for JWT Utilities
 * 
 * These tests verify the core JWT (JSON Web Token) functions:
 * - generateToken: Creates a signed JWT with a payload
 * - verifyToken: Validates a JWT and returns the decoded payload
 * - decodeToken: Decodes a JWT without verification (useful for debugging)
 */

const { generateToken, verifyToken } = require('../../utils/jwtUtils');

describe('JWT Utilities', () => {
  
  /**
   * TEST GROUP: generateToken function
   * 
   * This function creates a signed JWT token from a payload.
   * We test that it:
   * 1. Returns a valid string token
   * 2. Token contains the original payload data
   * 3. Token has an expiration time (exp claim)
   */
  describe('generateToken', () => {
    
    test('should generate a valid JWT token string', () => {
      // Arrange: Create a sample user payload
      const payload = { userId: '12345', email: 'test@example.com' };
      
      // Act: Generate the token
      const token = generateToken(payload);
      
      // Assert: Token should be a non-empty string with JWT format (xxx.xxx.xxx)
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts separated by dots
    });

    test('should include payload data in the generated token', () => {
      // Arrange
      const payload = { userId: 'user123', role: 'customer' };
      
      // Act
      const token = generateToken(payload);
      const decoded = verifyToken(token);
      
      // Assert: Decoded token should contain our payload
      expect(decoded.userId).toBe('user123');
      expect(decoded.role).toBe('customer');
    });

    test('should include expiration time in token', () => {
      // Arrange
      const payload = { userId: '12345' };
      
      // Act
      const token = generateToken(payload);
      const decoded = verifyToken(token);
      
      // Assert: Token should have 'exp' (expiration) and 'iat' (issued at) claims
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat); // Expiry should be after issue time
    });

  });

  /**
   * TEST GROUP: verifyToken function
   * 
   * This function validates a JWT and returns the decoded payload if valid.
   * We test that it:
   * 1. Successfully verifies valid tokens
   * 2. Throws an error for invalid tokens
   * 3. Throws an error for tampered tokens
   */
  describe('verifyToken', () => {
    
    test('should successfully verify a valid token', () => {
      // Arrange: Generate a valid token
      const payload = { userId: 'user456', email: 'valid@example.com' };
      const token = generateToken(payload);
      
      // Act: Verify the token
      const verified = verifyToken(token);
      
      // Assert: Should return decoded payload with original data
      expect(verified.userId).toBe('user456');
      expect(verified.email).toBe('valid@example.com');
    });

    test('should throw error for invalid token', () => {
      // Arrange: Create an invalid token string
      const invalidToken = 'invalid.token.string';
      
      // Act & Assert: Should throw an error
      expect(() => verifyToken(invalidToken)).toThrow('Invalid token');
    });

    test('should throw error for empty token', () => {
      // Act & Assert
      expect(() => verifyToken('')).toThrow('Invalid token');
    });

    test('should throw error for null token', () => {
      // Act & Assert
      expect(() => verifyToken(null)).toThrow('Invalid token');
    });

    test('should throw error for tampered token', () => {
      // Arrange: Generate a valid token and tamper with it
      const payload = { userId: 'user789' };
      const token = generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx'; // Modify last 5 characters
      
      // Act & Assert: Tampered token should fail verification
      expect(() => verifyToken(tamperedToken)).toThrow('Invalid token');
    });

  });

});
