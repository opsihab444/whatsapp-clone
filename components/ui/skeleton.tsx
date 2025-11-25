import * as React from 'react';
import { cn } from '@/lib/utils';

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-md bg-muted',
          'before:absolute before:inset-0',
          'before:-translate-x-full',
          'before:animate-shimmer',
          'before:bg-gradient-to-r',
          'before:from-transparent before:via-white/10 before:to-transparent',
          className
        )}
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
          backgroundSize: '200% 100%',
        }}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
