/**
 * Unit Tests for Appointment Utilities
 * 
 * These tests verify the time calculation functions used in appointment booking:
 * - isValidTimeFormat: Validates HH:mm format
 * - hasTimeConflict: Detects overlapping appointments
 */

const { 
  isValidTimeFormat,
  hasTimeConflict 
} = require('../../utils/appointmentUtils');

describe('Appointment Utilities', () => {

  /**
   * TEST GROUP: isValidTimeFormat
   * 
   * Validates that a time string is in HH:mm format.
   * Prevents invalid data from being stored in the database.
   */
  describe('isValidTimeFormat', () => {

    // ===== VALID FORMATS =====

    test('should accept "09:00" as valid', () => {
      expect(isValidTimeFormat('09:00')).toBe(true);
    });

    test('should accept "9:00" as valid (single digit hour)', () => {
      expect(isValidTimeFormat('9:00')).toBe(true);
    });

    // ===== INVALID FORMATS =====

    test('should reject "25:00" as invalid (hour > 23)', () => {
      expect(isValidTimeFormat('25:00')).toBe(false);
    });

    test('should reject "09:60" as invalid (minutes > 59)', () => {
      expect(isValidTimeFormat('09:60')).toBe(false);
    });

    test('should reject "9:0" as invalid (missing digit)', () => {
      expect(isValidTimeFormat('9:0')).toBe(false);
    });


  });


  /**
   * TEST GROUP: hasTimeConflict
   * 
   * Detects if two time ranges overlap.
   * CRITICAL for preventing double-booking!
   * 
   * Conflict exists when: newStart < existingEnd AND newEnd > existingStart
   */
  describe('hasTimeConflict', () => {

    // ===== NO CONFLICT CASES =====

    test('should return false when new appointment is before existing', () => {
      // New: 09:00-10:00, Existing: 10:00-11:00
      expect(hasTimeConflict('09:00', '10:00', '10:00', '11:00')).toBe(false);
    });

    test('should return false when new appointment is after existing', () => {
      // New: 11:00-12:00, Existing: 09:00-10:00
      expect(hasTimeConflict('11:00', '12:00', '09:00', '10:00')).toBe(false);
    });

    // ===== CONFLICT CASES =====

    test('should return true when new appointment overlaps start of existing', () => {
      // New: 09:30-10:30, Existing: 10:00-11:00 (overlap: 10:00-10:30)
      expect(hasTimeConflict('09:30', '10:30', '10:00', '11:00')).toBe(true);
    });

    test('should return true when new appointment overlaps end of existing', () => {
      // New: 10:30-11:30, Existing: 10:00-11:00 (overlap: 10:30-11:00)
      expect(hasTimeConflict('10:30', '11:30', '10:00', '11:00')).toBe(true);
    });

    test('should return true when new appointment is inside existing', () => {
      // New: 10:15-10:45, Existing: 10:00-11:00 (new is fully inside existing)
      expect(hasTimeConflict('10:15', '10:45', '10:00', '11:00')).toBe(true);
    });

    test('should return true when new appointment contains existing', () => {
      // New: 09:00-12:00, Existing: 10:00-11:00 (existing is fully inside new)
      expect(hasTimeConflict('09:00', '12:00', '10:00', '11:00')).toBe(true);
    });

    // ===== EDGE CASES =====

    test('should handle 5-minute slot conflicts', () => {
      // Salon uses 5-minute slots
      // New: 09:00-09:05, Existing: 09:00-09:05
      expect(hasTimeConflict('09:00', '09:05', '09:00', '09:05')).toBe(true);
    });

    test('should return false for adjacent 5-minute slots', () => {
      // New: 09:05-09:10, Existing: 09:00-09:05
      expect(hasTimeConflict('09:05', '09:10', '09:00', '09:05')).toBe(false);
    });

  });

});
