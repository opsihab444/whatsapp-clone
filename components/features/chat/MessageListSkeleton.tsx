import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading skeleton for the message list
 * Displays placeholder message bubbles while messages are loading
 */
export function MessageListSkeleton() {
  return (
    <div className="h-full px-4 py-2 space-y-4">
      {Array.from({ length: 6 }).map((_, i) => {
        const isOwnMessage = i % 3 === 0;
        return (
          <div
            key={i}
            className={cn(
              'flex w-full',
              isOwnMessage ? 'justify-end' : 'justify-start'
            )}
          >
            <div className="max-w-[70%] space-y-2">
              <Skeleton className={cn('h-16 rounded-lg', isOwnMessage ? 'w-48' : 'w-56')} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
