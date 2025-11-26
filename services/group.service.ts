import { SupabaseClient } from '@supabase/supabase-js';
import { Group, GroupMember, GroupConversation, GroupMessage, ServiceResult, Profile } from '@/types';
import { getCachedUser } from '@/lib/supabase/cached-auth';

/**
 * Create a new group
 */
export async function createGroup(
  supabase: SupabaseClient,
  name: string,
  memberIds: string[],
  description?: string
): Promise<ServiceResult<Group>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (groupError) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: groupError.message },
      };
    }

    // Add creator as admin
    const members = [
      { group_id: group.id, user_id: user.id, role: 'admin' },
      ...memberIds.map((id) => ({ group_id: group.id, user_id: id, role: 'member' })),
    ];

    const { error: memberError } = await supabase
      .from('group_members')
      .insert(members);

    if (memberError) {
      // Rollback group creation
      await supabase.from('groups').delete().eq('id', group.id);
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: memberError.message },
      };
    }

    return { success: true, data: { ...group, member_count: members.length } };
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
 * Get all groups for the current user
 */
export async function getGroups(
  supabase: SupabaseClient
): Promise<ServiceResult<GroupConversation[]>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Get groups where user is a member
    const { data: memberGroups, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (memberError) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: memberError.message },
      };
    }

    if (!memberGroups || memberGroups.length === 0) {
      return { success: true, data: [] };
    }

    const groupIds = memberGroups.map((m) => m.group_id);

    // Get group details
    const { data: groups, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('updated_at', { ascending: false });

    if (groupError) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: groupError.message },
      };
    }

    // Get unread counts
    const { data: unreadCounts } = await supabase
      .from('group_unread_counts')
      .select('group_id, count')
      .eq('user_id', user.id)
      .in('group_id', groupIds);

    const unreadMap = new Map(unreadCounts?.map((u) => [u.group_id, u.count]) || []);

    const result: GroupConversation[] = groups.map((group) => ({
      id: group.id,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        avatar_url: group.avatar_url,
        created_by: group.created_by,
        created_at: group.created_at,
        updated_at: group.updated_at,
      },
      last_message_content: group.last_message_content,
      last_message_time: group.last_message_time,
      last_message_sender_id: group.last_message_sender_id,
      last_message_sender_name: group.last_message_sender_name,
      unread_count: unreadMap.get(group.id) || 0,
    }));

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
 * Get group members
 */
export async function getGroupMembers(
  supabase: SupabaseClient,
  groupId: string
): Promise<ServiceResult<GroupMember[]>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    const { data: members, error } = await supabase
      .from('group_members')
      .select(`
        group_id,
        user_id,
        role,
        joined_at,
        profiles:user_id (id, email, full_name, avatar_url, created_at)
      `)
      .eq('group_id', groupId);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    const result: GroupMember[] = members.map((m) => ({
      group_id: m.group_id,
      user_id: m.user_id,
      role: m.role as 'admin' | 'member',
      joined_at: m.joined_at,
      profile: m.profiles as unknown as Profile,
    }));

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
 * Add member to group
 */
export async function addGroupMember(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Check if current user is admin
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'admin') {
      return {
        success: false,
        error: { type: 'PERMISSION_DENIED', message: 'Only admins can add members' },
      };
    }

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId, role: 'member' });

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
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
 * Remove member from group
 */
export async function removeGroupMember(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Check if current user is admin or removing themselves
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return {
        success: false,
        error: { type: 'PERMISSION_DENIED', message: 'You are not a member of this group' },
      };
    }

    if (membership.role !== 'admin' && userId !== user.id) {
      return {
        success: false,
        error: { type: 'PERMISSION_DENIED', message: 'Only admins can remove other members' },
      };
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
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
 * Search users by email for adding to group
 */
export async function searchUsersForGroup(
  supabase: SupabaseClient,
  query: string,
  excludeGroupId?: string
): Promise<ServiceResult<Profile[]>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    let queryBuilder = supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, created_at')
      .neq('id', user.id)
      .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(10);

    const { data: profiles, error } = await queryBuilder;

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    // If excludeGroupId provided, filter out existing members
    if (excludeGroupId && profiles) {
      const { data: existingMembers } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', excludeGroupId);

      const existingIds = new Set(existingMembers?.map((m) => m.user_id) || []);
      return { success: true, data: profiles.filter((p) => !existingIds.has(p.id)) };
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
 * Get messages for a group
 */
export async function getGroupMessages(
  supabase: SupabaseClient,
  groupId: string,
  limit: number = 50
): Promise<ServiceResult<GroupMessage[]>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    const { data: messages, error } = await supabase
      .from('group_messages')
      .select(`
        id,
        group_id,
        sender_id,
        content,
        type,
        media_url,
        media_width,
        media_height,
        status,
        is_edited,
        is_deleted,
        created_at,
        updated_at,
        sender:profiles!sender_id (id, email, full_name, avatar_url, created_at)
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    // Transform and reverse to get chronological order
    const result = (messages || []).reverse().map((m) => ({
      id: m.id,
      group_id: m.group_id,
      sender_id: m.sender_id,
      content: m.content,
      type: m.type as 'text' | 'image',
      media_url: m.media_url,
      media_width: m.media_width,
      media_height: m.media_height,
      status: m.status as 'sent' | 'delivered' | 'read',
      is_edited: m.is_edited,
      is_deleted: m.is_deleted,
      created_at: m.created_at,
      updated_at: m.updated_at,
      sender: m.sender as unknown as Profile,
    }));

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
 * Send a message to a group
 */
export async function sendGroupMessage(
  supabase: SupabaseClient,
  groupId: string,
  content: string,
  type: 'text' | 'image' = 'text',
  mediaUrl?: string
): Promise<ServiceResult<{ id: string }>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    const { data: message, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: content.trim(),
        type,
        media_url: mediaUrl,
      })
      .select('id')
      .single();

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    return { success: true, data: { id: message.id } };
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
 * Update group info (name, description)
 */
export async function updateGroup(
  supabase: SupabaseClient,
  groupId: string,
  updates: { name?: string; description?: string }
): Promise<ServiceResult<void>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Check if user is admin
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'admin') {
      return {
        success: false,
        error: { type: 'PERMISSION_DENIED', message: 'Only admins can update group info' },
      };
    }

    const { error } = await supabase
      .from('groups')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
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
 * Leave a group
 */
export async function leaveGroup(
  supabase: SupabaseClient,
  groupId: string
): Promise<ServiceResult<void>> {
  try {
    const user = await getCachedUser(supabase);
    
    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
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
