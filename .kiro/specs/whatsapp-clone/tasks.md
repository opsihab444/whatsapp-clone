# Implementation Plan

## Overview
This implementation plan breaks down the WhatsApp clone into discrete, manageable coding tasks. Each task builds incrementally on previous steps, with property-based tests integrated close to implementation to catch errors early.

## Tasks

- [x] 1. Project setup and Supabase configuration





  - Initialize Next.js 15 project with TypeScript and App Router
  - Install dependencies: @supabase/ssr, @tanstack/react-query, zustand, react-virtuoso, lucide-react, tailwindcss, zod, react-hook-form, fast-check
  - Configure Tailwind CSS and create base styles
  - Set up Supabase clients (browser and server) in `/lib/supabase/`
  - Create environment variables structure
  - _Requirements: 1.1, 13.1, 13.2_

- [x] 2. Database types and service layer foundation





  - Generate TypeScript types from Supabase schema in `/types/database.types.ts`
  - Create base service result type and error types in `/types/index.ts`
  - Implement `auth.service.ts` with signInWithGoogle, signOut, getSession functions
  - Implement error handling utilities
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 2.1 Write property test for service error handling


  - **Property 33: Structured error responses**
  - **Validates: Requirements 13.3**

- [x] 3. Authentication flow





  - Create login page at `/(auth)/login/page.tsx` with Google sign-in button
  - Implement OAuth callback handling
  - Create AuthGuard component for `/(main)/layout.tsx`
  - Handle session persistence and refresh
  - Implement logout functionality with cache clearing
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 11.4, 11.5_

- [x] 3.1 Write unit tests for authentication flow


  - Test Google OAuth initiation
  - Test session persistence
  - Test logout and cache clearing
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 11.5_

- [x] 4. TanStack Query setup and providers




  - Create QueryClient configuration in `/app/providers.tsx`
  - Wrap app with QueryClientProvider
  - Configure default query options (staleTime, refetchOnWindowFocus)
  - _Requirements: 13.4_

- [x] 5. Zustand store for UI state


  - Create `/store/ui.store.ts` with activeChatId, modals, replyTo state
  - Implement selectors and actions
  - _Requirements: 13.1_

- [x] 6. Chat service layer


  - Implement `chat.service.ts` with getConversations, updateUnreadCount functions
  - Handle conversation queries with participant joins
  - Implement search/filter logic
  - _Requirements: 2.1, 2.4, 3.1, 3.2, 15.1_

- [x] 6.1 Write property test for conversation sorting


  - **Property 1: Conversation list sorting invariant**
  - **Validates: Requirements 2.1**


- [x] 6.2 Write property test for search filter accuracy

  - **Property 36: Search filter accuracy**
  - **Validates: Requirements 15.1**

- [x] 7. Message service layer


  - Implement `message.service.ts` with getMessages, sendMessage, updateMessageStatus, editMessage, deleteMessage functions
  - Handle pagination for message queries
  - Implement message validation
  - _Requirements: 4.1, 4.2, 6.1, 9.1, 9.2, 9.3, 12.2, 12.3_

- [x] 7.1 Write property test for message chronological ordering


  - **Property 16: Message chronological ordering**
  - **Validates: Requirements 6.1**

- [x] 7.2 Write property test for message status progression


  - **Property 22, 23, 24: Initial status, delivered, read**
  - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 8. Shadcn/UI components setup


  - Install and configure Shadcn/UI
  - Add base components: button, input, textarea, badge, avatar, dropdown-menu, toast
  - Create utility functions (cn, date formatters) in `/lib/utils.ts`
  - _Requirements: Multiple UI requirements_

- [x] 9. Sidebar components - Part 1 (Basic structure)


  - Create `SidebarHeader.tsx` with user profile and search input
  - Create basic `ChatRow.tsx` component with conversation data display
  - Implement memoization with custom comparison function
  - Style with Tailwind CSS
  - _Requirements: 2.4, 15.1_

- [x] 9.1 Write property test for conversation row completeness


  - **Property 3: Conversation row completeness**
  - **Validates: Requirements 2.4**

- [x] 10. Sidebar components - Part 2 (Virtualization)








  - Create `ChatList.tsx` with react-virtuoso integration
  - Implement `useChatList` hook with TanStack Query
  - Connect to chat service layer
  - Handle loading and error states
  - _Requirements: 2.1, 2.3, 2.5_

- [x] 11. Unread count functionality





  - Implement unread badge display in ChatRow
  - Create logic to mark messages as read on conversation open
  - Implement tab title updates based on total unread count
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 11.1 Write property test for unread badge visibility


  - **Property 4: Unread badge visibility**
  - **Validates: Requirements 3.1**

- [x] 11.2 Write property test for mark as read on open


  - **Property 5: Mark as read on open**
  - **Validates: Requirements 3.2**

- [x] 11.3 Write property test for tab title updates


  - **Property 8: Tab title reflects total unread**
  - **Validates: Requirements 3.5**

- [x] 12. Message components - Part 1 (Message bubble)





  - Create `MessageBubble.tsx` with text message rendering
  - Implement status indicators (sent/delivered/read icons)
  - Add "edited" indicator for edited messages
  - Handle deleted message display
  - Implement memoization
  - _Requirements: 9.4, 12.3, 12.5_

- [x] 12.1 Write property test for status indicator display


  - **Property 25: Status indicator display**
  - **Validates: Requirements 9.4**


- [x] 12.2 Write property test for edited indicator display

  - **Property 31: Edited indicator display**
  - **Validates: Requirements 12.5**

- [x] 13. Message components - Part 2 (Message list)





  - Create `MessageList.tsx` with react-virtuoso and reverse scroll
  - Implement `useMessages` hook with infinite query
  - Handle auto-scroll to bottom logic
  - Implement "new messages" indicator when scrolled up
  - Connect to message service layer
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 13.1 Write property test for auto-scroll behavior


  - **Property 17: Auto-scroll when at bottom**
  - **Validates: Requirements 6.2**



- [x] 13.2 Write property test for new message indicator


  - **Property 18: New message indicator when scrolled up**
  - **Validates: Requirements 6.3**


- [x] 14. Input area and message sending

  - Create `InputArea.tsx` with textarea and send button
  - Implement auto-resize textarea
  - Add send button with disabled state during send
  - Clear input and maintain focus after send
  - _Requirements: 4.4, 4.5_

- [x] 14.1 Write property test for input field behavior


  - **Property 11: Input field cleared after send**
  - **Validates: Requirements 4.4**


- [x] 14.2 Write property test for send button state


  - **Property 12: Send button disabled during send**
  - **Validates: Requirements 4.5**

- [x] 15. Optimistic updates for message sending

  - Implement optimistic message insertion in useMessages hook
  - Add temporary ID generation for optimistic messages

  - Handle success: replace temp ID with real ID
  - Handle failure: rollback and show error toast
  - _Requirements: 4.1, 4.2, 4.3, 14.1, 14.2, 14.3_

- [x] 15.1 Write property test for optimistic message display

  - **Property 9: Optimistic message display**
  - **Validates: Requirements 4.1**


- [x] 15.2 Write property test for status update on save


  - **Property 10: Status update on save**
  - **Validates: Requirements 4.2**


- [x] 15.3 Write property test for optimistic cache operations


  - **Property 34, 35: Optimistic cache addition and update**
  - **Validates: Requirements 14.1, 14.2**

- [x] 16. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Realtime subscription setup





  - Create `useRealtime` hook in `/hooks/useRealtime.ts`
  - Subscribe to INSERT events on messages table
  - Implement logic to append messages to active chat
  - Implement logic to update sidebar for inactive conversations
  - Handle message status updates via realtime
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 17.1 Write property test for realtime message append


  - **Property 13: Realtime message append to active chat**
  - **Validates: Requirements 5.2**


- [x] 17.2 Write property test for sidebar reorder on realtime

  - **Property 14: Sidebar reorder on inactive conversation message**
  - **Validates: Requirements 5.3**

- [x] 17.3 Write property test for cache update without refetch


  - **Property 2, 15: Cache update without refetch**
  - **Validates: Requirements 2.2, 5.4**

- [x] 18. Unread count realtime updates





  - Implement auto-read for active conversation messages
  - Implement unread count increment for inactive conversations
  - Update tab title on realtime unread count changes
  - _Requirements: 3.3, 3.4_


- [x] 18.1 Write property test for unread count increment

  - **Property 6: Unread count increment for inactive conversations**
  - **Validates: Requirements 3.3**


- [x] 18.2 Write property test for auto-read behavior

  - **Property 7: Auto-read for active conversation**
  - **Validates: Requirements 3.4**

- [x] 19. Typing indicators





  - Create `TypingIndicator.tsx` component
  - Implement typing event broadcast in InputArea (debounced)
  - Subscribe to typing events in useRealtime
  - Display typing indicator for active conversation
  - Hide indicator after 3s timeout
  - Stop broadcasting on message send
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 19.1 Write property test for typing event broadcast


  - **Property 19: Typing event broadcast**
  - **Validates: Requirements 8.1**


- [x] 19.2 Write property test for typing indicator display







  - **Property 20: Typing indicator display**


  - **Validates: Requirements 8.2**

- [x] 19.3 Write property test for typing stop on send


  - **Property 21: Typing event stop on send**
  - **Validates: Requirements 8.5**


- [x] 20. Message edit and delete functionality




  - Add context menu (long-press/right-click) to MessageBubble
  - Implement edit modal with form validation
  - Implement delete confirmation dialog
  - Update message service calls for edit/delete
  - Broadcast changes via realtime
  - _Requirements: 12.1, 12.2, 12.3, 12.4_


- [x] 20.1 Write property test for context menu display


  - **Property 28: Context menu for own messages**
  - **Validates: Requirements 12.1**




- [x] 20.2 Write property test for edit behavior






  - **Property 29: Edit updates content and flag**

  - **Validates: Requirements 12.2**

- [x] 20.3 Write property test for delete behavior


  - **Property 30: Delete sets flag and replaces content**
  - **Validates: Requirements 12.3**

- [x] 21. Search functionality





  - Implement search input in SidebarHeader
  - Add filter logic to useChatList hook
  - Implement text highlighting in ChatRow
  - Handle empty search results
  - Maintain virtualization during search
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 21.1 Write property test for search result highlighting


  - **Property 37: Search result highlighting**
  - **Validates: Requirements 15.2**

- [x] 22. Main layout and routing





  - Create `/(main)/layout.tsx` with AuthGuard and global realtime listener
  - Create `/(main)/page.tsx` with empty state ("Select a chat")
  - Create `/(main)/c/[chatId]/page.tsx` with MessageList and InputArea
  - Implement navigation between conversations
  - _Requirements: 2.1, 6.1_


- [x] 23. RLS policies verification




  - Verify RLS policies are enforced for message queries
  - Verify RLS policies are enforced for message inserts
  - Test unauthorized access attempts
  - _Requirements: 11.1, 11.2_

- [x] 23.1 Write property test for RLS enforcement







  - **Property 26, 27: RLS enforces participation and insert authorization**
  - **Validates: Requirements 11.1, 11.2**

- [x] 24. Error handling and toast notifications








  - Implement toast notifications using sonner
  - Add error boundaries to main layout
  - Handle network errors gracefully
  - Implement retry logic for failed operations
  - _Requirements: 1.4, 4.3, 14.3_
-

- [x] 25. Performance optimizations




  - Verify React.memo is applied to ChatRow and MessageBubble
  - Verify virtualization is working for both lists
  - Test with 1000+ conversations and messages
  - Optimize bundle size with dynamic imports
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 26. Offline support and queue





  - Implement message queue for offline sends
  - Add retry logic when connection restored
  - Display offline indicator in UI
  - _Requirements: 5.5_
-

- [x] 27. Final polish and styling




  - Implement responsive design for mobile
  - Add loading skeletons for better UX
  - Polish animations and transitions
  - Ensure accessibility (keyboard navigation, ARIA labels)
  - _Requirements: Multiple UI requirements_


- [x] 28. Final checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

- [x] 29. Integration testing setup





- [ ] 29. Integration testing setup
  - Set up Playwright for E2E tests
  - Write integration tests for authentication flow
  - Write integration tests for real-time messaging between two users
  - Write integration tests for typing indicators and read receipts
  - _Requirements: All requirements_
