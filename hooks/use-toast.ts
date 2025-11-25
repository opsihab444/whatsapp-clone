import { useCallback } from 'react';

export interface Toast {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = useCallback((props: Toast) => {
    // Simple console log for now - can be enhanced with a proper toast component
    if (props.variant === 'destructive') {
      console.error(`❌ ${props.title}`, props.description || '');
    } else {
      console.log(`✓ ${props.title}`, props.description || '');
    }
  }, []);

  return { toast };
}
