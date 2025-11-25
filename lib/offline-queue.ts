/**
 * Offline message queue manager
 * Stores messages when offline and retries when connection is restored
 */

interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'offline_message_queue';
const MAX_RETRIES = 3;

/**
 * Add a message to the offline queue
 */
export function addToQueue(conversationId: string, content: string): string {
  const messageId = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const queuedMessage: QueuedMessage = {
    id: messageId,
    conversationId,
    content,
    timestamp: Date.now(),
    retryCount: 0,
  };

  const queue = getQueue();
  queue.push(queuedMessage);
  saveQueue(queue);

  return messageId;
}

/**
 * Get all queued messages
 */
export function getQueue(): QueuedMessage[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to get offline queue:', error);
    return [];
  }
}

/**
 * Save queue to localStorage
 */
function saveQueue(queue: QueuedMessage[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save offline queue:', error);
  }
}

/**
 * Remove a message from the queue
 */
export function removeFromQueue(messageId: string): void {
  const queue = getQueue();
  const filtered = queue.filter((msg) => msg.id !== messageId);
  saveQueue(filtered);
}

/**
 * Increment retry count for a message
 */
export function incrementRetryCount(messageId: string): boolean {
  const queue = getQueue();
  const message = queue.find((msg) => msg.id === messageId);
  
  if (!message) return false;
  
  message.retryCount++;
  
  // Remove if max retries reached
  if (message.retryCount >= MAX_RETRIES) {
    removeFromQueue(messageId);
    return false;
  }
  
  saveQueue(queue);
  return true;
}

/**
 * Clear the entire queue
 */
export function clearQueue(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.error('Failed to clear offline queue:', error);
  }
}

/**
 * Get queued messages for a specific conversation
 */
export function getQueuedMessagesForConversation(conversationId: string): QueuedMessage[] {
  const queue = getQueue();
  return queue.filter((msg) => msg.conversationId === conversationId);
}

/**
 * Check if there are any queued messages
 */
export function hasQueuedMessages(): boolean {
  return getQueue().length > 0;
}
