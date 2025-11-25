import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for the chat list
 * Displays placeholder rows while conversations are loading
 */
export function ChatListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 border-b">
          {/* Avatar skeleton */}
          <Skeleton className="h-10 w-10 rounded-full" />
          
          {/* Content skeleton */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}
