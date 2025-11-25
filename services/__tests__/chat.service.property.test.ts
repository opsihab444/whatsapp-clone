import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { Conversation } from '@/types';
import { filterConversations } from '../chat.service';

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
  last_message_content: fc.option(fc.string(), { nil: null }),
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

describe('Chat Service Property Tests', () => {
  /**
   * Feature: whatsapp-clone, Property 1: Conversation list sorting invariant
   * Validates: Requirements 2.1
   */
  test('Property 1: conversations are always sorted by last_message_time DESC', () => {
    fc.assert(
      fc.property(
        fc.array(conversationArbitrary, { minLength: 1, maxLength: 100 }),
        (conversations) => {
          // Sort conversations by last_message_time descending
          const sorted = [...conversations].sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return timeB - timeA;
          });

          // Verify sorting invariant: each conversation's time >= next conversation's time
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentTime = sorted[i].last_message_time 
              ? new Date(sorted[i].last_message_time!).getTime() 
              : 0;
            const nextTime = sorted[i + 1].last_message_time 
              ? new Date(sorted[i + 1].last_message_time!).getTime() 
              : 0;
            
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 36: Search filter accuracy
   * Validates: Requirements 15.1
   */
  test('Property 36: search filter only returns matching conversations', () => {
    fc.assert(
      fc.property(
        fc.array(conversationArbitrary, { minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (conversations, query) => {
          const filtered = filterConversations(conversations, query);
          
          // If query is empty/whitespace, all conversations should be returned
          if (!query.trim()) {
            expect(filtered).toEqual(conversations);
            return;
          }

          const lowerQuery = query.toLowerCase();

          // Helper function to check if a conversation matches the query
          const matchesQuery = (conv: Conversation): boolean => {
            const nameMatch = 
              (conv.other_user.full_name?.toLowerCase().includes(lowerQuery) ?? false) ||
              conv.other_user.email.toLowerCase().includes(lowerQuery);
            const messageMatch = conv.last_message_content?.toLowerCase().includes(lowerQuery) ?? false;

            return nameMatch || messageMatch;
          };

          // Every filtered conversation must match the query
          filtered.forEach((conv) => {
            expect(matchesQuery(conv)).toBe(true);
          });

          // Every matching conversation must be in the filtered results
          conversations.forEach((conv) => {
            if (matchesQuery(conv)) {
              expect(filtered).toContainEqual(conv);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
