import { create } from 'zustand';

interface ReplyToMessage {
  id: string;
  content: string;
  senderName: string;
}

// Typing user info with avatar support
interface TypingUserInfo {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  timestamp: number;
}

interface UIState {
  activeChatId: string | null;
  activeGroupId: string | null;
  replyTo: ReplyToMessage | null;
  modals: {
    editMessage: { isOpen: boolean; messageId: string | null };
    deleteMessage: { isOpen: boolean; messageId: string | null };
    editGroupMessage: { isOpen: boolean; messageId: string | null; groupId: string | null };
    deleteGroupMessage: { isOpen: boolean; messageId: string | null; groupId: string | null };
    createGroup: { isOpen: boolean };
  };
  // Legacy single typing user (for 1-1 chats)
  typingUsers: Map<string, { userName: string; timestamp: number }>;
  // Multiple typing users per conversation/group (for group chats)
  typingUsersMultiple: Map<string, Map<string, TypingUserInfo>>;
  setActiveChatId: (chatId: string | null) => void;
  setActiveGroupId: (groupId: string | null) => void;
  setReplyTo: (message: ReplyToMessage | null) => void;
  openEditModal: (messageId: string) => void;
  closeEditModal: () => void;
  openDeleteModal: (messageId: string) => void;
  closeDeleteModal: () => void;
  openCreateGroupModal: () => void;
  closeCreateGroupModal: () => void;
  openEditGroupMessageModal: (messageId: string, groupId: string) => void;
  closeEditGroupMessageModal: () => void;
  openDeleteGroupMessageModal: (messageId: string, groupId: string) => void;
  closeDeleteGroupMessageModal: () => void;
  setUserTyping: (conversationId: string, userName: string) => void;
  clearUserTyping: (conversationId: string) => void;
  // New methods for multiple typing users with avatar
  setUserTypingWithAvatar: (conversationId: string, userId: string, userName: string, avatarUrl?: string | null) => void;
  clearUserTypingById: (conversationId: string, userId: string) => void;
  getTypingUsers: (conversationId: string) => TypingUserInfo[];
}

export const useUIStore = create<UIState>((set, get) => ({
  activeChatId: null,
  activeGroupId: null,
  replyTo: null,
  modals: {
    editMessage: { isOpen: false, messageId: null },
    deleteMessage: { isOpen: false, messageId: null },
    editGroupMessage: { isOpen: false, messageId: null, groupId: null },
    deleteGroupMessage: { isOpen: false, messageId: null, groupId: null },
    createGroup: { isOpen: false },
  },
  typingUsers: new Map(),
  typingUsersMultiple: new Map(),
  setActiveChatId: (chatId) => set({ activeChatId: chatId, activeGroupId: null }),
  setActiveGroupId: (groupId) => set({ activeGroupId: groupId, activeChatId: null }),
  setReplyTo: (message) => set({ replyTo: message }),
  openEditModal: (messageId) =>
    set((state) => ({
      modals: {
        ...state.modals,
        editMessage: { isOpen: true, messageId },
      },
    })),
  closeEditModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        editMessage: { isOpen: false, messageId: null },
      },
    })),
  openDeleteModal: (messageId) =>
    set((state) => ({
      modals: {
        ...state.modals,
        deleteMessage: { isOpen: true, messageId },
      },
    })),
  closeDeleteModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        deleteMessage: { isOpen: false, messageId: null },
      },
    })),
  openCreateGroupModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        createGroup: { isOpen: true },
      },
    })),
  closeCreateGroupModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        createGroup: { isOpen: false },
      },
    })),
  openEditGroupMessageModal: (messageId, groupId) =>
    set((state) => ({
      modals: {
        ...state.modals,
        editGroupMessage: { isOpen: true, messageId, groupId },
      },
    })),
  closeEditGroupMessageModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        editGroupMessage: { isOpen: false, messageId: null, groupId: null },
      },
    })),
  openDeleteGroupMessageModal: (messageId, groupId) =>
    set((state) => ({
      modals: {
        ...state.modals,
        deleteGroupMessage: { isOpen: true, messageId, groupId },
      },
    })),
  closeDeleteGroupMessageModal: () =>
    set((state) => ({
      modals: {
        ...state.modals,
        deleteGroupMessage: { isOpen: false, messageId: null, groupId: null },
      },
    })),
  setUserTyping: (conversationId, userName) =>
    set((state) => {
      const newTypingUsers = new Map(state.typingUsers);
      newTypingUsers.set(conversationId, { userName, timestamp: Date.now() });
      return { typingUsers: newTypingUsers };
    }),
  clearUserTyping: (conversationId) =>
    set((state) => {
      const newTypingUsers = new Map(state.typingUsers);
      newTypingUsers.delete(conversationId);
      return { typingUsers: newTypingUsers };
    }),
  // Multiple typing users with avatar support
  setUserTypingWithAvatar: (conversationId, userId, userName, avatarUrl) =>
    set((state) => {
      const newTypingUsersMultiple = new Map(state.typingUsersMultiple);
      const conversationTyping = new Map(newTypingUsersMultiple.get(conversationId) || new Map());
      conversationTyping.set(userId, {
        userId,
        userName,
        avatarUrl,
        timestamp: Date.now(),
      });
      newTypingUsersMultiple.set(conversationId, conversationTyping);
      return { typingUsersMultiple: newTypingUsersMultiple };
    }),
  clearUserTypingById: (conversationId, userId) =>
    set((state) => {
      const newTypingUsersMultiple = new Map(state.typingUsersMultiple);
      const conversationTyping = newTypingUsersMultiple.get(conversationId);
      if (conversationTyping) {
        const newConversationTyping = new Map(conversationTyping);
        newConversationTyping.delete(userId);
        if (newConversationTyping.size === 0) {
          newTypingUsersMultiple.delete(conversationId);
        } else {
          newTypingUsersMultiple.set(conversationId, newConversationTyping);
        }
      }
      return { typingUsersMultiple: newTypingUsersMultiple };
    }),
  getTypingUsers: (conversationId) => {
    const state = get();
    const conversationTyping = state.typingUsersMultiple.get(conversationId);
    if (!conversationTyping) return [];
    return Array.from(conversationTyping.values());
  },
}));
