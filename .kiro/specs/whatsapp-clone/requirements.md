# Requirements Document

## Introduction

This document specifies the requirements for a production-ready, high-performance real-time chat application (WhatsApp Competitor) built with Next.js latast and Supabase. The system enables users to authenticate via Google, engage in one-on-one conversations, send text and media messages, and receive real-time updates with optimistic UI patterns. The application prioritizes performance through virtualization, granular memoization, and efficient state management.

## Glossary

- **Chat Application**: The Next.js 15 web application providing the user interface and client-side logic
- **Supabase Backend**: The backend infrastructure providing PostgreSQL database, authentication, real-time subscriptions, and file storage
- **Conversation**: A one-on-one chat thread between two users
- **Message**: A single communication unit within a conversation (text or media)
- **Sidebar**: The left panel displaying the list of conversations sorted by recency
- **Chat Window**: The main panel displaying messages for the active conversation
- **Optimistic Update**: A UI update applied immediately before server confirmation
- **Virtualization**: Rendering only visible list items to improve performance
- **RLS**: Row Level Security policies in PostgreSQL
- **Read Receipt**: Status indicator showing message delivery and read state
- **Typing Indicator**: Visual feedback showing when the other user is composing a message
- **Media Message**: A message containing an image file with metadata

## Requirements

### Requirement 1

**User Story:** As a new user, I want to authenticate using my Google account, so that I can securely access the chat application without creating a new password.

#### Acceptance Criteria

1. WHEN a user navigates to the login page, THE Chat Application SHALL display a Google sign-in button
2. WHEN a user clicks the Google sign-in button, THE Chat Application SHALL initiate the OAuth flow with Supabase Auth
3. WHEN authentication succeeds, THE Chat Application SHALL redirect the user to the main chat interface
4. WHEN authentication fails, THE Chat Application SHALL display an error message and maintain the user on the login page
5. WHEN an authenticated user refreshes the page, THE Chat Application SHALL maintain the session without requiring re-authentication

### Requirement 2

**User Story:** As an authenticated user, I want to view a list of my conversations sorted by most recent activity, so that I can quickly access my active chats.

#### Acceptance Criteria

1. WHEN the user accesses the main interface, THE Chat Application SHALL display the Sidebar with all conversations sorted by last_message_time in descending order
2. WHEN a conversation receives a new message, THE Chat Application SHALL move that conversation to the top of the Sidebar without refetching the entire list
3. WHEN the Sidebar contains more than 20 conversations, THE Chat Application SHALL render the list using virtualization to maintain performance
4. WHEN a conversation is displayed in the Sidebar, THE Chat Application SHALL show the contact name, last message preview, timestamp, and unread count
5. WHEN the user scrolls through the conversation list, THE Chat Application SHALL render only visible items plus a buffer zone

### Requirement 3

**User Story:** As a user viewing the conversation list, I want to see unread message counts, so that I know which conversations require my attention.

#### Acceptance Criteria

1. WHEN a conversation contains unread messages, THE Chat Application SHALL display the unread count as a badge on the conversation row
2. WHEN the user opens a conversation, THE Chat Application SHALL mark all messages in that conversation as read
3. WHEN a new message arrives for a conversation that is not currently open, THE Chat Application SHALL increment the unread count for that conversation
4. WHEN a new message arrives for the currently open conversation AND the window is visible, THE Chat Application SHALL mark the message as read immediately
5. WHEN the total unread count changes, THE Chat Application SHALL update the browser tab title to reflect the total unread messages

### Requirement 4

**User Story:** As a user, I want to send text messages in real-time, so that I can communicate instantly with my contacts.

#### Acceptance Criteria

1. WHEN the user types a message and presses Enter or clicks send, THE Chat Application SHALL display the message in the Chat Window immediately with a "sending" status
2. WHEN the message is successfully saved to the Supabase Backend, THE Chat Application SHALL update the message status to "sent"
3. WHEN the message save operation fails, THE Chat Application SHALL remove the optimistic message and display an error notification
4. WHEN the user sends a message, THE Chat Application SHALL clear the input field and maintain focus on it
5. WHEN a message is being sent, THE Chat Application SHALL disable the send button to prevent duplicate submissions

### Requirement 5

**User Story:** As a user, I want to receive messages in real-time without refreshing the page, so that I can have fluid conversations.

#### Acceptance Criteria

1. WHEN a new message is inserted into the messages table for a conversation, THE Supabase Backend SHALL broadcast the message via real-time subscription
2. WHEN the Chat Application receives a real-time message event for the active conversation, THE Chat Application SHALL append the message to the Chat Window
3. WHEN the Chat Application receives a real-time message event for an inactive conversation, THE Chat Application SHALL update the Sidebar to move that conversation to the top
4. WHEN the Chat Application receives a real-time message event, THE Chat Application SHALL update the React Query cache without triggering a full refetch
5. WHEN the user's internet connection is lost, THE Chat Application SHALL queue outgoing messages and retry when connection is restored

### Requirement 6

**User Story:** As a user viewing a conversation, I want to see messages in a scrollable list with the newest at the bottom, so that I can follow the conversation naturally.

#### Acceptance Criteria

1. WHEN the user opens a conversation, THE Chat Application SHALL display messages in chronological order with the newest message at the bottom
2. WHEN new messages arrive, THE Chat Application SHALL automatically scroll to the bottom IF the user is already at the bottom
3. WHEN new messages arrive AND the user has scrolled up, THE Chat Application SHALL display a "new messages" indicator without auto-scrolling
4. WHEN the Chat Window contains more than 50 messages, THE Chat Application SHALL use virtualization to render only visible messages
5. WHEN the user scrolls to the top of the message list, THE Chat Application SHALL load older messages using infinite scroll pagination

### Requirement 7 (DEFERRED - Will be added later)

**User Story:** As a user, I want to send image messages, so that I can share visual content with my contacts.

#### Acceptance Criteria

1. WHEN the user selects an image file, THE Chat Application SHALL validate that the file is an image type and under 10MB
2. WHEN the user sends an image, THE Chat Application SHALL upload the file to Supabase Storage and display a loading placeholder
3. WHEN the image upload completes, THE Chat Application SHALL save the message with the media URL, width, and height to the database
4. WHEN an image message is displayed, THE Chat Application SHALL render an aspect-ratio placeholder matching the image dimensions to prevent layout shift
5. WHEN an image fails to upload, THE Chat Application SHALL display an error and allow the user to retry

**Note:** This requirement is deferred to a future phase. Initial implementation will focus on text messaging only.

### Requirement 8

**User Story:** As a user, I want to see when my contact is typing, so that I know they are actively composing a response.

#### Acceptance Criteria

1. WHEN the user types in the input field, THE Chat Application SHALL broadcast a typing event to the Supabase Backend
2. WHEN the Chat Application receives a typing event for the active conversation, THE Chat Application SHALL display a typing indicator below the message list
3. WHEN no typing events are received for 3 seconds, THE Chat Application SHALL hide the typing indicator
4. WHEN the user stops typing for 2 seconds, THE Chat Application SHALL stop broadcasting typing events
5. WHEN the user sends a message, THE Chat Application SHALL immediately stop broadcasting typing events

### Requirement 9

**User Story:** As a user, I want to see delivery and read receipts for my messages, so that I know when my contact has received and read them.

#### Acceptance Criteria

1. WHEN a message is successfully saved to the database, THE Chat Application SHALL set the message status to "sent"
2. WHEN the recipient's client receives the message via real-time subscription, THE Chat Application SHALL update the message status to "delivered"
3. WHEN the recipient views the message in an active conversation, THE Chat Application SHALL update the message status to "read"
4. WHEN displaying a message, THE Chat Application SHALL show a visual indicator corresponding to the message status (sent/delivered/read)
5. WHEN a message status changes, THE Chat Application SHALL update only the affected message component without re-rendering the entire list

### Requirement 10

**User Story:** As a user, I want the application to perform smoothly even with thousands of messages, so that I can have a responsive experience.

#### Acceptance Criteria

1. WHEN rendering the conversation list, THE Chat Application SHALL use react-virtuoso to render only visible items
2. WHEN rendering the message list, THE Chat Application SHALL use react-virtuoso with reverse scrolling to render only visible messages
3. WHEN a conversation row's data changes, THE Chat Application SHALL re-render only that specific row using React.memo with custom comparison
4. WHEN a message bubble's data changes, THE Chat Application SHALL re-render only that specific bubble using React.memo
5. WHEN the user interacts with the UI, THE Chat Application SHALL maintain 60fps performance with no janky scrolling or input lag

### Requirement 11

**User Story:** As a user, I want my messages to be secure and private, so that only authorized participants can access conversation data.

#### Acceptance Criteria

1. WHEN a user attempts to query messages, THE Supabase Backend SHALL enforce RLS policies to return only messages from conversations the user participates in
2. WHEN a user attempts to insert a message, THE Supabase Backend SHALL verify the user is a participant in the target conversation
3. WHEN a user attempts to access media files, THE Supabase Backend SHALL verify the user has access to the associated conversation
4. WHEN authentication tokens expire, THE Chat Application SHALL refresh them automatically using Supabase SSR
5. WHEN a user logs out, THE Chat Application SHALL clear all cached data and redirect to the login page

### Requirement 12

**User Story:** As a user, I want to edit or delete my sent messages, so that I can correct mistakes or remove unwanted content.

#### Acceptance Criteria

1. WHEN the user long-presses or right-clicks their own message, THE Chat Application SHALL display options to edit or delete
2. WHEN the user edits a message, THE Chat Application SHALL update the message content and set the is_edited flag to true
3. WHEN the user deletes a message, THE Chat Application SHALL set the is_deleted flag to true and replace the content with "This message was deleted"
4. WHEN a message is edited or deleted, THE Chat Application SHALL broadcast the change via real-time subscription to all participants
5. WHEN displaying an edited message, THE Chat Application SHALL show an "edited" indicator next to the timestamp

### Requirement 13

**User Story:** As a developer, I want all database interactions isolated in service files, so that the codebase is maintainable and testable.

#### Acceptance Criteria

1. WHEN the application needs to interact with the database, THE Chat Application SHALL call functions from service files (auth.service.ts, chat.service.ts, message.service.ts)
2. WHEN a service function is called, THE Chat Application SHALL use the appropriate Supabase client (browser or server) based on the execution context
3. WHEN a service function encounters an error, THE Chat Application SHALL return a structured error object with type and message
4. WHEN components need data, THE Chat Application SHALL use TanStack Query hooks that call service functions
5. WHEN service functions are updated, THE Chat Application SHALL maintain backward compatibility with existing hook implementations

### Requirement 14

**User Story:** As a user on a slow network, I want to see optimistic updates, so that the interface feels responsive even with latency.

#### Acceptance Criteria

1. WHEN the user sends a message, THE Chat Application SHALL immediately add the message to the local cache before server confirmation
2. WHEN the server confirms the message, THE Chat Application SHALL update the message ID and status in the cache
3. WHEN the server rejects the message, THE Chat Application SHALL remove the optimistic message and display an error
4. WHEN the user performs an action, THE Chat Application SHALL provide immediate visual feedback within 100ms
5. WHEN optimistic updates are applied, THE Chat Application SHALL ensure the UI remains consistent with eventual server state

### Requirement 15

**User Story:** As a user, I want to search through my conversations, so that I can quickly find specific chats or messages.

#### Acceptance Criteria

1. WHEN the user types in the Sidebar search field, THE Chat Application SHALL filter conversations by contact name or last message content
2. WHEN search results are displayed, THE Chat Application SHALL highlight matching text in conversation rows
3. WHEN the search query is cleared, THE Chat Application SHALL restore the full conversation list
4. WHEN filtering conversations, THE Chat Application SHALL maintain virtualization for performance
5. WHEN no conversations match the search query, THE Chat Application SHALL display a "no results" message
