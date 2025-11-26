'use client';

import { SupabaseClient, User } from '@supabase/supabase-js';

// Module-level cache for user data
let cachedUser: User | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

/**
 * Get current user with caching to prevent excessive /user API calls
 * Uses cached value if available and not expired, otherwise fetches fresh
 */
export async function getCachedUser(supabase: SupabaseClient): Promise<User | null> {
    const now = Date.now();

    // Return cached user if still valid
    if (cachedUser && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedUser;
    }

    // Fetch fresh user data using getSession (reads from local storage first)
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        cachedUser = session.user;
        cacheTimestamp = now;
        return cachedUser;
    }

    return null;
}

/**
 * Clear the cached user (call on sign out)
 */
export function clearCachedUser(): void {
    cachedUser = null;
    cacheTimestamp = 0;
}

/**
 * Update cached user (call after profile updates)
 */
export function updateCachedUser(user: User): void {
    cachedUser = user;
    cacheTimestamp = Date.now();
}
