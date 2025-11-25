'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 minute
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Retry up to 3 times for network errors
              if (failureCount >= 3) return false;

              // Don't retry on auth errors or validation errors
              if (error instanceof Error) {
                const message = error.message.toLowerCase();
                if (message.includes('auth') || message.includes('validation')) {
                  return false;
                }
              }

              return true;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          mutations: {
            retry: (failureCount, error) => {
              // Retry mutations up to 2 times for network errors only
              if (failureCount >= 2) return false;

              // Only retry on network errors
              if (error instanceof Error) {
                const message = error.message.toLowerCase();
                if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
                  return true;
                }
              }

              return false;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
