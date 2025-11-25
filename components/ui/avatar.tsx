'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// Main Avatar context for compositional API
const AvatarContext = React.createContext<{
  src?: string | null;
  fallback?: string;
  size?: string;
}>({});

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'default' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'busy';
  showStatus?: boolean;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt = 'Avatar', fallback, size = 'default', status, showStatus, children, ...props }, ref) => {
    const sizes = {
      sm: 'h-8 w-8 text-xs',
      default: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-16 w-16 text-lg',
    };

    const statusColors = {
      online: 'bg-green-500',
      offline: 'bg-gray-400',
      away: 'bg-yellow-500',
      busy: 'bg-red-500',
    };

    // If children are provided (compositional API), use context
    if (children) {
      return (
        <AvatarContext.Provider value={{ src, fallback, size: sizes[size] }}>
          <div
            ref={ref}
            className={cn(
              'relative inline-flex shrink-0 overflow-hidden rounded-full transition-transform hover:scale-105',
              sizes[size],
              className
            )}
            {...props}
          >
            {children}
            {showStatus && status && (
              <span
                className={cn(
                  'absolute bottom-0 right-0 block rounded-full ring-2 ring-background',
                  size === 'sm' ? 'h-2 w-2' : 'h-3 w-3',
                  statusColors[status],
                  status === 'online' && 'animate-pulse'
                )}
              />
            )}
          </div>
        </AvatarContext.Provider>
      );
    }

    // Direct API (when no children)
    const [imageError, setImageError] = React.useState(false);
    const shouldShowFallback = !src || imageError;

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 overflow-hidden rounded-full transition-transform hover:scale-105',
          sizes[size],
          className
        )}
        {...props}
      >
        {shouldShowFallback ? (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground font-medium">
            {fallback || alt?.[0]?.toUpperCase() || '?'}
          </div>
        ) : (
          <Image
            src={src!}
            alt={alt}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}

        {showStatus && status && (
          <span
            className={cn(
              'absolute bottom-0 right-0 block rounded-full ring-2 ring-background',
              size === 'sm' ? 'h-2 w-2' : 'h-3 w-3',
              statusColors[status],
              status === 'online' && 'animate-pulse'
            )}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

// Compositional API components (for backward compatibility)
const AvatarImage = React.forwardRef<
  HTMLDivElement,
  { src?: string; alt?: string; className?: string }
>(({ src, alt, className }, ref) => {
  const [imageError, setImageError] = React.useState(false);

  if (!src || imageError) {
    return null;
  }

  return (
    <Image
      src={src}
      alt={alt || 'Avatar'}
      fill
      className={cn('object-cover', className)}
      onError={() => setImageError(true)}
    />
  );
});

const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex h-full w-full items-center justify-center bg-muted text-muted-foreground', className)}
      {...props}
    >
      {children}
    </div>
  );
});

AvatarImage.displayName = 'AvatarImage';
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
