'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, SignUpFormData } from '@/lib/validation';
import { signUpWithEmail } from '@/services/auth.service';
import { createClient } from '@/lib/supabase/client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Camera, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import Image from 'next/image';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function SignUpForm() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image must be less than 5MB');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMessage(null);
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', avatarFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Avatar upload error:', error);
      return null;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Upload avatar if selected
    let avatarUrl: string | undefined;
    if (avatarFile) {
      const uploadedUrl = await uploadAvatar();
      if (uploadedUrl) {
        avatarUrl = uploadedUrl;
      }
    }
    
    const result = await signUpWithEmail(supabase, {
      email: data.email,
      password: data.password,
      name: data.name,
      avatarUrl,
    });
    
    if (!result.success) {
      if (result.error.type === 'USER_EXISTS') {
        setErrorMessage('An account with this email already exists');
      } else {
        setErrorMessage(result.error.message);
      }
      setIsLoading(false);
      return;
    }

    // If session exists, user is logged in immediately
    if (result.data.session) {
      router.push('/c');
      router.refresh();
    } else {
      // Email confirmation required
      setSuccessMessage('Account created! Please check your email to confirm your account.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Avatar Upload */}
          <div className="flex justify-center">
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
                aria-label="Upload avatar"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative h-24 w-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-primary transition-all duration-200 group"
              >
                {avatarPreview ? (
                  <Image
                    src={avatarPreview}
                    alt="Avatar preview"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full">
                    <User className="h-10 w-10 text-zinc-500" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </button>
              <p className="text-xs text-zinc-500 text-center mt-2">Add photo (optional)</p>
            </div>
          </div>

          {/* Name Field */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-medium text-zinc-200">
                  Full Name
                </FormLabel>
                <FormControl>
                  <Input 
                    type="text" 
                    placeholder="John Doe" 
                    className="h-12 border-zinc-800 bg-zinc-950/50 px-4 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                  />
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

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
                      setSuccessMessage(null);
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
                      placeholder="Create a password"
                      className="h-12 border-zinc-800 bg-zinc-950/50 px-4 pr-12 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        setErrorMessage(null);
                        setSuccessMessage(null);
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

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-medium text-zinc-200">
                  Confirm Password
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      className="h-12 border-zinc-800 bg-zinc-950/50 px-4 pr-12 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
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

          {successMessage && (
            <div className="rounded-lg border border-green-900/50 bg-green-950/50 p-3">
              <p className="text-sm text-green-400">
                {successMessage}
              </p>
            </div>
          )}

          <Button 
            type="submit" 
            className="h-12 w-full bg-primary text-white hover:bg-primary/90 font-medium text-base shadow-lg shadow-primary/20" 
            disabled={isLoading || isUploadingAvatar}
          >
            {isLoading || isUploadingAvatar ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isUploadingAvatar ? 'Uploading...' : 'Creating account...'}
              </span>
            ) : (
              'Create Account'
            )}
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-900/50 px-3 text-zinc-500">
            Already have an account?
          </span>
        </div>
      </div>

      <div className="text-center">
        <Link 
          href="/login" 
          className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/50 px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          Sign in instead
        </Link>
      </div>
    </div>
  );
}
