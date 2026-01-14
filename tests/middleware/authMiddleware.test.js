/**
 * Unit Tests for Authentication Middleware
 * 
 * These tests verify the middleware that protects API routes:
 * - authenticateToken: Extracts and validates JWT from Authorization header
 * - requireRole: Checks if user has required role(s)
 * - requireCustomer/Owner/Admin: Specific role guards
 * 
 * We use mock request/response objects to test middleware functions.
 */

const { 
  authenticateToken, 
  requireRole, 
  requireCustomer, 
  requireOwner, 
  requireAdmin 
} = require('../../middleware/authMiddleware');
const { generateToken } = require('../../utils/jwtUtils');

/**
 * Helper function to create a mock Express request object
 * @param {Object} options - Options for the mock request
 * @returns {Object} Mock request object
 */
const mockRequest = (options = {}) => ({
  headers: options.headers || {},
  user: options.user || null
});

/**
 * Helper function to create a mock Express response object
 * @returns {Object} Mock response object with jest spy functions
 */
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);  // Allow chaining: res.status(401).json(...)
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Helper function to create a mock next() function
 * @returns {Function} Mock next function
 */
const mockNext = () => jest.fn();


describe('Authentication Middleware', () => {

  /**
   * TEST GROUP: authenticateToken middleware
   * 
   * This middleware:
   * 1. Extracts token from "Authorization: Bearer <token>" header
   * 2. Verifies the token is valid
   * 3. Attaches decoded user info to req.user
   * 4. Returns 401 if no token, 403 if invalid token
   */
  describe('authenticateToken', () => {

    test('should return 401 if no authorization header', () => {
      // Arrange: Request without Authorization header
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert: Should return 401 Unauthorized
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Access token required' });
      expect(next).not.toHaveBeenCalled(); // Should NOT call next()
    });

    test('should return 401 if authorization header is empty', () => {
      // Arrange
      const req = mockRequest({ headers: { authorization: '' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if only "Bearer" without token', () => {
      // Arrange: "Bearer " without actual token
      const req = mockRequest({ headers: { authorization: 'Bearer ' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if token is invalid', () => {
      // Arrange: Invalid token
      const req = mockRequest({ 
        headers: { authorization: 'Bearer invalid.token.here' } 
      });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert: Should return 403 Forbidden
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next() and attach user to request if token is valid', () => {
      // Arrange: Generate a valid token
      const userPayload = { userId: 'user123', email: 'test@test.com', role: 'customer' };
      const token = generateToken(userPayload);
      const req = mockRequest({ 
        headers: { authorization: `Bearer ${token}` } 
      });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert: Should call next() and attach user info
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('user123');
      expect(req.user.email).toBe('test@test.com');
      expect(req.user.role).toBe('customer');
    });

    test('should handle "Bearer" prefix case-sensitively', () => {
      // Arrange: Valid token with correct "Bearer" prefix
      const token = generateToken({ userId: '123' });
      const req = mockRequest({ 
        headers: { authorization: `Bearer ${token}` } 
      });
      const res = mockResponse();
      const next = mockNext();

      // Act
      authenticateToken(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
    });

  });


  /**
   * TEST GROUP: requireRole middleware factory
   * 
   * This is a higher-order function that creates middleware
   * to check if the authenticated user has specific role(s).
   */
  describe('requireRole', () => {

    test('should return 401 if req.user is not set', () => {
      // Arrange: No user attached (authentication failed/skipped)
      const middleware = requireRole(['admin']);
      const req = mockRequest({ user: null });
      const res = mockResponse();
      const next = mockNext();

      // Act
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if user role does not match required role', () => {
      // Arrange: User is 'customer' but endpoint requires 'admin'
      const middleware = requireRole(['admin']);
      const req = mockRequest({ user: { userId: '123', role: 'customer' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Insufficient permissions',
        requiredRole: ['admin'],
        userRole: 'customer'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next() if user has exact required role', () => {
      // Arrange: User is 'admin' and endpoint requires 'admin'
      const middleware = requireRole(['admin']);
      const req = mockRequest({ user: { userId: '123', role: 'admin' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      middleware(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should call next() if user has one of multiple allowed roles', () => {
      // Arrange: Endpoint allows both 'admin' and 'owner'
      const middleware = requireRole(['admin', 'owner']);
      const req = mockRequest({ user: { userId: '123', role: 'owner' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      middleware(req, res, next);

      // Assert: Owner should be allowed
      expect(next).toHaveBeenCalled();
    });

    test('should reject if user role not in allowed list', () => {
      // Arrange: Endpoint allows 'admin' and 'owner', user is 'customer'
      const middleware = requireRole(['admin', 'owner']);
      const req = mockRequest({ user: { userId: '123', role: 'customer' } });
      const res = mockResponse();
      const next = mockNext();

      // Act
      middleware(req, res, next);

      // Assert: Customer should be rejected
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

  });


  /**
   * TEST GROUP: Pre-built role middlewares
   * 
   * These are convenience middlewares for common role checks:
   * - requireCustomer: Only allows 'customer' role
   * - requireOwner: Only allows 'owner' role  
   * - requireAdmin: Only allows 'admin' role
   */
  describe('Specific Role Middlewares', () => {

    describe('requireCustomer', () => {
      test('should allow customer role', () => {
        const req = mockRequest({ user: { role: 'customer' } });
        const res = mockResponse();
        const next = mockNext();

        requireCustomer(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('should reject owner role', () => {
        const req = mockRequest({ user: { role: 'owner' } });
        const res = mockResponse();
        const next = mockNext();

        requireCustomer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });

      test('should reject admin role', () => {
        const req = mockRequest({ user: { role: 'admin' } });
        const res = mockResponse();
        const next = mockNext();

        requireCustomer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });
    });

    describe('requireOwner', () => {
      test('should allow owner role', () => {
        const req = mockRequest({ user: { role: 'owner' } });
        const res = mockResponse();
        const next = mockNext();

        requireOwner(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('should reject customer role', () => {
        const req = mockRequest({ user: { role: 'customer' } });
        const res = mockResponse();
        const next = mockNext();

        requireOwner(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });
    });

    describe('requireAdmin', () => {
      test('should allow admin role', () => {
        const req = mockRequest({ user: { role: 'admin' } });
        const res = mockResponse();
        const next = mockNext();

        requireAdmin(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('should reject non-admin roles', () => {
        const req = mockRequest({ user: { role: 'customer' } });
        const res = mockResponse();
        const next = mockNext();

        requireAdmin(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });
    });

  });

});
