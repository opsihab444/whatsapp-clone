import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'gradient';
  size?: 'sm' | 'default' | 'lg';
  pulse?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', size = 'default', pulse, ...props }, ref) => {
    const variants = {
      default:
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
      outline:
        'border-2 border-input text-foreground hover:bg-accent',
      success:
        'bg-green-500 text-white hover:bg-green-600 shadow-sm',
      gradient:
        'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      default: 'px-2.5 py-1 text-sm',
      lg: 'px-3 py-1.5 text-base',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-full font-medium transition-all duration-200',
          variants[variant],
          sizes[size],
          pulse && 'animate-pulse',
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
