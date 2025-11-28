'use client';

import { useUIStore } from '@/store/ui.store';
import { SettingsPanel } from '@/components/features/settings/SettingsPanel';
import { ChatPanel } from '@/components/features/chat/ChatPanel';
import { GroupPanel } from '@/components/features/group/GroupPanel';
import { EmptyState } from '@/components/features/chat/EmptyState';

/**
 * Main page - WhatsApp style single page app
 * No route changes, everything happens on /
 * Chat/Group/Settings selection is handled via Zustand store
 */
export default function MainPage() {
  const { activeChatId, activeGroupId, activeView } = useUIStore();

  // Show settings panel
  if (activeView === 'settings') {
    return <SettingsPanel />;
  }

  // Show chat panel
  if (activeChatId) {
    return <ChatPanel chatId={activeChatId} />;
  }

  // Show group panel
  if (activeGroupId) {
    return <GroupPanel groupId={activeGroupId} />;
  }

  // Show empty state
  return <EmptyState />;
}
