# Design Document

## Overview

This design document specifies the architecture for replacing the Google OAuth authentication system with a traditional email/password authentication system in the WhatsApp clone application. The system will use Supabase Auth's built-in email/password authentication, maintain the existing service layer pattern, and provide a seamless user experience with proper validation, error handling, and session management.

The architecture maintains strict separation of concerns with authentication logic isolated in the service layer, form validation using React Hook Form and Zod, and consistent error handling across all authentication flows.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Pages (Client Components)                             │ │
│  │  - /(auth)/login      → Sign In Page                   │ │
│  │  - /(auth)/signup     → Sign Up Page                   │ │
│  │  - /(main)/*          → Protected Routes               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Components                                            │ │
│  │  - SignInForm         → Email/Password Sign In         │ │
│  │  - SignUpForm         → Email/Password Sign Up         │ │
│  │  - AuthGuard          → Route Protection               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Service Layer                                         │ │
│  │  - auth.service.ts    → All Auth Operations            │ │
│  │    • signUpWithEmail()                                 │ │
│  │    • signInWithEmail()                                 │ │
│  │    • signOut()                                         │ │
│  │    • getSession()                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Backend                       │
│  - Auth (Email/Password)                                    │
│  - PostgreSQL (profiles table)                              │
│  - Session Management                                       │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + Shadcn/UI (initialized with `npx shadcn@latest init`)
- **UI Components**: Shadcn/UI components (Button, Input, Label, Form)
- **Backend**: Supabase Auth (Email/Password)
- **Validation**: Zod + React Hook Form
- **Icons**: Lucide React
- **Toast Notifications**: Sonner

## Components and Interfaces

### File Structure

```
/app
  /(auth)
    /login
      page.tsx                    # Sign In Page
    /signup
      page.tsx                    # Sign Up Page
    /auth
      /callback
        route.ts                  # OAuth callback (keep for future)
  /(main)
    layout.tsx                    # AuthGuard wrapper
    
/components
  /auth
    SignInForm.tsx                # Email/Password Sign In Form
    SignUpForm.tsx                # Email/Password Sign Up Form
    AuthGuard.tsx                 # Route protection component
    
/services
  auth.service.ts                 # Authentication service functions
    - signUpWithEmail()
    - signInWithEmail()
    - signOut()
    - getSession()
    
/lib
  /supabase
    client.ts                     # Browser Supabase client
    server.ts                     # Server Supabase client
  validation.ts                   # Zod schemas for auth forms
```

### Core Components

#### SignInForm

**Responsibilities:**
- Render email and password input fields
- Validate form inputs using React Hook Form + Zod
- Handle form submission and call auth service
- Display validation and authentication errors
- Provide link to sign-up page
- Toggle password visibility

**Key Implementation Details:**
- Uses `useForm` from React Hook Form with Zod resolver
- Disables submit button during authentication
- Clears errors on input change
- Shows field-specific validation errors
- Redirects to main page on successful sign-in

#### SignUpForm

**Responsibilities:**
- Render email, password, and confirm password fields
- Validate form inputs (email format, password strength, password match)
- Handle form submission and call auth service
- Display validation and registration errors
- Provide link to sign-in page
- Toggle password visibility for both password fields

**Key Implementation Details:**
- Uses `useForm` with custom Zod schema including password confirmation
- Validates password minimum length (8 characters)
- Validates password and confirm password match
- Shows real-time validation feedback
- Redirects to main page on successful sign-up

#### AuthGuard

**Responsibilities:**
- Check authentication status on mount
- Redirect unauthenticated users to sign-in page
- Show loading state while checking session
- Protect all routes under /(main)

**Key Implementation Details:**
- Uses `useEffect` to check session on mount
- Calls `getSession()` from auth service
- Redirects using Next.js router
- Shows skeleton/loading UI during check

## Data Models

### Supabase Auth User

Supabase Auth automatically manages user records. The user object includes:

```typescript
interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at: string | null;
  // ... other Supabase auth fields
}
```

### Profile Table (Existing)

The existing `profiles` table will continue to work with email/password auth:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Trigger to create profile on sign-up:**

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### TypeScript Types

```typescript
// types/index.ts

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}
```

### Validation Schemas

```typescript
// lib/validation.ts
import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type SignInFormData = z.infer<typeof signInSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Valid sign-up creates account
*For any* valid email and password (8+ characters), submitting the sign-up form should successfully create a new account in Supabase Auth.
**Validates: Requirements 1.2**

### Property 2: Short passwords are rejected
*For any* password shorter than 8 characters, the validation should fail and display an error message.
**Validates: Requirements 1.4**

### Property 3: Mismatched passwords are rejected
*For any* pair of passwords where password ≠ confirmPassword, the validation should fail and display an error message.
**Validates: Requirements 1.5**

### Property 4: Valid sign-in authenticates user
*For any* valid email/password credentials for an existing user, submitting the sign-in form should successfully authenticate and redirect to the main interface.
**Validates: Requirements 2.2**

### Property 5: Successful authentication stores session
*For any* successful authentication (sign-in or sign-up), a session should be stored securely in Supabase Auth.
**Validates: Requirements 2.5**

### Property 6: Session persists across page refresh
*For any* authenticated user session that has not expired, refreshing the page should maintain the session without requiring re-authentication.
**Validates: Requirements 3.1**

### Property 7: Session persists across browser restart
*For any* valid session that has not expired, closing and reopening the browser should maintain the session.
**Validates: Requirements 3.3**

### Property 8: Unauthenticated access redirects to sign-in
*For any* protected route accessed without authentication, the application should redirect to the sign-in page.
**Validates: Requirements 3.5**

### Property 9: Sign-out terminates session
*For any* authenticated user, clicking sign-out should terminate the current session.
**Validates: Requirements 4.1**

### Property 10: Sign-out clears cached data
*For any* successful sign-out operation, all cached authentication data should be cleared.
**Validates: Requirements 4.2**

### Property 11: Sign-out removes tokens
*For any* sign-out operation, all authentication tokens should be removed from storage.
**Validates: Requirements 4.5**

### Property 12: Service uses correct client
*For any* service function call, the appropriate Supabase client (browser or server) should be used based on the execution context.
**Validates: Requirements 5.2**

### Property 13: Service errors are structured
*For any* error encountered in a service function, a structured error object with type and message fields should be returned.
**Validates: Requirements 5.3**

### Property 14: Validation errors display correctly
*For any* validation error, a field-specific error message should be displayed below the relevant input field.
**Validates: Requirements 6.4**

### Property 15: Success clears errors
*For any* successful authentication, all error messages should be cleared from the UI.
**Validates: Requirements 6.5**

### Property 16: Password toggle reveals text
*For any* password value, clicking the show/hide toggle should reveal the password as plain text.
**Validates: Requirements 8.2**

### Property 17: Password toggle is reversible
*For any* password field, toggling visibility twice (show then hide) should return to the masked state.
**Validates: Requirements 8.3**

### Property 18: Icon matches visibility state
*For any* password field, the icon should be an eye-slash when visible and an eye when masked.
**Validates: Requirements 8.4, 8.5**

## Error Handling

### Service Layer Error Handling

All authentication service functions return a consistent error structure:

```typescript
type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { type: string; message: string } };
```

**Error Types:**
- `AUTH_ERROR`: Authentication failures (invalid credentials, user not found)
- `VALIDATION_ERROR`: Input validation failures (weak password, invalid email)
- `NETWORK_ERROR`: Connection issues
- `USER_EXISTS`: Email already registered
- `UNKNOWN_ERROR`: Unexpected errors

### Error Messages

**User-Friendly Error Messages:**
- Invalid credentials: "Invalid email or password"
- Email already exists: "An account with this email already exists"
- Weak password: "Password must be at least 8 characters and contain uppercase, lowercase, and numbers"
- Network error: "Connection error. Please try again"
- Empty fields: "This field is required"

### Component Error Handling

**Form Validation:**
- Real-time validation using React Hook Form
- Field-specific error messages below inputs
- Disable submit button during submission
- Clear errors on input change

**Toast Notifications:**
- Use `sonner` for non-blocking error notifications
- Display user-friendly messages
- Auto-dismiss after 5 seconds
- Provide retry actions where applicable

**Error Recovery:**
- On sign-up failure, maintain form data (except passwords)
- On sign-in failure, clear password field only
- On network error, provide retry button
- On validation error, focus first invalid field

## Testing Strategy

### Unit Testing

**Framework:** Vitest + React Testing Library

**Coverage Areas:**

1. **Service Functions:**
   - Test `signUpWithEmail()` with valid and invalid data
   - Test `signInWithEmail()` with valid and invalid credentials
   - Test `signOut()` success and failure paths
   - Test `getSession()` with and without active session
   - Test error handling and structured error responses
   - Test client selection logic (browser vs server)

2. **Validation Schemas:**
   - Test email validation (valid/invalid formats)
   - Test password length validation
   - Test password strength requirements
   - Test password confirmation matching
   - Test empty field validation

3. **Component Logic:**
   - Test SignInForm submission with valid data
   - Test SignUpForm submission with valid data
   - Test form validation error display
   - Test password visibility toggle
   - Test navigation links between sign-in/sign-up
   - Test AuthGuard redirect behavior

**Example Test:**
```typescript
describe('auth.service', () => {
  it('should sign up user with valid email and password', async () => {
    const mockSupabase = createMockClient();
    const result = await signUpWithEmail(mockSupabase, {
      email: 'test@example.com',
      password: 'SecurePass123'
    });
    expect(result.success).toBe(true);
    expect(result.data.user.email).toBe('test@example.com');
  });

  it('should return error for password shorter than 8 characters', async () => {
    const mockSupabase = createMockClient();
    const result = await signUpWithEmail(mockSupabase, {
      email: 'test@example.com',
      password: 'Short1'
    });
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('VALIDATION_ERROR');
  });
});
```

### Property-Based Testing

**Framework:** fast-check (JavaScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `**Feature: email-password-auth, Property {number}: {property_text}**`

**Coverage Areas:**

1. **Sign-Up Validation:**
   - Property 1: Valid sign-up creates account
   - Property 2: Short passwords are rejected
   - Property 3: Mismatched passwords are rejected
   - Generate random valid/invalid credentials and verify behavior

2. **Sign-In Authentication:**
   - Property 4: Valid sign-in authenticates user
   - Property 5: Successful authentication stores session
   - Generate random valid credentials and verify authentication

3. **Session Management:**
   - Property 6: Session persists across page refresh
   - Property 7: Session persists across browser restart
   - Property 8: Unauthenticated access redirects
   - Generate random session states and verify persistence

4. **Sign-Out Behavior:**
   - Property 9: Sign-out terminates session
   - Property 10: Sign-out clears cached data
   - Property 11: Sign-out removes tokens
   - Generate random authenticated states and verify cleanup

5. **Error Handling:**
   - Property 13: Service errors are structured
   - Property 14: Validation errors display correctly
   - Property 15: Success clears errors
   - Generate random error conditions and verify responses

6. **Password Visibility:**
   - Property 16: Password toggle reveals text
   - Property 17: Password toggle is reversible
   - Property 18: Icon matches visibility state
   - Generate random password values and verify toggle behavior

**Example Property Test:**
```typescript
import fc from 'fast-check';

/**
 * Feature: email-password-auth, Property 2: Short passwords are rejected
 */
test('passwords shorter than 8 characters are rejected', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 7 }),
      fc.emailAddress(),
      async (password, email) => {
        const result = await signUpWithEmail(mockSupabase, {
          email,
          password
        });
        expect(result.success).toBe(false);
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Feature: email-password-auth, Property 3: Mismatched passwords are rejected
 */
test('mismatched passwords are rejected', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 8 }),
      fc.string({ minLength: 8 }),
      fc.emailAddress(),
      (password1, password2, email) => {
        fc.pre(password1 !== password2); // Only test when passwords differ
        
        const result = validateSignUp({
          email,
          password: password1,
          confirmPassword: password2
        });
        
        expect(result.success).toBe(false);
        expect(result.errors.confirmPassword).toContain("don't match");
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Feature: email-password-auth, Property 17: Password toggle is reversible
 */
test('password visibility toggle is reversible', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      (password) => {
        const { getByLabelText, getByRole } = render(<SignInForm />);
        const passwordInput = getByLabelText('Password') as HTMLInputElement;
        const toggleButton = getByRole('button', { name: /show password/i });
        
        // Initial state: masked
        expect(passwordInput.type).toBe('password');
        
        // Toggle to visible
        fireEvent.click(toggleButton);
        expect(passwordInput.type).toBe('text');
        
        // Toggle back to masked
        fireEvent.click(toggleButton);
        expect(passwordInput.type).toBe('password');
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Utilities

**Generators (for property tests):**
```typescript
// Arbitrary generators for fast-check

const validPasswordArbitrary = fc.string({ minLength: 8, maxLength: 50 })
  .filter(pwd => 
    /[A-Z]/.test(pwd) && 
    /[a-z]/.test(pwd) && 
    /[0-9]/.test(pwd)
  );

const invalidPasswordArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 7 }), // Too short
  fc.string({ minLength: 8 }).filter(pwd => !/[A-Z]/.test(pwd)), // No uppercase
  fc.string({ minLength: 8 }).filter(pwd => !/[a-z]/.test(pwd)), // No lowercase
  fc.string({ minLength: 8 }).filter(pwd => !/[0-9]/.test(pwd))  // No number
);

const signUpCredentialsArbitrary = fc.record({
  email: fc.emailAddress(),
  password: validPasswordArbitrary,
  confirmPassword: validPasswordArbitrary
});
```

**Mock Factories:**
```typescript
// Factory functions for unit tests

export const createMockUser = (overrides?: Partial<User>) => ({
  id: 'user-123',
  email: 'test@example.com',
  created_at: new Date().toISOString(),
  ...overrides
});

export const createMockSession = (overrides?: Partial<Session>) => ({
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600000,
  user: createMockUser(),
  ...overrides
});
```

## Implementation Details

### Auth Service Functions

**Sign Up with Email:**
```typescript
// services/auth.service.ts

export async function signUpWithEmail(
  supabase: SupabaseClientType,
  credentials: { email: string; password: string }
): Promise<ServiceResult<{ user: User; session: Session }>> {
  try {
    // Validate password strength
    if (credentials.password.length < 8) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters',
        },
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return {
        success: false,
        error: {
          type: error.message.includes('already registered') ? 'USER_EXISTS' : 'AUTH_ERROR',
          message: error.message,
        },
      };
    }

    if (!data.user || !data.session) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'Sign up failed',
        },
      };
    }

    return {
      success: true,
      data: {
        user: data.user,
        session: data.session,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error occurred',
      },
    };
  }
}
```

**Sign In with Email:**
```typescript
export async function signInWithEmail(
  supabase: SupabaseClientType,
  credentials: { email: string; password: string }
): Promise<ServiceResult<{ user: User; session: Session }>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'Invalid email or password',
        },
      };
    }

    if (!data.user || !data.session) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'Sign in failed',
        },
      };
    }

    return {
      success: true,
      data: {
        user: data.user,
        session: data.session,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error occurred',
      },
    };
  }
}
```

### Form Components

**SignInForm Component:**
```typescript
// components/auth/SignInForm.tsx
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
import { Label } from '@/components/ui/label';
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

  const form = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: SignInFormData) => {
    setIsLoading(true);
    
    const result = await signInWithEmail(supabase, data);
    
    if (!result.success) {
      form.setError('root', {
        message: result.error.message,
      });
      setIsLoading(false);
      return;
    }

    router.push('/');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-red-600">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
    </Form>
  );
}
```

### Migration Strategy

**Steps to Replace Google OAuth:**

1. **Initialize Shadcn UI** (if not already done): `npx shadcn@latest init`
2. **Add required Shadcn components**: `npx shadcn@latest add button input label form`
3. **Add new auth service functions** (signUpWithEmail, signInWithEmail)
4. **Create validation schemas** (lib/validation.ts)
5. **Create new pages** (/(auth)/signup)
6. **Create new components** (SignInForm, SignUpForm using Shadcn components)
7. **Update login page** to use SignInForm instead of Google button
8. **Update AuthGuard** (no changes needed - works with any auth method)
9. **Test thoroughly** with property-based and unit tests
10. **Remove Google OAuth code** (signInWithGoogle function, Google button)
11. **Update environment variables** (remove Google OAuth credentials if any)

**Backward Compatibility:**
- Keep existing `getSession()` and `signOut()` functions unchanged
- Keep existing session management logic
- Keep existing AuthGuard component
- Keep existing profile table and triggers

## Security Considerations

### Password Security
- Minimum 8 characters required
- Must contain uppercase, lowercase, and numbers
- Passwords never stored in plain text (handled by Supabase)
- Passwords cleared from memory after submission

### Session Security
- Sessions stored in HTTP-only cookies (Supabase SSR)
- Automatic token refresh handled by Supabase
- Session expiration enforced
- CSRF protection via Supabase Auth

### Input Validation
- Email format validation on client and server
- Password strength validation on client and server
- SQL injection prevention (Supabase handles this)
- XSS prevention (React escapes by default)

### Rate Limiting
- Consider implementing rate limiting on sign-up/sign-in
- Supabase provides built-in rate limiting
- Monitor for brute force attempts

## Performance Considerations

### Form Performance
- Debounce validation (300ms)
- Lazy load validation schemas
- Minimize re-renders with React Hook Form
- Use controlled inputs only where necessary

### Bundle Size
- Tree-shake unused Zod validators
- Use dynamic imports for heavy components
- Minimize dependencies

### Network Performance
- Single request for sign-up/sign-in
- Automatic session refresh (no extra requests)
- Optimistic UI updates where possible
