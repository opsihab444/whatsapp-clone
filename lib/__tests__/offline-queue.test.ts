import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addToQueue,
  getQueue,
  removeFromQueue,
  incrementRetryCount,
  clearQueue,
  getQueuedMessagesForConversation,
  hasQueuedMessages,
} from '../offline-queue';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('offline-queue', () => {
  beforeEach(() => {
    clearQueue();
  });

  describe('addToQueue', () => {
    it('should add a message to the queue', () => {
      const messageId = addToQueue('conv-1', 'Hello world');
      
      expect(messageId).toMatch(/^offline-/);
      
      const queue = getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].conversationId).toBe('conv-1');
      expect(queue[0].content).toBe('Hello world');
      expect(queue[0].retryCount).toBe(0);
    });

    it('should add multiple messages to the queue', () => {
      addToQueue('conv-1', 'Message 1');
      addToQueue('conv-2', 'Message 2');
      addToQueue('conv-1', 'Message 3');
      
      const queue = getQueue();
      expect(queue).toHaveLength(3);
    });
  });

  describe('getQueue', () => {
    it('should return empty array when queue is empty', () => {
      const queue = getQueue();
      expect(queue).toEqual([]);
    });

    it('should return all queued messages', () => {
      addToQueue('conv-1', 'Message 1');
      addToQueue('conv-2', 'Message 2');
      
      const queue = getQueue();
      expect(queue).toHaveLength(2);
    });
  });

  describe('removeFromQueue', () => {
    it('should remove a message from the queue', () => {
      const messageId = addToQueue('conv-1', 'Hello world');
      
      expect(getQueue()).toHaveLength(1);
      
      removeFromQueue(messageId);
      
      expect(getQueue()).toHaveLength(0);
    });

    it('should only remove the specified message', () => {
      const id1 = addToQueue('conv-1', 'Message 1');
      const id2 = addToQueue('conv-2', 'Message 2');
      const id3 = addToQueue('conv-1', 'Message 3');
      
      removeFromQueue(id2);
      
      const queue = getQueue();
      expect(queue).toHaveLength(2);
      expect(queue.find(m => m.id === id1)).toBeDefined();
      expect(queue.find(m => m.id === id3)).toBeDefined();
      expect(queue.find(m => m.id === id2)).toBeUndefined();
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count and return true when below max retries', () => {
      const messageId = addToQueue('conv-1', 'Hello world');
      
      const shouldRetry1 = incrementRetryCount(messageId);
      expect(shouldRetry1).toBe(true);
      expect(getQueue()[0].retryCount).toBe(1);
      
      const shouldRetry2 = incrementRetryCount(messageId);
      expect(shouldRetry2).toBe(true);
      expect(getQueue()[0].retryCount).toBe(2);
    });

    it('should remove message and return false when max retries reached', () => {
      const messageId = addToQueue('conv-1', 'Hello world');
      
      incrementRetryCount(messageId); // 1
      incrementRetryCount(messageId); // 2
      const shouldRetry = incrementRetryCount(messageId); // 3 - max reached
      
      expect(shouldRetry).toBe(false);
      expect(getQueue()).toHaveLength(0);
    });

    it('should return false for non-existent message', () => {
      const shouldRetry = incrementRetryCount('non-existent-id');
      expect(shouldRetry).toBe(false);
    });
  });

  describe('clearQueue', () => {
    it('should clear all messages from the queue', () => {
      addToQueue('conv-1', 'Message 1');
      addToQueue('conv-2', 'Message 2');
      addToQueue('conv-1', 'Message 3');
      
      expect(getQueue()).toHaveLength(3);
      
      clearQueue();
      
      expect(getQueue()).toHaveLength(0);
    });
  });

  describe('getQueuedMessagesForConversation', () => {
    it('should return only messages for the specified conversation', () => {
      addToQueue('conv-1', 'Message 1');
      addToQueue('conv-2', 'Message 2');
      addToQueue('conv-1', 'Message 3');
      addToQueue('conv-3', 'Message 4');
      
      const conv1Messages = getQueuedMessagesForConversation('conv-1');
      expect(conv1Messages).toHaveLength(2);
      expect(conv1Messages.every(m => m.conversationId === 'conv-1')).toBe(true);
    });

    it('should return empty array when no messages for conversation', () => {
      addToQueue('conv-1', 'Message 1');
      
      const messages = getQueuedMessagesForConversation('conv-2');
      expect(messages).toEqual([]);
    });
  });

  describe('hasQueuedMessages', () => {
    it('should return false when queue is empty', () => {
      expect(hasQueuedMessages()).toBe(false);
    });

    it('should return true when queue has messages', () => {
      addToQueue('conv-1', 'Message 1');
      expect(hasQueuedMessages()).toBe(true);
    });
  });
});
