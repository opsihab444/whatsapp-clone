import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors duration-200',
            'placeholder:text-muted-foreground',
            'outline-none focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:border-muted-foreground/30',
            icon && 'pl-10',
            error && 'border-destructive',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-destructive animate-slide-down">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
