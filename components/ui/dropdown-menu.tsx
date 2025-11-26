'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | undefined>(undefined);

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('useDropdownMenu must be used within DropdownMenu');
  }
  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, className, onClick, asChild, ...props }, ref) => {
  const { open, setOpen } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOpen(!open);
    onClick?.(e);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      ref,
      onClick: handleClick,
      'aria-expanded': open,
      'aria-haspopup': 'menu',
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn('outline-none', className)}
      onClick={handleClick}
      aria-expanded={open}
      aria-haspopup="menu"
      {...props}
    >
      {children}
    </button>
  );
});

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' | 'end' }
>(({ children, className, align = 'end', ...props }, ref) => {
  const { open, setOpen } = useDropdownMenu();
  const [isMounted, setIsMounted] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useImperativeHandle(ref, () => contentRef.current!);

  React.useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        const trigger = contentRef.current.parentElement?.querySelector('[aria-haspopup="menu"]');
        if (trigger && !trigger.contains(e.target as Node)) {
          setOpen(false);
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, setOpen]);

  React.useEffect(() => {
    if (open && contentRef.current) {
      // Find the trigger button - it might be in the parent's parent due to portal
      const findTrigger = () => {
        // First try to find in the immediate context
        const triggers = document.querySelectorAll('[aria-haspopup="menu"]');
        // Find the one that was most recently clicked (should be expanded)
        for (let i = triggers.length - 1; i >= 0; i--) {
          if (triggers[i].getAttribute('aria-expanded') === 'true') {
            return triggers[i];
          }
        }
        return null;
      };

      const trigger = findTrigger();
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const contentRect = contentRef.current.getBoundingClientRect();

        let left = triggerRect.right - contentRect.width;
        if (align === 'start') {
          left = triggerRect.left;
        } else if (align === 'center') {
          left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        }

        const top = triggerRect.bottom + 8;

        setPosition({ top, left });
      }
    }
  }, [open, align]);

  if (!open || !isMounted) return null;

  const content = (
    <div
      ref={contentRef}
      role="menu"
      className={cn(
        'fixed z-50 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
        'backdrop-blur-sm bg-opacity-95',
        'animate-slide-down',
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      {...props}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
});

DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(({ children, className, onClick, disabled, ...props }, ref) => {
  const { setOpen } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    onClick?.(e);
    setOpen(false);
  };

  return (
    <div
      ref={ref}
      role="menuitem"
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus:bg-accent focus:text-accent-foreground',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      onClick={handleClick}
      tabIndex={disabled ? -1 : 0}
      {...props}
    >
      {children}
    </div>
  );
});

DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

// Legacy exports for compatibility
export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-3 py-2 text-sm font-semibold text-foreground', className)}
    {...props}
  />
));

DropdownMenuLabel.displayName = 'DropdownMenuLabel';
