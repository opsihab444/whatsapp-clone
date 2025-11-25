'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, SignInFormData } from '@/lib/validation';
import { signInWithEmail } from '@/services/auth.service';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function SignInForm() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: SignInFormData) => {
    setIsLoading(true);
    setErrorMessage(null);
    
    const result = await signInWithEmail(supabase, data);
    
    if (!result.success) {
      setErrorMessage(result.error.message);
      setIsLoading(false);
      return;
    }

    router.push('/c');
    router.refresh();
  };

  return (
    <div className="w-full space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-medium text-zinc-200">
                  Email Address
                </FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    placeholder="you@example.com" 
                    className="h-12 border-zinc-800 bg-zinc-950/50 px-4 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setErrorMessage(null);
                    }}
                  />
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-medium text-zinc-200">
                  Password
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      className="h-12 border-zinc-800 bg-zinc-950/50 px-4 pr-12 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        setErrorMessage(null);
                      }}
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Eye className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          {errorMessage && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/50 p-3">
              <p className="text-sm text-red-400">
                {errorMessage}
              </p>
            </div>
          )}

          <Button 
            type="submit" 
            className="h-12 w-full bg-primary text-white hover:bg-primary/90 font-medium text-base shadow-lg shadow-primary/20" 
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-900/50 px-3 text-zinc-500">
            New here?
          </span>
        </div>
      </div>

      <div className="text-center">
        <Link 
          href="/signup" 
          className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/50 px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
