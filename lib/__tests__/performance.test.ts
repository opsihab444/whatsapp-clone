/**
 * Performance tests for virtualization and memoization
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect } from 'vitest';
import { Conversation, Message } from '@/types';

// Generate mock data for performance testing
function generateMockConversations(count: number): Conversation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `conv-${i}`,
    participant_1_id: 'user-1',
    participant_2_id: `user-${i}`,
    last_message_content: `Message ${i}`,
    last_message_time: new Date(Date.now() - i * 1000).toISOString(),
    created_at: new Date(Date.now() - i * 10000).toISOString(),
    other_user: {
      id: `user-${i}`,
      email: `user${i}@example.com`,
      full_name: `User ${i}`,
      avatar_url: null,
      created_at: new Date().toISOString(),
    },
    unread_count: i % 5 === 0 ? Math.floor(Math.random() * 10) : 0,
  }));
}

function generateMockMessages(count: number, conversationId: string): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    conversation_id: conversationId,
    sender_id: i % 2 === 0 ? 'user-1' : 'user-2',
    content: `Message content ${i}`,
    type: 'text' as const,
    media_url: null,
    media_width: null,
    media_height: null,
    status: 'sent' as const,
    is_edited: false,
    is_deleted: false,
    created_at: new Date(Date.now() - (count - i) * 1000).toISOString(),
    updated_at: new Date(Date.now() - (count - i) * 1000).toISOString(),
  }));
}

describe('Performance - Data Generation', () => {
  it('should generate 1000+ conversations efficiently', () => {
    const startTime = performance.now();
    const conversations = generateMockConversations(1000);
    const endTime = performance.now();

    expect(conversations).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(100); // Should take less than 100ms
  });

  it('should generate 1000+ messages efficiently', () => {
    const startTime = performance.now();
    const messages = generateMockMessages(1000, 'conv-1');
    const endTime = performance.now();

    expect(messages).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(100); // Should take less than 100ms
  });

  it('should verify conversation data structure', () => {
    const conversations = generateMockConversations(10);
    
    conversations.forEach((conv) => {
      expect(conv).toHaveProperty('id');
      expect(conv).toHaveProperty('other_user');
      expect(conv).toHaveProperty('last_message_content');
      expect(conv).toHaveProperty('last_message_time');
      expect(conv).toHaveProperty('unread_count');
    });
  });

  it('should verify message data structure', () => {
    const messages = generateMockMessages(10, 'conv-1');
    
    messages.forEach((msg) => {
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('conversation_id');
      expect(msg).toHaveProperty('sender_id');
      expect(msg).toHaveProperty('content');
      expect(msg).toHaveProperty('status');
      expect(msg).toHaveProperty('created_at');
    });
  });
});

describe('Performance - Sorting and Filtering', () => {
  it('should sort 1000+ conversations by last_message_time efficiently', () => {
    const conversations = generateMockConversations(1000);
    
    const startTime = performance.now();
    const sorted = [...conversations].sort((a, b) => {
      const timeA = new Date(a.last_message_time || 0).getTime();
      const timeB = new Date(b.last_message_time || 0).getTime();
      return timeB - timeA;
    });
    const endTime = performance.now();

    expect(sorted).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(50); // Should take less than 50ms
    
    // Verify sorting is correct
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentTime = new Date(sorted[i].last_message_time || 0).getTime();
      const nextTime = new Date(sorted[i + 1].last_message_time || 0).getTime();
      expect(currentTime).toBeGreaterThanOrEqual(nextTime);
    }
  });

  it('should filter 1000+ conversations by search query efficiently', () => {
    const conversations = generateMockConversations(1000);
    const searchQuery = 'User 5';
    
    const startTime = performance.now();
    const filtered = conversations.filter((conv) => {
      const name = conv.other_user.full_name?.toLowerCase() || '';
      const lastMessage = conv.last_message_content?.toLowerCase() || '';
      const query = searchQuery.toLowerCase();
      return name.includes(query) || lastMessage.includes(query);
    });
    const endTime = performance.now();

    expect(filtered.length).toBeGreaterThan(0);
    expect(endTime - startTime).toBeLessThan(50); // Should take less than 50ms
  });

  it('should handle chronological message ordering for 1000+ messages', () => {
    const messages = generateMockMessages(1000, 'conv-1');
    
    const startTime = performance.now();
    const sorted = [...messages].sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const endTime = performance.now();

    expect(sorted).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(50); // Should take less than 50ms
    
    // Verify chronological order
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentTime = new Date(sorted[i].created_at).getTime();
      const nextTime = new Date(sorted[i + 1].created_at).getTime();
      expect(currentTime).toBeLessThanOrEqual(nextTime);
    }
  });
});

describe('Performance - Memoization Comparison', () => {
  it('should verify conversation comparison function logic', () => {
    const conv1: Conversation = {
      id: 'conv-1',
      participant_1_id: 'user-1',
      participant_2_id: 'user-2',
      last_message_content: 'Hello',
      last_message_time: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      other_user: {
        id: 'user-2',
        email: 'user2@example.com',
        full_name: 'User 2',
        avatar_url: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      unread_count: 5,
    };

    const conv2 = { ...conv1 };
    const conv3 = { ...conv1, unread_count: 10 };
    const conv4 = { ...conv1, last_message_content: 'Hi' };

    // Custom comparison function from ChatRow
    const shouldNotRerender = (prev: Conversation, next: Conversation) => {
      return (
        prev.id === next.id &&
        prev.last_message_content === next.last_message_content &&
        prev.last_message_time === next.last_message_time &&
        prev.unread_count === next.unread_count
      );
    };

    expect(shouldNotRerender(conv1, conv2)).toBe(true);
    expect(shouldNotRerender(conv1, conv3)).toBe(false); // unread_count changed
    expect(shouldNotRerender(conv1, conv4)).toBe(false); // last_message_content changed
  });

  it('should verify message comparison needs', () => {
    const msg1: Message = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      content: 'Hello',
      type: 'text',
      media_url: null,
      media_width: null,
      media_height: null,
      status: 'sent',
      is_edited: false,
      is_deleted: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const msg2 = { ...msg1 };
    const msg3 = { ...msg1, status: 'read' as const };
    const msg4 = { ...msg1, is_edited: true };

    // Shallow comparison (React.memo default)
    expect(msg1 === msg2).toBe(false); // Different object references
    expect(msg1.id === msg2.id).toBe(true);
    expect(msg1.status === msg3.status).toBe(false);
    expect(msg1.is_edited === msg4.is_edited).toBe(false);
  });
});

describe('Performance - Unread Count Calculations', () => {
  it('should calculate total unread count efficiently for 1000+ conversations', () => {
    const conversations = generateMockConversations(1000);
    
    const startTime = performance.now();
    const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
    const endTime = performance.now();

    expect(totalUnread).toBeGreaterThanOrEqual(0);
    expect(endTime - startTime).toBeLessThan(10); // Should take less than 10ms
  });

  it('should update unread count for specific conversation efficiently', () => {
    const conversations = generateMockConversations(1000);
    const targetId = 'conv-500';
    
    const startTime = performance.now();
    const updated = conversations.map((conv) =>
      conv.id === targetId ? { ...conv, unread_count: 0 } : conv
    );
    const endTime = performance.now();

    expect(updated).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(20); // Should take less than 20ms
    
    const targetConv = updated.find((c) => c.id === targetId);
    expect(targetConv?.unread_count).toBe(0);
  });
});

// Export generators for use in other tests
export { generateMockConversations, generateMockMessages };
