# Design Document

## Overview

This design document specifies the architecture for a production-ready, high-performance real-time chat application built with Next.js 15 (App Router) and Supabase. The system implements a WhatsApp-like experience with real-time messaging, optimistic updates, virtualized lists, and comprehensive security through Row Level Security (RLS).

The architecture follows a domain-driven structure with strict separation of concerns: service layer for all database interactions, TanStack Query for server state management, Zustand for client UI state, and React.memo with virtualization for optimal rendering performance.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Pages (RSC)          Components (Client)              │ │
│  │  - /(auth)/login      - Sidebar (ChatList, ChatRow)    │ │
│  │  - /(main)/page       - Chat (MessageList, Bubble)     │ │
│  │  - /(main)/c/[id]     - InputArea, TypingIndicator     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Hooks Layer                                           │ │
│  │  - useAuth, useChatList, useMessages, useRealtime      │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Service Layer (All DB Interactions)                   │ │
│  │  - auth.service.ts                                     │ │
│  │  - chat.service.ts                                     │ │
│  │  - message.service.ts                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Backend                       │
│  - PostgreSQL (messages, conversations, profiles)           │
│  - Auth (Google OAuth)                                      │
│  - Realtime (WebSocket subscriptions)                       │
│  - Storage (Image uploads)                                  │
│  - RLS (Row Level Security)                                 │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Framework**: Next.js 15 with App Router and TurboPack
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + Shadcn/UI (Radix) + clsx/tailwind-merge
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Client State**: Zustand (modals, reply-to, UI state)
- **Server State**: TanStack Query v5 (caching, optimistic updates)
- **Performance**: react-virtuoso (all lists), React.memo (granular memoization)
- **Icons**: Lucide React
- **Validation**: Zod + React Hook Form

## Components and Interfaces

### File Structure

```
/src
  /app
    /(auth)
      /login
        page.tsx                    # Google OAuth login page
    /(main)
      layout.tsx                    # AuthGuard + Global Realtime Listener
      page.tsx                      # Empty state ("Select a chat")
      /c
        /[chatId]
          page.tsx                  # Active chat window
  /components
    /ui                             # Shadcn components (button, input, etc.)
    /features
      /sidebar
        ChatList.tsx                # Virtualized conversation list
        ChatRow.tsx                 # Memoized conversation row
        SidebarHeader.tsx           # Search + user profile
      /chat
        MessageList.tsx             # Virtualized message list (reverse scroll)
        MessageBubble.tsx           # Memoized message bubble
        InputArea.tsx               # Message input with typing events
        TypingIndicator.tsx         # "User is typing..." indicator
  /hooks
    useAuth.ts                      # Authentication state
    useChatList.ts                  # TanStack Query for conversations
    useMessages.ts                  # TanStack Query for messages (infinite)
    useRealtime.ts                  # Global realtime subscription
  /lib
    /supabase
      client.ts                     # Browser client (@supabase/ssr)
      server.ts                     # Server client (@supabase/ssr)
    utils.ts                        # cn() helper, date formatters
  /services
    auth.service.ts                 # signInWithGoogle, signOut, getSession
    chat.service.ts                 # getConversations, updateUnreadCount
    message.service.ts              # getMessages, sendMessage, updateStatus
  /store
    ui.store.ts                     # Zustand: modals, replyTo, activeChatId
  /types
    database.types.ts               # Supabase generated types
    index.ts                        # App-specific types
```

### Core Components

#### ChatList (Sidebar)

**Responsibilities:**
- Fetch conversations using `useChatList` hook
- Render virtualized list with `react-virtuoso`
- Handle search/filter functionality
- Update on realtime events without full refetch

**Key Implementation Details:**
- Uses `Virtuoso` component with `itemContent` prop
- Sorts by `last_message_time DESC`
- Manual cache updates for new messages (move to index 0)
- Search filters locally without re-querying

#### ChatRow (Memoized)

**Responsibilities:**
- Display conversation preview (name, last message, timestamp, unread badge)
- Highlight active conversation
- Handle click to navigate

**Key Implementation Details:**
- Wrapped in `React.memo` with custom comparison function
- Only re-renders if `lastMessageId` or `unreadCount` changes
- Uses `clsx` for conditional styling

#### MessageList (Chat Window)

**Responsibilities:**
- Fetch messages using `useMessages` infinite query
- Render virtualized list with reverse scroll
- Auto-scroll to bottom on new messages (if already at bottom)
- Load older messages on scroll to top

**Key Implementation Details:**
- Uses `Virtuoso` with `followOutput="auto"`
- CSS: `flex-direction: column-reverse` for native bottom pinning
- Infinite scroll pagination (load 50 messages per page)
- Optimistic updates via TanStack Query cache manipulation

#### MessageBubble (Memoized)

**Responsibilities:**
- Display message content (text or image)
- Show status indicators (sent/delivered/read)
- Show "edited" indicator if applicable
- Handle long-press/right-click for edit/delete

**Key Implementation Details:**
- Wrapped in `React.memo` with shallow comparison
- Aspect-ratio placeholders for images (prevent CLS)
- Status icons: single check (sent), double check (delivered), blue double check (read)

#### InputArea

**Responsibilities:**
- Text input with auto-resize
- Send button (disabled during send)
- Image upload button
- Broadcast typing events (debounced)

**Key Implementation Details:**
- Uses `textarea` with auto-height adjustment
- Debounced typing broadcast (stops after 2s of inactivity)
- Stops typing event immediately on send
- Optimistic message insertion before API call

## Data Models

### Database Schema

#### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id UUID NOT NULL REFERENCES profiles(id),
  participant_2_id UUID NOT NULL REFERENCES profiles(id),
  last_message_content TEXT,
  last_message_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_1_id, participant_2_id)
);
```

#### messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT,
  type TEXT NOT NULL CHECK (type IN ('text', 'image')),
  media_url TEXT,
  media_width INTEGER,
  media_height INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
```

#### unread_counts
```sql
CREATE TABLE unread_counts (
  user_id UUID NOT NULL REFERENCES profiles(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, conversation_id)
);
```

### TypeScript Types

```typescript
// types/index.ts

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  last_message_content: string | null;
  last_message_time: string | null;
  created_at: string;
  other_user: Profile;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: MessageType;
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
  status: MessageStatus;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: Profile;
}

export interface OptimisticMessage extends Omit<Message, 'id'> {
  id: string; // Temporary client-side ID
  optimistic: true;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Conversation list sorting invariant
*For any* set of conversations, the sidebar SHALL display them sorted by `last_message_time` in descending order (most recent first).
**Validates: Requirements 2.1**

### Property 2: Cache update without refetch
*For any* conversation in the list, when a new message arrives for that conversation, the cache SHALL be updated to move it to index 0 without triggering a full refetch.
**Validates: Requirements 2.2**

### Property 3: Conversation row completeness
*For any* conversation displayed in the sidebar, the row SHALL contain contact name, last message preview, timestamp, and unread count.
**Validates: Requirements 2.4**

### Property 4: Unread badge visibility
*For any* conversation with unread_count > 0, the conversation row SHALL display an unread badge.
**Validates: Requirements 3.1**

### Property 5: Mark as read on open
*For any* conversation with unread messages, opening that conversation SHALL mark all its messages as read and set unread_count to 0.
**Validates: Requirements 3.2**

### Property 6: Unread count increment for inactive conversations
*For any* conversation that is not currently active, receiving a new message SHALL increment its unread_count by 1.
**Validates: Requirements 3.3**

### Property 7: Auto-read for active conversation
*For any* message arriving in the currently active conversation when the window is visible, the message SHALL be marked as read immediately.
**Validates: Requirements 3.4**

### Property 8: Tab title reflects total unread
*For any* change in total unread count across all conversations, the browser tab title SHALL be updated to reflect the new total.
**Validates: Requirements 3.5**

### Property 9: Optimistic message display
*For any* message sent by the user, the message SHALL appear in the chat window immediately with status "sending" before server confirmation.
**Validates: Requirements 4.1**

### Property 10: Status update on save
*For any* message successfully saved to the database, the status SHALL be updated from "sending" to "sent".
**Validates: Requirements 4.2**

### Property 11: Input field cleared after send
*For any* message send operation, the input field SHALL be cleared and focus SHALL be maintained on it.
**Validates: Requirements 4.4**

### Property 12: Send button disabled during send
*For any* message being sent, the send button SHALL be disabled until the operation completes.
**Validates: Requirements 4.5**

### Property 13: Realtime message append to active chat
*For any* realtime message event received for the active conversation, the message SHALL be appended to the chat window.
**Validates: Requirements 5.2**

### Property 14: Sidebar reorder on inactive conversation message
*For any* realtime message event for an inactive conversation, that conversation SHALL be moved to the top of the sidebar.
**Validates: Requirements 5.3**

### Property 15: Cache update without refetch on realtime event
*For any* realtime message event, the React Query cache SHALL be updated without triggering a full refetch.
**Validates: Requirements 5.4**

### Property 16: Message chronological ordering
*For any* conversation, messages SHALL be displayed in chronological order by created_at with the newest at the bottom.
**Validates: Requirements 6.1**

### Property 17: Auto-scroll when at bottom
*For any* new message arriving when the user is scrolled to the bottom, the chat window SHALL automatically scroll to show the new message.
**Validates: Requirements 6.2**

### Property 18: New message indicator when scrolled up
*For any* new message arriving when the user has scrolled up, a "new messages" indicator SHALL be displayed without auto-scrolling.
**Validates: Requirements 6.3**

### Property 19: Typing event broadcast
*For any* typing activity in the input field, a typing event SHALL be broadcast to the backend.
**Validates: Requirements 8.1**

### Property 20: Typing indicator display
*For any* typing event received for the active conversation, a typing indicator SHALL be displayed below the message list.
**Validates: Requirements 8.2**

### Property 21: Typing event stop on send
*For any* message send operation, typing event broadcast SHALL stop immediately.
**Validates: Requirements 8.5**

### Property 22: Initial message status
*For any* message successfully saved to the database, the initial status SHALL be "sent".
**Validates: Requirements 9.1**

### Property 23: Status progression to delivered
*For any* message received by the recipient's client via realtime, the status SHALL be updated to "delivered".
**Validates: Requirements 9.2**

### Property 24: Status progression to read
*For any* message viewed by the recipient in an active conversation, the status SHALL be updated to "read".
**Validates: Requirements 9.3**

### Property 25: Status indicator display
*For any* message displayed, a visual indicator SHALL be shown corresponding to its status (sent/delivered/read).
**Validates: Requirements 9.4**

### Property 26: RLS enforces conversation participation
*For any* user querying messages, only messages from conversations where the user is a participant SHALL be returned.
**Validates: Requirements 11.1**

### Property 27: Insert authorization check
*For any* message insert attempt, the operation SHALL only succeed if the user is a participant in the target conversation.
**Validates: Requirements 11.2**

### Property 28: Context menu for own messages
*For any* message sent by the current user, long-press or right-click SHALL display edit and delete options.
**Validates: Requirements 12.1**

### Property 29: Edit updates content and flag
*For any* message edited by the user, the content SHALL be updated and is_edited SHALL be set to true.
**Validates: Requirements 12.2**

### Property 30: Delete sets flag and replaces content
*For any* message deleted by the user, is_deleted SHALL be set to true and content SHALL be replaced with "This message was deleted".
**Validates: Requirements 12.3**

### Property 31: Edited indicator display
*For any* message with is_edited = true, an "edited" indicator SHALL be shown next to the timestamp.
**Validates: Requirements 12.5**

### Property 32: Service client selection
*For any* service function call, the appropriate Supabase client (browser or server) SHALL be used based on execution context.
**Validates: Requirements 13.2**

### Property 33: Structured error responses
*For any* service function error, a structured error object with type and message SHALL be returned.
**Validates: Requirements 13.3**

### Property 34: Optimistic cache addition
*For any* message sent by the user, the message SHALL be added to the local cache immediately before server confirmation.
**Validates: Requirements 14.1**

### Property 35: Cache update on server confirmation
*For any* message confirmed by the server, the message ID and status SHALL be updated in the cache.
**Validates: Requirements 14.2**

### Property 36: Search filter accuracy
*For any* search query in the sidebar, only conversations matching the contact name or last message content SHALL be displayed.
**Validates: Requirements 15.1**

### Property 37: Search result highlighting
*For any* search result displayed, matching text SHALL be highlighted in the conversation row.
**Validates: Requirements 15.2**


## Error Handling

### Service Layer Error Handling

All service functions return a consistent error structure:

```typescript
type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { type: string; message: string } };
```

**Error Types:**
- `AUTH_ERROR`: Authentication/authorization failures
- `VALIDATION_ERROR`: Input validation failures
- `NETWORK_ERROR`: Connection issues
- `NOT_FOUND`: Resource not found
- `PERMISSION_DENIED`: RLS policy violations
- `UPLOAD_ERROR`: File upload failures
- `UNKNOWN_ERROR`: Unexpected errors

### Component Error Handling

**Toast Notifications:**
- Use `sonner` for non-blocking error notifications
- Display user-friendly messages (hide technical details)
- Provide retry actions where applicable

**Error Boundaries:**
- Wrap main layout in React Error Boundary
- Catch rendering errors and display fallback UI
- Log errors to monitoring service (e.g., Sentry)

**Optimistic Update Rollback:**
- On message send failure, remove optimistic message from cache
- Display error toast with retry option
- Restore input field with failed message content

### Network Resilience

**Offline Queue:**
- Queue outgoing messages when offline
- Retry automatically when connection restored
- Show "offline" indicator in UI

**Realtime Reconnection:**
- Supabase Realtime handles reconnection automatically
- On reconnect, refetch latest messages to catch up
- Display "reconnecting..." indicator during downtime

## Testing Strategy

### Unit Testing

**Framework:** Vitest + React Testing Library

**Coverage Areas:**
1. **Service Functions:**
   - Test all CRUD operations with mocked Supabase client
   - Test error handling paths
   - Test client selection logic (browser vs server)

2. **Utility Functions:**
   - Date formatters
   - Message status helpers
   - Search/filter logic

3. **Component Logic:**
   - Message bubble rendering (text, image, edited, deleted)
   - Chat row rendering (unread badge, timestamp)
   - Input validation (file type, size)

**Example Test:**
```typescript
describe('message.service', () => {
  it('should send text message and return message object', async () => {
    const mockSupabase = createMockClient();
    const result = await sendMessage(mockSupabase, {
      conversation_id: 'conv-1',
      content: 'Hello',
      type: 'text'
    });
    expect(result.success).toBe(true);
    expect(result.data.content).toBe('Hello');
  });
});
```

### Property-Based Testing

**Framework:** fast-check (JavaScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `**Feature: whatsapp-clone, Property {number}: {property_text}**`

**Coverage Areas:**

1. **Sorting and Ordering:**
   - Property 1: Conversation list sorting
   - Property 16: Message chronological ordering
   - Generate random conversations/messages and verify sort order

2. **Cache Updates:**
   - Property 2: Cache update without refetch
   - Property 15: Realtime cache update
   - Generate random cache states and verify updates

3. **Unread Count Logic:**
   - Property 4-8: Unread badge, increment, decrement, tab title
   - Generate random conversation states and verify count calculations

4. **Status Progression:**
   - Property 26-28: Message status transitions
   - Generate random message states and verify valid transitions

5. **Validation:**
   - Property 19: Image file validation
   - Generate random files (valid/invalid types, sizes) and verify rejection

6. **Search/Filter:**
   - Property 41: Search filter accuracy
   - Generate random conversations and search queries, verify results

**Example Property Test:**
```typescript
import fc from 'fast-check';

/**
 * Feature: whatsapp-clone, Property 1: Conversation list sorting invariant
 */
test('conversations are always sorted by last_message_time DESC', () => {
  fc.assert(
    fc.property(
      fc.array(conversationArbitrary, { minLength: 1, maxLength: 100 }),
      (conversations) => {
        const sorted = sortConversations(conversations);
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = new Date(sorted[i].last_message_time);
          const next = new Date(sorted[i + 1].last_message_time);
          expect(current >= next).toBe(true);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Testing

**Framework:** Playwright (E2E)

**Coverage Areas:**
1. **Authentication Flow:**
   - Google OAuth login
   - Session persistence
   - Logout and cache clearing

2. **Real-time Messaging:**
   - Send message from User A, verify User B receives it
   - Test typing indicators between users
   - Test read receipts

3. **Image Upload:**
   - Upload image, verify storage and database entry
   - Test aspect ratio placeholder rendering

4. **Performance:**
   - Test virtualization with 1000+ conversations
   - Test smooth scrolling with 1000+ messages
   - Measure FPS during interactions

### Test Utilities

**Generators (for property tests):**
```typescript
// Arbitrary generators for fast-check
const conversationArbitrary = fc.record({
  id: fc.uuid(),
  last_message_time: fc.date(),
  last_message_content: fc.string(),
  unread_count: fc.nat(100)
});

const messageArbitrary = fc.record({
  id: fc.uuid(),
  content: fc.string({ maxLength: 1000 }),
  type: fc.constantFrom('text', 'image'),
  status: fc.constantFrom('sent', 'delivered', 'read'),
  created_at: fc.date()
});
```

**Mock Factories:**
```typescript
// Factory functions for unit tests
export const createMockConversation = (overrides?: Partial<Conversation>) => ({
  id: 'conv-1',
  participant_1_id: 'user-1',
  participant_2_id: 'user-2',
  last_message_content: 'Hello',
  last_message_time: new Date().toISOString(),
  unread_count: 0,
  ...overrides
});
```

## Implementation Details

### Supabase Client Setup

**Browser Client (`lib/supabase/client.ts`):**
```typescript
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

**Server Client (`lib/supabase/server.ts`):**
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createClient = () => {
  const cookieStore = cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
};
```

### TanStack Query Setup

**Query Client Configuration:**
```typescript
// app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});
```

**Chat List Hook:**
```typescript
// hooks/useChatList.ts
export const useChatList = () => {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => getConversations(supabase),
    select: (data) => data.sort((a, b) => 
      new Date(b.last_message_time).getTime() - 
      new Date(a.last_message_time).getTime()
    ),
  });
};
```

**Messages Infinite Query:**
```typescript
// hooks/useMessages.ts
export const useMessages = (conversationId: string) => {
  const supabase = createClient();
  
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam = 0 }) => 
      getMessages(supabase, conversationId, pageParam, 50),
    getNextPageParam: (lastPage, pages) => 
      lastPage.length === 50 ? pages.length * 50 : undefined,
    initialPageParam: 0,
  });
};
```

### Optimistic Updates

**Send Message with Optimistic Update:**
```typescript
// hooks/useMessages.ts
const sendMessageMutation = useMutation({
  mutationFn: (message: NewMessage) => sendMessage(supabase, message),
  onMutate: async (newMessage) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
    
    // Snapshot previous value
    const previousMessages = queryClient.getQueryData(['messages', conversationId]);
    
    // Optimistically update cache
    queryClient.setQueryData(['messages', conversationId], (old: any) => ({
      ...old,
      pages: old.pages.map((page: any, i: number) => 
        i === 0 ? [{ ...newMessage, id: `temp-${Date.now()}`, optimistic: true }, ...page] : page
      ),
    }));
    
    return { previousMessages };
  },
  onError: (err, newMessage, context) => {
    // Rollback on error
    queryClient.setQueryData(['messages', conversationId], context?.previousMessages);
  },
  onSuccess: (data) => {
    // Replace temp ID with real ID
    queryClient.setQueryData(['messages', conversationId], (old: any) => ({
      ...old,
      pages: old.pages.map((page: any) =>
        page.map((msg: any) => msg.optimistic ? data : msg)
      ),
    }));
  },
});
```

### Realtime Subscription

**Global Realtime Hook:**
```typescript
// hooks/useRealtime.ts
export const useRealtime = () => {
  const queryClient = useQueryClient();
  const { activeChatId } = useUIStore();
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMessage = payload.new as Message;
          
          // Update message cache
          if (newMessage.conversation_id === activeChatId && document.visibilityState === 'visible') {
            // Mark as read immediately
            markAsRead(supabase, newMessage.id);
            
            // Append to active chat
            queryClient.setQueryData(['messages', activeChatId], (old: any) => ({
              ...old,
              pages: [[newMessage, ...old.pages[0]], ...old.pages.slice(1)],
            }));
          } else {
            // Increment unread count
            queryClient.setQueryData(['conversations'], (old: any) =>
              old.map((conv: Conversation) =>
                conv.id === newMessage.conversation_id
                  ? { ...conv, unread_count: conv.unread_count + 1 }
                  : conv
              )
            );
          }
          
          // Move conversation to top
          queryClient.setQueryData(['conversations'], (old: any) => {
            const updated = old.map((conv: Conversation) =>
              conv.id === newMessage.conversation_id
                ? { ...conv, last_message_content: newMessage.content, last_message_time: newMessage.created_at }
                : conv
            );
            return updated.sort((a, b) => 
              new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime()
            );
          });
          
          // Update tab title
          updateTabTitle(queryClient);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChatId]);
};
```

### Virtualization Implementation

**Chat List (Sidebar):**
```typescript
// components/features/sidebar/ChatList.tsx
import { Virtuoso } from 'react-virtuoso';

export const ChatList = () => {
  const { data: conversations } = useChatList();
  
  return (
    <Virtuoso
      data={conversations}
      itemContent={(index, conversation) => (
        <ChatRow key={conversation.id} conversation={conversation} />
      )}
      style={{ height: '100%' }}
    />
  );
};
```

**Message List (Chat Window):**
```typescript
// components/features/chat/MessageList.tsx
import { Virtuoso } from 'react-virtuoso';

export const MessageList = ({ conversationId }: { conversationId: string }) => {
  const { data, fetchNextPage, hasNextPage } = useMessages(conversationId);
  const messages = data?.pages.flat() ?? [];
  
  return (
    <Virtuoso
      data={messages}
      followOutput="auto"
      startReached={() => hasNextPage && fetchNextPage()}
      itemContent={(index, message) => (
        <MessageBubble key={message.id} message={message} />
      )}
      style={{ display: 'flex', flexDirection: 'column-reverse' }}
    />
  );
};
```

### Memoization Strategy

**ChatRow Memoization:**
```typescript
// components/features/sidebar/ChatRow.tsx
export const ChatRow = React.memo(
  ({ conversation }: { conversation: Conversation }) => {
    // Component implementation
  },
  (prev, next) => 
    prev.conversation.last_message_time === next.conversation.last_message_time &&
    prev.conversation.unread_count === next.conversation.unread_count
);
```

**MessageBubble Memoization:**
```typescript
// components/features/chat/MessageBubble.tsx
export const MessageBubble = React.memo(
  ({ message }: { message: Message }) => {
    // Component implementation
  }
);
```

### Row Level Security (RLS) Policies

**Messages Table:**
```sql
-- Users can only read messages from their conversations
CREATE POLICY "Users can read own messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND (conversations.participant_1_id = auth.uid() OR conversations.participant_2_id = auth.uid())
  )
);

-- Users can only insert messages to their conversations
CREATE POLICY "Users can insert own messages"
ON messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND (conversations.participant_1_id = auth.uid() OR conversations.participant_2_id = auth.uid())
  )
);

-- Users can only update their own messages
CREATE POLICY "Users can update own messages"
ON messages FOR UPDATE
USING (sender_id = auth.uid());
```

**Conversations Table:**
```sql
-- Users can only read their own conversations
CREATE POLICY "Users can read own conversations"
ON conversations FOR SELECT
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());
```

### Storage Policies

**Media Bucket:**
```sql
-- Users can upload to their own folder
CREATE POLICY "Users can upload own media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read media from their conversations
CREATE POLICY "Users can read conversation media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'media' AND
  EXISTS (
    SELECT 1 FROM messages
    WHERE messages.media_url = storage.objects.name
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.participant_1_id = auth.uid() OR conversations.participant_2_id = auth.uid())
    )
  )
);
```

## Performance Optimizations

### Bundle Size
- Use dynamic imports for heavy components (image editor, emoji picker)
- Tree-shake unused Shadcn components
- Use `next/image` for automatic image optimization

### Rendering Performance
- React.memo on all list items (ChatRow, MessageBubble)
- Custom comparison functions to prevent unnecessary re-renders
- Virtualization for all lists (conversations, messages)
- Debounce typing events (2s)
- Throttle scroll events (100ms)

### Network Performance
- Prefetch conversations on login
- Lazy load images with blur placeholder
- Compress images before upload (client-side)
- Use Supabase CDN for media delivery
- Enable HTTP/2 and compression on Next.js

### Database Performance
- Index on `messages(conversation_id, created_at DESC)`
- Index on `conversations(participant_1_id, participant_2_id)`
- Denormalize `last_message_content` and `last_message_time` in conversations table
- Use database triggers to update denormalized fields
- Limit message queries to 50 per page

### Caching Strategy
- TanStack Query cache: 1 minute stale time
- Optimistic updates for instant feedback
- Manual cache updates on realtime events (no refetch)
- Persist auth session in cookies (SSR-compatible)

## Deployment Considerations

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

### Build Configuration
```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['xxx.supabase.co'],
  },
  experimental: {
    turbo: true, // Enable TurboPack
  },
};
```

### Monitoring
- Set up Sentry for error tracking
- Monitor Supabase realtime connection health
- Track Core Web Vitals (LCP, FID, CLS)
- Set up alerts for high error rates

### Scaling Considerations
- Supabase handles database scaling automatically
- Use Vercel Edge Functions for low-latency API routes
- Consider Redis for typing indicator state (if needed at scale)
- Implement rate limiting on message sends (prevent spam)
