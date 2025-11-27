'use client';

import { useRef, useCallback, useLayoutEffect, MutableRefObject, useEffect } from 'react';

interface ScrollAnchor {
  scrollTop: number;
  scrollHeight: number;
}

interface UseScrollAnchorOptions<T extends { id: string }> {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  messages: T[];
  isFetchingNextPage: boolean;
}

interface UseScrollAnchorReturn {
  isRestoring: boolean;
  captureAnchor: () => void;
  canFetch: () => boolean;
}

/**
 * Scroll anchor hook using scrollHeight difference approach.
 * 
 * When older messages are prepended:
 * 1. scrollHeight increases by the height of new content
 * 2. We add that difference to scrollTop to maintain visual position
 */
export function useScrollAnchor<T extends { id: string }>({
  containerRef,
  messages,
  isFetchingNextPage,
}: UseScrollAnchorOptions<T>): UseScrollAnchorReturn {
  const isRestoringRef = useRef(false);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const prevFetchingRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);
  const rafIdRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Capture current scroll state before fetch
   */
  const captureAnchor = useCallback(() => {
    if (isRestoringRef.current) return;
    
    const container = containerRef.current;
    if (!container) return;

    anchorRef.current = {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
    };
    isRestoringRef.current = true;
  }, [containerRef]);

  const canFetch = useCallback(() => {
    return !isRestoringRef.current;
  }, []);

  /**
   * Restore scroll position by adding height difference
   */
  const restoreScrollPosition = useCallback(() => {
    const container = containerRef.current;
    const anchor = anchorRef.current;
    
    if (!container || !anchor) return false;

    const heightDiff = container.scrollHeight - anchor.scrollHeight;
    
    if (heightDiff > 0) {
      container.scrollTop = anchor.scrollTop + heightDiff;
      anchorRef.current = {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      };
      return true;
    }
    return false;
  }, [containerRef]);

  /**
   * Main restoration effect - runs when fetch completes
   */
  useLayoutEffect(() => {
    const wasFetching = prevFetchingRef.current;
    prevFetchingRef.current = isFetchingNextPage;

    if (wasFetching && !isFetchingNextPage && anchorRef.current) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      restoreScrollPosition();

      let attempts = 0;
      const maxAttempts = 5;
      
      const attemptRestore = () => {
        restoreScrollPosition();
        attempts++;
        
        if (attempts < maxAttempts) {
          rafIdRef.current = requestAnimationFrame(attemptRestore);
        } else {
          timeoutRef.current = setTimeout(() => {
            prevMessageCountRef.current = messages.length;
            anchorRef.current = null;
            isRestoringRef.current = false;
          }, 30);
        }
      };

      rafIdRef.current = requestAnimationFrame(attemptRestore);
    }
  }, [isFetchingNextPage, messages.length, restoreScrollPosition]);

  useLayoutEffect(() => {
    if (isRestoringRef.current && anchorRef.current) {
      restoreScrollPosition();
    }
  }, [messages.length, restoreScrollPosition]);

  useEffect(() => {
    if (!isRestoringRef.current || !anchorRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isRestoringRef.current && anchorRef.current) {
        restoreScrollPosition();
      }
    });

    const scrollContent = container.firstElementChild;
    if (scrollContent) {
      observer.observe(scrollContent);
    }

    return () => observer.disconnect();
  }, [containerRef, restoreScrollPosition, isRestoringRef.current]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    isRestoring: isRestoringRef.current,
    captureAnchor,
    canFetch,
  };
}
