'use client';

import { useRealtime } from '@/hooks/useRealtime';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

/**
 * Provider component that initializes global realtime subscriptions,
 * unread count tracking for tab title updates, and offline queue management
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  // Initialize global realtime subscription
  useRealtime();
  
  // Initialize unread count tracking and tab title updates
  useUnreadCount();

  // Initialize offline queue management
  useOfflineQueue();

  return <>{children}</>;
}
