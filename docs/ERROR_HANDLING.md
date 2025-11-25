# Error Handling and Toast Notifications

This document describes the error handling and notification system implemented in the WhatsApp clone application.

## Overview

The application implements a comprehensive error handling strategy that includes:

1. **Toast Notifications** - User-friendly notifications using Sonner
2. **Error Boundaries** - React error boundaries to catch rendering errors
3. **Network Status Monitoring** - Offline detection and notifications
4. **Retry Logic** - Automatic and manual retry for failed operations
5. **Offline Queue** - Message queuing when offline (foundation)

## Components

### 1. Toast Notifications (`lib/toast.utils.ts`)

Utility functions for displaying toast notifications:

```typescript
// Success notification
showSuccessToast('Message sent successfully');

// Error notification
showErrorToast('Failed to send message');

// Error with retry action
showErrorWithRetry('Failed to send message', () => retry(), 'Retry');

// Service error (automatically gets user-friendly message)
showServiceError(serviceError);

// Network error
showNetworkError(() => retry());

// Promise toast (updates based on promise state)
showPromiseToast(promise, {
  loading: 'Sending...',
  success: 'Sent!',
  error: 'Failed to send'
});
```

### 2. Error Boundary (`components/ErrorBoundary.tsx`)

React error boundary that catches rendering errors and displays a fallback UI:

- Catches all React rendering errors
- Provides a user-friendly error message
- Shows error details in development
- Offers "Try Again" and "Refresh Page" buttons
- Can be customized with a custom fallback component

**Usage:**
```tsx
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### 3. Network Status (`components/NetworkStatus.tsx`)

Monitors network connectivity and displays a banner when offline:

- Detects online/offline status
- Shows a persistent banner when offline
- Displays toast notifications on status changes
- Automatically dismisses when connection is restored

### 4. Offline Queue (`lib/offline-queue.ts`)

Foundation for queuing messages when offline:

```typescript
// Add message to queue
const messageId = addToQueue(conversationId, content);

// Get all queued messages
const queue = getQueue();

// Remove from queue after successful send
removeFromQueue(messageId);

// Check if there are queued messages
if (hasQueuedMessages()) {
  // Process queue
}
```

## TanStack Query Configuration

The QueryClient is configured with automatic retry logic:

### Query Retry Logic
- Retries up to 3 times for network errors
- Does NOT retry for auth or validation errors
- Uses exponential backoff (1s, 2s, 4s, max 30s)

### Mutation Retry Logic
- Retries up to 2 times for network errors only
- Uses exponential backoff (1s, 2s, max 10s)

## Error Handling by Component

### InputArea (Message Sending)

**Error Handling:**
- Optimistic updates with rollback on failure
- Restores message content on error (user doesn't lose text)
- Shows error toast with retry button
- Disables send button during operation

**Example:**
```typescript
onError: (error, content, context) => {
  // Rollback optimistic update
  queryClient.setQueryData(['messages', conversationId], context.previousMessages);
  
  // Restore message content
  setMessage(content);
  
  // Show error with retry
  showErrorWithRetry('Failed to send message', () => retry());
}
```

### ChatList (Conversation List)

**Error Handling:**
- Shows error message with details
- Provides retry button
- Maintains loading state during retry
- Graceful empty state handling

### MessageList (Message Display)

**Error Handling:**
- Shows error message with details
- Provides retry button
- Handles infinite scroll errors
- Maintains scroll position on retry

### Login Page

**Error Handling:**
- Displays inline error messages
- Shows toast notification on error
- Maintains form state on error
- Clear error messages

## Service Layer Error Handling

All service functions return a consistent `ServiceResult<T>` type:

```typescript
type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: ServiceError };
```

**Error Types:**
- `AUTH_ERROR` - Authentication/authorization failures
- `VALIDATION_ERROR` - Input validation failures
- `NETWORK_ERROR` - Connection issues
- `NOT_FOUND` - Resource not found
- `PERMISSION_DENIED` - RLS policy violations
- `UPLOAD_ERROR` - File upload failures
- `UNKNOWN_ERROR` - Unexpected errors

**User-Friendly Messages:**

The `getUserFriendlyMessage()` function converts technical errors to user-friendly messages:

```typescript
AUTH_ERROR → "Authentication failed. Please try again."
NETWORK_ERROR → "Network error. Please check your connection."
VALIDATION_ERROR → "Invalid input. Please check your data."
```

## Best Practices

### 1. Always Handle Errors in Mutations

```typescript
const mutation = useMutation({
  mutationFn: async (data) => {
    const result = await serviceFunction(data);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  },
  onError: (error) => {
    showErrorWithRetry('Operation failed', () => mutation.mutate(data));
  }
});
```

### 2. Use Optimistic Updates with Rollback

```typescript
onMutate: async (newData) => {
  await queryClient.cancelQueries({ queryKey: ['data'] });
  const previous = queryClient.getQueryData(['data']);
  queryClient.setQueryData(['data'], optimisticData);
  return { previous };
},
onError: (err, variables, context) => {
  queryClient.setQueryData(['data'], context.previous);
  showErrorToast('Operation failed');
}
```

### 3. Provide Retry Options

Always give users a way to retry failed operations:

```typescript
showErrorWithRetry('Failed to load data', () => refetch());
```

### 4. Show Loading States

Use loading states to indicate operations in progress:

```typescript
{isLoading && <Loader2 className="animate-spin" />}
```

### 5. Handle Network Errors Gracefully

Check for network errors and provide appropriate feedback:

```typescript
if (isNetworkError(error)) {
  showNetworkError(() => retry());
}
```

## Testing Error Handling

When testing components with error handling:

1. Test error states are displayed correctly
2. Test retry functionality works
3. Test error messages are user-friendly
4. Test optimistic updates rollback on error
5. Test loading states during operations

## Future Enhancements

1. **Offline Queue Processing** - Automatically process queued messages when connection is restored
2. **Error Logging** - Send errors to monitoring service (e.g., Sentry)
3. **Rate Limiting** - Implement rate limiting for retry attempts
4. **Error Analytics** - Track error rates and types
5. **Custom Error Pages** - Create custom error pages for different error types

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 1.4**: Authentication error handling with user feedback
- **Requirement 4.3**: Message send failure handling with rollback
- **Requirement 14.3**: Optimistic update error handling with consistent UI state

## Related Files

- `app/providers.tsx` - QueryClient configuration with retry logic
- `components/ErrorBoundary.tsx` - React error boundary
- `components/NetworkStatus.tsx` - Network status monitoring
- `lib/toast.utils.ts` - Toast notification utilities
- `lib/offline-queue.ts` - Offline message queue
- `services/error.utils.ts` - Error handling utilities
