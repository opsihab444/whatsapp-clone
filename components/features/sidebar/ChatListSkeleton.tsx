import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for the chat list
 * Displays placeholder rows while conversations are loading
 * Matches the exact layout of ChatRow component
 */
export function ChatListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-0 h-[80px] mx-2 rounded-xl">
          {/* Avatar skeleton - matches ChatRow avatar size */}
          <Skeleton className="h-[54px] w-[54px] rounded-full shrink-0" />
          
          {/* Content skeleton - matches ChatRow content layout */}
          <div className="flex-1 min-w-0 flex flex-col justify-center h-full border-b border-border/50 pr-2 last:border-none">
            <div className="flex items-center justify-between mb-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
