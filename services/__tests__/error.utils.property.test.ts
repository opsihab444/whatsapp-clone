import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  createServiceError,
  toServiceError,
  getUserFriendlyMessage,
  isNetworkError,
} from '../error.utils';
import { ServiceError } from '@/types';

/**
 * Feature: whatsapp-clone, Property 33: Structured error responses
 * Validates: Requirements 13.3
 * 
 * For any service function error, a structured error object with type and message SHALL be returned.
 */

describe('Service Error Handling - Property-Based Tests', () => {
  // Arbitrary for error types
  const errorTypeArbitrary = fc.constantFrom(
    'AUTH_ERROR',
    'VALIDATION_ERROR',
    'NETWORK_ERROR',
    'NOT_FOUND',
    'PERMISSION_DENIED',
    'UPLOAD_ERROR',
    'UNKNOWN_ERROR'
  ) as fc.Arbitrary<ServiceError['type']>;

  // Arbitrary for error messages
  const errorMessageArbitrary = fc.string({ minLength: 1, maxLength: 200 });

  test('Property 33: createServiceError always returns structured error with type and message', () => {
    fc.assert(
      fc.property(
        errorTypeArbitrary,
        errorMessageArbitrary,
        (type, message) => {
          const error = createServiceError(type, message);

          // Verify structure
          expect(error).toHaveProperty('type');
          expect(error).toHaveProperty('message');

          // Verify values
          expect(error.type).toBe(type);
          expect(error.message).toBe(message);

          // Verify it's a valid ServiceError
          expect(typeof error.type).toBe('string');
          expect(typeof error.message).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 33: toServiceError always returns structured error for any input', () => {
    // Arbitrary for various error inputs
    const errorInputArbitrary = fc.oneof(
      fc.string().map((msg) => new Error(msg)),
      fc.string().map((msg) => new Error(`network ${msg}`)),
      fc.string().map((msg) => new Error(`fetch failed: ${msg}`)),
      fc.string(),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.object()
    );

    fc.assert(
      fc.property(errorInputArbitrary, (input) => {
        const error = toServiceError(input);

        // Verify structure
        expect(error).toHaveProperty('type');
        expect(error).toHaveProperty('message');

        // Verify types
        expect(typeof error.type).toBe('string');
        expect(typeof error.message).toBe('string');

        // Verify type is valid
        const validTypes = [
          'AUTH_ERROR',
          'VALIDATION_ERROR',
          'NETWORK_ERROR',
          'NOT_FOUND',
          'PERMISSION_DENIED',
          'UPLOAD_ERROR',
          'UNKNOWN_ERROR',
        ];
        expect(validTypes).toContain(error.type);

        // Verify message is non-empty
        expect(error.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test('Property 33: getUserFriendlyMessage always returns non-empty string for any ServiceError', () => {
    fc.assert(
      fc.property(
        errorTypeArbitrary,
        errorMessageArbitrary,
        (type, message) => {
          const error: ServiceError = { type, message };
          const friendlyMessage = getUserFriendlyMessage(error);

          // Verify it returns a string
          expect(typeof friendlyMessage).toBe('string');

          // Verify it's non-empty
          expect(friendlyMessage.length).toBeGreaterThan(0);

          // Verify it's user-friendly (doesn't expose technical details)
          expect(friendlyMessage).not.toContain('undefined');
          expect(friendlyMessage).not.toContain('null');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 33: isNetworkError correctly identifies network-related errors', () => {
    // Test with network-related error messages
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('network'),
          fc.constant('fetch'),
          fc.constant('connection')
        ),
        fc.string(),
        (keyword, suffix) => {
          const error = new Error(`${keyword} ${suffix}`);
          const result = isNetworkError(error);

          // Should identify network errors
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 33: isNetworkError returns false for non-network errors', () => {
    // Test with non-network error messages
    const nonNetworkMessageArbitrary = fc
      .string({ minLength: 1 })
      .filter(
        (msg) =>
          !msg.includes('network') &&
          !msg.includes('fetch') &&
          !msg.includes('connection')
      );

    fc.assert(
      fc.property(nonNetworkMessageArbitrary, (message) => {
        const error = new Error(message);
        const result = isNetworkError(error);

        // Should not identify as network error
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test('Property 33: Error structure is consistent across all error types', () => {
    fc.assert(
      fc.property(
        errorTypeArbitrary,
        errorMessageArbitrary,
        (type, message) => {
          const error = createServiceError(type, message);

          // Verify consistent structure
          const keys = Object.keys(error);
          expect(keys).toContain('type');
          expect(keys).toContain('message');
          expect(keys.length).toBe(2);

          // Verify no additional properties
          expect(error).not.toHaveProperty('stack');
          expect(error).not.toHaveProperty('code');
        }
      ),
      { numRuns: 100 }
    );
  });
});
