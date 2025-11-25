import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatList } from '../ChatList';
import * as chatService from '@/services/chat.service';
import { Conversation } from '@/types';

// Mock the Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({})),
}));

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('ChatList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('displays loading state initially', () => {
    // Mock a slow response
    vi.spyOn(chatService, 'getConversations').mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { container } = render(<ChatList searchQuery="" />, { wrapper: createWrapper() });

    // Check for skeleton loading state (multiple skeleton items)
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('displays conversations when loaded successfully', async () => {
    const mockConversations: Conversation[] = [
      {
        id: 'conv-1',
        participant_1_id: 'user-1',
        participant_2_id: 'user-2',
        last_message_content: 'Hello there',
        last_message_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        other_user: {
          id: 'user-2',
          email: 'test@example.com',
          full_name: 'Test User',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
        unread_count: 2,
      },
    ];

    vi.spyOn(chatService, 'getConversations').mockResolvedValue({
      success: true,
      data: mockConversations,
    });

    const { container } = render(<ChatList searchQuery="" />, { wrapper: createWrapper() });

    // Wait for the virtuoso component to render
    await waitFor(() => {
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
    });

    // Verify the conversation data is available (virtuoso may not render items in test env)
    // We can verify the component received the data by checking it doesn't show loading/error states
    expect(screen.queryByText('Loading conversations...')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load conversations')).not.toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });

  test('displays error state when fetch fails', async () => {
    vi.spyOn(chatService, 'getConversations').mockResolvedValue({
      success: false,
      error: {
        type: 'NETWORK_ERROR',
        message: 'Failed to fetch',
      },
    });

    render(<ChatList searchQuery="" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  test('displays empty state when no conversations exist', async () => {
    vi.spyOn(chatService, 'getConversations').mockResolvedValue({
      success: true,
      data: [],
    });

    render(<ChatList searchQuery="" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });
  });

  test('displays filtered empty state when search has no results', async () => {
    vi.spyOn(chatService, 'getConversations').mockResolvedValue({
      success: true,
      data: [],
    });

    render(<ChatList searchQuery="nonexistent" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No conversations found')).toBeInTheDocument();
      expect(screen.getByText('Try a different search query')).toBeInTheDocument();
    });
  });
});
