import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { updateTabTitle } from '../utils';

describe('Utils Property Tests', () => {
  beforeEach(() => {
    // Reset document title before each test
    document.title = 'WhatsApp Clone';
  });

  /**
   * Feature: whatsapp-clone, Property 8: Tab title reflects total unread
   * Validates: Requirements 3.5
   */
  test('Property 8: tab title is updated to reflect total unread count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        (unreadCount) => {
          // Update tab title with unread count
          updateTabTitle(unreadCount);

          // Verify tab title is updated correctly
          if (unreadCount > 0) {
            const expectedCount = unreadCount > 99 ? '99+' : unreadCount.toString();
            expect(document.title).toBe(`(${expectedCount}) WhatsApp Clone`);
          } else {
            expect(document.title).toBe('WhatsApp Clone');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
