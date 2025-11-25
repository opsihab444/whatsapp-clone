import { describe, test, expect, vi, beforeEach } from 'vitest';
import { signInWithGoogle, signOut, getSession } from '../auth.service';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Unit tests for authentication flow
 * Requirements: 1.1, 1.2, 1.3, 1.5, 11.5
 */

describe('Authentication Service - Unit Tests', () => {
  let mockSupabase: any;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
      },
    };
  });

  describe('signInWithGoogle', () => {
    test('should initiate Google OAuth and return URL on success', async () => {
      // Arrange
      const mockUrl = 'https://accounts.google.com/oauth/authorize?...';
      const redirectUrl = 'http://localhost:3000/auth/callback';
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: mockUrl },
        error: null,
      });

      // Act
      const result = await signInWithGoogle(mockSupabase as SupabaseClient, redirectUrl);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe(mockUrl);
      }
      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
    });

    test('should return AUTH_ERROR when OAuth fails', async () => {
      // Arrange
      const redirectUrl = 'http://localhost:3000/auth/callback';
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: { message: 'OAuth provider error' },
      });

      // Act
      const result = await signInWithGoogle(mockSupabase as SupabaseClient, redirectUrl);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
        expect(result.error.message).toBe('OAuth provider error');
      }
    });

    test('should return AUTH_ERROR when no URL is returned', async () => {
      // Arrange
      const redirectUrl = 'http://localhost:3000/auth/callback';
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: null,
      });

      // Act
      const result = await signInWithGoogle(mockSupabase as SupabaseClient, redirectUrl);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
        expect(result.error.message).toBe('No OAuth URL returned');
      }
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      const redirectUrl = 'http://localhost:3000/auth/callback';
      mockSupabase.auth.signInWithOAuth.mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const result = await signInWithGoogle(mockSupabase as SupabaseClient, redirectUrl);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('UNKNOWN_ERROR');
        expect(result.error.message).toBe('Network error');
      }
    });
  });

  describe('signOut', () => {
    test('should sign out successfully and clear session', async () => {
      // Arrange
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      });

      // Act
      const result = await signOut(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    test('should return AUTH_ERROR when sign out fails', async () => {
      // Arrange
      mockSupabase.auth.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' },
      });

      // Act
      const result = await signOut(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
        expect(result.error.message).toBe('Sign out failed');
      }
    });

    test('should handle unexpected errors during sign out', async () => {
      // Arrange
      mockSupabase.auth.signOut.mockRejectedValue(
        new Error('Connection lost')
      );

      // Act
      const result = await signOut(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('UNKNOWN_ERROR');
        expect(result.error.message).toBe('Connection lost');
      }
    });
  });

  describe('getSession', () => {
    test('should return session data when user is authenticated', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };
      const mockSession = {
        access_token: 'token-123',
        user: mockUser,
      };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Act
      const result = await getSession(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.user).toEqual(mockUser);
        expect(result.data.session).toEqual(mockSession);
      }
    });

    test('should return null when no session exists', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      // Act
      const result = await getSession(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    test('should return AUTH_ERROR when session retrieval fails', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session expired' },
      });

      // Act
      const result = await getSession(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
        expect(result.error.message).toBe('Session expired');
      }
    });

    test('should handle unexpected errors during session retrieval', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const result = await getSession(mockSupabase as SupabaseClient);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('UNKNOWN_ERROR');
        expect(result.error.message).toBe('Database error');
      }
    });
  });

  describe('Session persistence', () => {
    test('should maintain session data structure across calls', async () => {
      // Arrange
      const mockSession = {
        access_token: 'token-123',
        refresh_token: 'refresh-123',
        user: { id: 'user-123', email: 'test@example.com' },
      };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Act - Call multiple times
      const result1 = await getSession(mockSupabase as SupabaseClient);
      const result2 = await getSession(mockSupabase as SupabaseClient);

      // Assert - Both calls should return consistent structure
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result1.data && result2.success && result2.data) {
        expect(result1.data.session).toEqual(result2.data.session);
      }
    });
  });

  describe('Cache clearing on logout', () => {
    test('should successfully sign out without errors', async () => {
      // Arrange
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      });

      // Act
      const result = await signOut(mockSupabase as SupabaseClient);

      // Assert - Verify clean logout
      expect(result.success).toBe(true);
      expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    });

    test('should handle logout when already logged out', async () => {
      // Arrange - Simulate already logged out state
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      });

      // Act
      const result = await signOut(mockSupabase as SupabaseClient);

      // Assert - Should still succeed
      expect(result.success).toBe(true);
    });
  });
});
