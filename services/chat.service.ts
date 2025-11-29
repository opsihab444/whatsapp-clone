import { SupabaseClient } from '@supabase/supabase-js';
import { Conversation, ServiceResult } from '@/types';
import { getCachedUser } from '@/lib/supabase/cached-auth';

/**
 * Get all conversations for the current user
 * Includes participant information and unread counts
 */
export async function getConversations(
    supabase: SupabaseClient
): Promise<ServiceResult<Conversation[]>> {
    try {
        // Get current user (cached)
        const user = await getCachedUser(supabase);

        if (!user) {
            return {
                success: false,
                error: {
                    type: 'AUTH_ERROR',
                    message: 'User not authenticated',
                },
            };
        }

        // Query conversations where user is a participant
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select(`
        id,
        participant_1_id,
        participant_2_id,
        last_message_content,
        last_message_time,
        last_message_sender_id,
        created_at
      `)
            .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
            .order('created_at', { ascending: false });

        if (convError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: convError.message,
                },
            };
        }

        if (!conversations || conversations.length === 0) {
            return { success: true, data: [] };
        }

        // Get other user IDs
        const otherUserIds = conversations.map((conv) =>
            conv.participant_1_id === user.id ? conv.participant_2_id : conv.participant_1_id
        );

        // Fetch profiles and unread counts in PARALLEL for faster loading
        const [profilesResult, unreadResult] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, email, full_name, avatar_url, created_at')
                .in('id', otherUserIds),
            supabase
                .from('unread_counts')
                .select('conversation_id, count')
                .eq('user_id', user.id)
                .in('conversation_id', conversations.map((c) => c.id))
        ]);

        const { data: profiles, error: profileError } = profilesResult;
        const { data: unreadCounts, error: unreadError } = unreadResult;

        if (profileError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: profileError.message,
                },
            };
        }

        if (unreadError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: unreadError.message,
                },
            };
        }

        // Create a map for quick lookup
        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);
        const unreadMap = new Map(unreadCounts?.map((u) => [u.conversation_id, u.count]) || []);

        // Combine data
        const result: Conversation[] = conversations.map((conv) => {
            const otherUserId = conv.participant_1_id === user.id ? conv.participant_2_id : conv.participant_1_id;
            const otherUser = profileMap.get(otherUserId);

            return {
                id: conv.id,
                participant_1_id: conv.participant_1_id,
                participant_2_id: conv.participant_2_id,
                last_message_content: conv.last_message_content,
                last_message_time: conv.last_message_time,
                last_message_sender_id: conv.last_message_sender_id,
                created_at: conv.created_at,
                other_user: otherUser || {
                    id: otherUserId,
                    email: 'Unknown',
                    full_name: 'Unknown User',
                    avatar_url: null,
                    created_at: new Date().toISOString(),
                },
                unread_count: unreadMap.get(conv.id) || 0,
            };
        });

        return { success: true, data: result };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'UNKNOWN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        };
    }
}

/**
 * Update unread count for a conversation
 */
export async function updateUnreadCount(
    supabase: SupabaseClient,
    conversationId: string,
    count: number
): Promise<ServiceResult<void>> {
    try {
        const user = await getCachedUser(supabase);

        if (!user) {
            return {
                success: false,
                error: {
                    type: 'AUTH_ERROR',
                    message: 'User not authenticated',
                },
            };
        }

        const { error } = await supabase
            .from('unread_counts')
            .upsert({
                user_id: user.id,
                conversation_id: conversationId,
                count: count,
            }, {
                onConflict: 'user_id,conversation_id',
            });

        if (error) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                },
            };
        }

        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'UNKNOWN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        };
    }
}

/**
 * Search/filter conversations by contact name or last message content
 */
export function filterConversations(
    conversations: Conversation[],
    query: string
): Conversation[] {
    if (!query.trim()) {
        return conversations;
    }

    const lowerQuery = query.toLowerCase();

    return conversations.filter((conv) => {
        const nameMatch = conv.other_user.full_name?.toLowerCase().includes(lowerQuery) ||
            conv.other_user.email.toLowerCase().includes(lowerQuery);
        const messageMatch = conv.last_message_content?.toLowerCase().includes(lowerQuery);

        return nameMatch || messageMatch;
    });
}

/**
 * Search for users by email
 */
export async function searchUserByEmail(
    supabase: SupabaseClient,
    email: string
): Promise<ServiceResult<{ id: string; email: string; full_name: string | null; avatar_url: string | null } | null>> {
    try {
        const user = await getCachedUser(supabase);

        if (!user) {
            return {
                success: false,
                error: {
                    type: 'AUTH_ERROR',
                    message: 'User not authenticated',
                },
            };
        }

        // Search for user by email (excluding current user)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, full_name, avatar_url')
            .eq('email', email.toLowerCase().trim())
            .neq('id', user.id)
            .single();

        if (profileError) {
            if (profileError.code === 'PGRST116') {
                // No user found
                return { success: true, data: null };
            }
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: profileError.message,
                },
            };
        }

        return { success: true, data: profile };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'UNKNOWN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        };
    }
}

/**
 * Search for users by name or email (realtime search)
 */
export async function searchUsers(
    supabase: SupabaseClient,
    query: string
): Promise<ServiceResult<{ id: string; email: string; full_name: string | null; avatar_url: string | null }[]>> {
    try {
        const user = await getCachedUser(supabase);

        if (!user) {
            return {
                success: false,
                error: {
                    type: 'AUTH_ERROR',
                    message: 'User not authenticated',
                },
            };
        }

        const searchTerm = query.toLowerCase().trim();

        if (searchTerm.length < 2) {
            return { success: true, data: [] };
        }

        // Search for users by name or email (excluding current user)
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, full_name, avatar_url')
            .neq('id', user.id)
            .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
            .limit(10);

        if (profileError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: profileError.message,
                },
            };
        }

        return { success: true, data: profiles || [] };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'UNKNOWN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        };
    }
}

/**
 * Create or get existing conversation with a user
 */
export async function getOrCreateConversation(
    supabase: SupabaseClient,
    otherUserId: string
): Promise<ServiceResult<string>> {
    try {
        const user = await getCachedUser(supabase);

        if (!user) {
            return {
                success: false,
                error: {
                    type: 'AUTH_ERROR',
                    message: 'User not authenticated',
                },
            };
        }

        // Ensure participant IDs are ordered (smaller UUID first)
        const [participant1, participant2] = user.id < otherUserId
            ? [user.id, otherUserId]
            : [otherUserId, user.id];

        // Check if conversation already exists
        const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('participant_1_id', participant1)
            .eq('participant_2_id', participant2)
            .single();

        if (existingConv) {
            return { success: true, data: existingConv.id };
        }

        // Create new conversation with ordered participants
        const { data: newConv, error: createError } = await supabase
            .from('conversations')
            .insert({
                participant_1_id: participant1,
                participant_2_id: participant2,
            })
            .select('id')
            .single();

        if (createError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: createError.message,
                },
            };
        }

        return { success: true, data: newConv.id };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'UNKNOWN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        };
    }
}

/**
 * Toggle favorite status for a conversation or group
 * Uses localStorage for persistence since backend support is pending
 */
export function toggleFavorite(id: string): boolean {
    try {
        const favorites = getFavorites();
        const isFavorite = favorites.includes(id);

        let newFavorites: string[];
        if (isFavorite) {
            newFavorites = favorites.filter(favId => favId !== id);
        } else {
            newFavorites = [...favorites, id];
        }

        localStorage.setItem('whatsapp_favorites', JSON.stringify(newFavorites));

        // Dispatch a custom event so components can react immediately
        window.dispatchEvent(new Event('favorites-updated'));

        return !isFavorite;
    } catch (error) {
        console.error('Error toggling favorite:', error);
        return false;
    }
}

/**
 * Get all favorite IDs from localStorage
 */
export function getFavorites(): string[] {
    try {
        if (typeof window === 'undefined') return [];

        const stored = localStorage.getItem('whatsapp_favorites');
        if (!stored) return [];

        return JSON.parse(stored);
    } catch (error) {
        console.error('Error getting favorites:', error);
        return [];
    }
}

/**
 * Check if a specific ID is a favorite
 */
export function isFavorite(id: string): boolean {
    const favorites = getFavorites();
    return favorites.includes(id);
}