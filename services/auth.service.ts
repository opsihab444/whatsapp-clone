import { SupabaseClient } from '@supabase/supabase-js';
import { ServiceResult, ServiceError } from '@/types';
import { Database } from '@/types/database.types';

type SupabaseClientType = SupabaseClient<Database>;

/**
 * Sign up with email and password
 * @param supabase - Supabase client instance
 * @param credentials - Email, password, name, and optional avatar
 * @returns ServiceResult with user and session or error
 */
export async function signUpWithEmail(
  supabase: SupabaseClientType,
  credentials: { email: string; password: string; name: string; avatarUrl?: string }
): Promise<ServiceResult<{ user: any; session: any }>> {
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
      options: {
        data: {
          full_name: credentials.name,
          avatar_url: credentials.avatarUrl || null,
        },
      },
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

    if (!data.user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'Sign up failed',
        },
      };
    }

    // Session may be null if email confirmation is required
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

/**
 * Sign in with email and password
 * @param supabase - Supabase client instance
 * @param credentials - Email and password credentials
 * @returns ServiceResult with user and session or error
 */
export async function signInWithEmail(
  supabase: SupabaseClientType,
  credentials: { email: string; password: string }
): Promise<ServiceResult<{ user: any; session: any }>> {
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

/**
 * Sign out the current user
 * @param supabase - Supabase client instance
 * @returns ServiceResult with void or error
 */
export async function signOut(
  supabase: SupabaseClientType
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: error.message,
        },
      };
    }

    return {
      success: true,
      data: undefined,
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

/**
 * Get the current session
 * @param supabase - Supabase client instance
 * @returns ServiceResult with session or error
 */
export async function getSession(
  supabase: SupabaseClientType
): Promise<ServiceResult<{ user: any; session: any } | null>> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: error.message,
        },
      };
    }

    if (!data.session) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: {
        user: data.session.user,
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
