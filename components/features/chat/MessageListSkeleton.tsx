import { Loader2 } from 'lucide-react';

/**
 * Simple loading spinner for the message list
 */
export function MessageListSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-[#00a884] animate-spin" />
    </div>
  );
}
