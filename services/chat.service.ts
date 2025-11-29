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

        // Get deleted conversations for this user
        const { data: deletedConvs } = await supabase
            .from('deleted_conversations')
            .select('conversation_id, deleted_at')
            .eq('user_id', user.id);

        const deletedMap = new Map(
            deletedConvs?.map((d) => [d.conversation_id, new Date(d.deleted_at)]) || []
        );

        // Filter out deleted conversations (or those with no new messages since deletion)
        const activeConversations = conversations.filter((conv) => {
            const deletedAt = deletedMap.get(conv.id);
            if (!deletedAt) return true; // Not deleted
            // Show if there's a new message after deletion
            if (conv.last_message_time && new Date(conv.last_message_time) > deletedAt) {
                return true;
            }
            return false;
        });

        if (activeConversations.length === 0) {
            return { success: true, data: [] };
        }

        // Get other user IDs
        const otherUserIds = activeConversations.map((conv) =>
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
                .in('conversation_id', activeConversations.map((c) => c.id))
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
        const result: Conversation[] = activeConversations.map((conv) => {
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
 * Add conversation to favorites (database)
 */
export async function addToFavorites(
    supabase: SupabaseClient,
    conversationId: string
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
            .from('favorite_conversations')
            .insert({
                user_id: user.id,
                conversation_id: conversationId,
            });

        if (error) {
            if (error.code === '23505') {
                return { success: true, data: undefined }; // Already favorite
            }
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
 * Remove conversation from favorites (database)
 */
export async function removeFromFavorites(
    supabase: SupabaseClient,
    conversationId: string
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
            .from('favorite_conversations')
            .delete()
            .eq('user_id', user.id)
            .eq('conversation_id', conversationId);

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
 * Get all favorite conversation IDs (database)
 */
export async function getFavoriteConversations(
    supabase: SupabaseClient
): Promise<ServiceResult<string[]>> {
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

        const { data, error } = await supabase
            .from('favorite_conversations')
            .select('conversation_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                },
            };
        }

        return { success: true, data: data?.map(f => f.conversation_id) || [] };
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
 * Pin a conversation (database)
 */
export async function pinConversation(
    supabase: SupabaseClient,
    conversationId: string
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

        // Check current pinned count (max 3)
        const { count } = await supabase
            .from('pinned_conversations')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (count && count >= 3) {
            return {
                success: false,
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Maximum 3 chats can be pinned',
                },
            };
        }

        const { error } = await supabase
            .from('pinned_conversations')
            .insert({
                user_id: user.id,
                conversation_id: conversationId,
            });

        if (error) {
            if (error.code === '23505') {
                return { success: true, data: undefined }; // Already pinned
            }
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
 * Unpin a conversation (database)
 */
export async function unpinConversation(
    supabase: SupabaseClient,
    conversationId: string
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
            .from('pinned_conversations')
            .delete()
            .eq('user_id', user.id)
            .eq('conversation_id', conversationId);

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
 * Get all pinned conversation IDs (database)
 */
export async function getPinnedConversations(
    supabase: SupabaseClient
): Promise<ServiceResult<string[]>> {
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

        const { data, error } = await supabase
            .from('pinned_conversations')
            .select('conversation_id')
            .eq('user_id', user.id)
            .order('pinned_at', { ascending: true });

        if (error) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                },
            };
        }

        return { success: true, data: data?.map(p => p.conversation_id) || [] };
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
 * Delete a conversation for the current user only
 * The other user will still see the conversation and messages
 * If the other user messages again, it will appear as a new conversation for this user
 */
export async function deleteConversation(
    supabase: SupabaseClient,
    conversationId: string
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

        // Verify user is a participant in this conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, participant_1_id, participant_2_id')
            .eq('id', conversationId)
            .single();

        if (convError || !conversation) {
            return {
                success: false,
                error: {
                    type: 'NOT_FOUND',
                    message: 'Conversation not found',
                },
            };
        }

        const isParticipant = 
            conversation.participant_1_id === user.id || 
            conversation.participant_2_id === user.id;

        if (!isParticipant) {
            return {
                success: false,
                error: {
                    type: 'PERMISSION_DENIED',
                    message: 'You are not authorized to delete this conversation',
                },
            };
        }

        // Mark conversation as deleted for this user only
        // Insert into deleted_conversations table
        const { error: deleteError } = await supabase
            .from('deleted_conversations')
            .upsert({
                user_id: user.id,
                conversation_id: conversationId,
                deleted_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,conversation_id',
            });

        if (deleteError) {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: deleteError.message,
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
 * Block a user
 */
export async function blockUser(
    supabase: SupabaseClient,
    blockedUserId: string
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

        if (user.id === blockedUserId) {
            return {
                success: false,
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'You cannot block yourself',
                },
            };
        }

        const { error } = await supabase
            .from('blocked_users')
            .insert({
                blocker_id: user.id,
                blocked_id: blockedUserId,
            });

        if (error) {
            // Check if already blocked
            if (error.code === '23505') {
                return { success: true, data: undefined }; // Already blocked
            }
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
 * Unblock a user
 */
export async function unblockUser(
    supabase: SupabaseClient,
    blockedUserId: string
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
            .from('blocked_users')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', blockedUserId);

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
 * Check if a user is blocked by current user
 */
export async function isUserBlocked(
    supabase: SupabaseClient,
    userId: string
): Promise<ServiceResult<boolean>> {
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

        const { data, error } = await supabase
            .from('blocked_users')
            .select('blocker_id')
            .eq('blocker_id', user.id)
            .eq('blocked_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                },
            };
        }

        return { success: true, data: !!data };
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
 * Check if current user is blocked by another user
 */
export async function amIBlocked(
    supabase: SupabaseClient,
    userId: string
): Promise<ServiceResult<boolean>> {
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

        const { data, error } = await supabase
            .from('blocked_users')
            .select('blocker_id')
            .eq('blocker_id', userId)
            .eq('blocked_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            return {
                success: false,
                error: {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                },
            };
        }

        return { success: true, data: !!data };
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
 * Get block status between two users (both directions)
 */
export async function getBlockStatus(
    supabase: SupabaseClient,
    otherUserId: string
): Promise<ServiceResult<{ iBlocked: boolean; theyBlockedMe: boolean }>> {
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

        // Check both directions in parallel
        const [iBlockedResult, theyBlockedResult] = await Promise.all([
            supabase
                .from('blocked_users')
                .select('blocker_id')
                .eq('blocker_id', user.id)
                .eq('blocked_id', otherUserId)
                .single(),
            supabase
                .from('blocked_users')
                .select('blocker_id')
                .eq('blocker_id', otherUserId)
                .eq('blocked_id', user.id)
                .single(),
        ]);

        return {
            success: true,
            data: {
                iBlocked: !!iBlockedResult.data,
                theyBlockedMe: !!theyBlockedResult.data,
            },
        };
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
