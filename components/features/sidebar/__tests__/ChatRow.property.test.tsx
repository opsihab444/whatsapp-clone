import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { ChatRow } from '../ChatRow';
import { Conversation } from '@/types';

/**
 * Arbitrary generator for valid ISO date strings
 */
const isoDateArbitrary = fc.integer({ min: 0, max: Date.now() }).map(timestamp => new Date(timestamp).toISOString());

/**
 * Arbitrary generator for Conversation objects
 */
const conversationArbitrary = fc.record({
  id: fc.uuid(),
  participant_1_id: fc.uuid(),
  participant_2_id: fc.uuid(),
  last_message_content: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  last_message_time: fc.option(isoDateArbitrary, { nil: null }),
  created_at: isoDateArbitrary,
  other_user: fc.record({
    id: fc.uuid(),
    email: fc.emailAddress(),
    full_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    avatar_url: fc.option(fc.webUrl(), { nil: null }),
    created_at: isoDateArbitrary,
  }),
  unread_count: fc.nat({ max: 100 }),
}) as fc.Arbitrary<Conversation>;

describe('ChatRow Property Tests', () => {
  /**
   * Feature: whatsapp-clone, Property 3: Conversation row completeness
   * Validates: Requirements 2.4
   */
  test('Property 3: conversation row contains all required information', () => {
    fc.assert(
      fc.property(
        conversationArbitrary,
        (conversation) => {
          const { container, unmount } = render(<ChatRow conversation={conversation} />);

          // Contact name should be displayed (either full_name or email)
          const displayName = conversation.other_user.full_name || conversation.other_user.email;
          expect(container.textContent).toContain(displayName);

          // Last message preview should be displayed (or default text)
          const lastMessageText = conversation.last_message_content || 'No messages yet';
          expect(container.textContent).toContain(lastMessageText.slice(0, 40));

          // Timestamp should be displayed if last_message_time exists
          if (conversation.last_message_time) {
            // The timestamp will be formatted, so we just check that some time-related text exists
            // We can't check the exact format since it depends on the current time
            const timeElements = container.querySelectorAll('.text-xs.text-muted-foreground');
            expect(timeElements.length).toBeGreaterThan(0);
          }

          // Unread count badge should be displayed if unread_count > 0
          if (conversation.unread_count > 0) {
            const badgeText = conversation.unread_count > 99 ? '99+' : conversation.unread_count.toString();
            expect(container.textContent).toContain(badgeText);
          }

          // Clean up after each render
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 4: Unread badge visibility
   * Validates: Requirements 3.1
   */
  test('Property 4: unread badge is displayed when unread_count > 0', () => {
    fc.assert(
      fc.property(
        conversationArbitrary,
        (conversation) => {
          const { container, unmount } = render(<ChatRow conversation={conversation} />);

          // Check if unread badge is displayed correctly based on unread_count
          if (conversation.unread_count > 0) {
            // Badge should be visible - look for the expected text content
            const expectedText = conversation.unread_count > 99 ? '99+' : conversation.unread_count.toString();
            expect(container.textContent).toContain(expectedText);
            
            // Verify the badge element exists by checking for elements with badge-like classes
            const badgeElements = Array.from(container.querySelectorAll('div')).filter(
              el => el.className.includes('rounded-full') && el.className.includes('h-5')
            );
            expect(badgeElements.length).toBeGreaterThan(0);
          } else {
            // Badge should not be visible when unread_count is 0
            // Check that no badge-like elements exist
            const badgeElements = Array.from(container.querySelectorAll('div')).filter(
              el => el.className.includes('rounded-full') && el.className.includes('h-5')
            );
            expect(badgeElements.length).toBe(0);
          }

          // Clean up after each render
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 37: Search result highlighting
   * Validates: Requirements 15.2
   */
  test('Property 37: matching text is highlighted in search results', () => {
    fc.assert(
      fc.property(
        conversationArbitrary,
        fc.string({ minLength: 1, maxLength: 20 }),
        (conversation, searchQuery) => {
          // Skip if search query is empty or whitespace
          if (!searchQuery.trim()) {
            return true;
          }

          const { container, unmount } = render(
            <ChatRow conversation={conversation} searchQuery={searchQuery} />
          );

          const lowerQuery = searchQuery.toLowerCase();
          const displayName = conversation.other_user.full_name || conversation.other_user.email;
          const lastMessage = conversation.last_message_content || 'No messages yet';

          // Check if the query matches the display name or last message
          const nameMatches = displayName.toLowerCase().includes(lowerQuery);
          const messageMatches = lastMessage.toLowerCase().includes(lowerQuery);

          // If there's a match, verify that <mark> elements exist for highlighting
          if (nameMatches || messageMatches) {
            const markElements = container.querySelectorAll('mark');
            expect(markElements.length).toBeGreaterThan(0);

            // Verify that the highlighted text matches the search query (case-insensitive)
            markElements.forEach((mark) => {
              const highlightedText = mark.textContent || '';
              expect(highlightedText.toLowerCase()).toBe(lowerQuery);
            });
          }

          // Clean up after each render
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
