import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  maxLength?: number;
  showCount?: boolean;
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, maxLength, showCount, autoResize, onChange, ...props }, ref) => {
    const [charCount, setCharCount] = React.useState(0);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    React.useImperativeHandle(ref, () => textareaRef.current!);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCharCount(e.target.value.length);

      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }

      onChange?.(e);
    };

    React.useEffect(() => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, [autoResize]);

    return (
      <div className="relative w-full">
        <textarea
          className={cn(
            'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors duration-200',
            'placeholder:text-muted-foreground',
            'outline-none focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:border-muted-foreground/30',
            'resize-none',
            error && 'border-destructive',
            className
          )}
          ref={textareaRef}
          maxLength={maxLength}
          onChange={handleChange}
          {...props}
        />
        {showCount && maxLength && (
          <div className="mt-1 flex justify-end">
            <span
              className={cn(
                'text-xs text-muted-foreground transition-colors',
                charCount >= maxLength && 'text-destructive font-medium'
              )}
            >
              {charCount} / {maxLength}
            </span>
          </div>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-destructive animate-slide-down">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
