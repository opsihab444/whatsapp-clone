import { create } from 'zustand';

interface ReplyToMessage {
  id: string;
  content: string;
  senderName: string;
}

interface UIState {
  activeChatId: string | null;
  replyTo: ReplyToMessage | null;
  modals: {
    editMessage: { isOpen: boolean; messageId: string | null };
    deleteMessage: { isOpen: boolean; messageId: string | null };
  };
  typingUsers: Map<string, { userName: string; timestamp: number }>;
  setActiveChatId: (chatId: string | null) => void;
  setReplyTo: (message: ReplyToMessage | null) => void;
  openEditModal: (messageId: string) => void;
  closeEditModal: () => void;
  openDeleteModal: (messageId: string) => void;
  closeDeleteModal: () => void;
  setUserTyping: (conversationId: string, userName: string) => void;
  clearUserTyping: (conversationId: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeChatId: null,
  replyTo: null,
  modals: {
    editMessage: { isOpen: false, messageId: null },
    deleteMessage: { isOpen: false, messageId: null },
  },
  typingUsers: new Map(),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
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
}));
