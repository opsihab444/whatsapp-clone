'use client';

import * as React from 'react';
import { useFormContext, FormProvider, FieldValues, UseFormReturn, Controller, ControllerProps, FieldPath } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

// Form component
export function Form<TFieldValues extends FieldValues = FieldValues>({
  children,
  ...props
}: {
  children: React.ReactNode;
} & UseFormReturn<TFieldValues>) {
  return <FormProvider {...props}>{children}</FormProvider>;
}

// FormField component
interface FormFieldContextValue<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

// FormItem component
export const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn('space-y-2', className)} {...props} />;
  }
);

FormItem.displayName = 'FormItem';

// FormLabel component
export const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { name } = React.useContext(FormFieldContext);
  const { formState } = useFormContext();
  const error = formState.errors[name];

  return (
    <Label
      ref={ref}
      className={cn(error && 'text-destructive', className)}
      htmlFor={name}
      {...props}
    />
  );
});

FormLabel.displayName = 'FormLabel';

// FormControl component
export const FormControl = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { name } = React.useContext(FormFieldContext);

  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
});

FormControl.displayName = 'FormControl';

// FormDescription component
export const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { name } = React.useContext(FormFieldContext);

  return (
    <p
      ref={ref}
      id={`${name}-description`}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});

FormDescription.displayName = 'FormDescription';

// FormMessage component
export const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { name } = React.useContext(FormFieldContext);
  const { formState } = useFormContext();
  const error = formState.errors[name];
  const body = error ? String(error.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={`${name}-message`}
      className={cn('text-sm text-destructive animate-slide-down', className)}
      {...props}
    >
      {body}
    </p>
  );
});

FormMessage.displayName = 'FormMessage';
