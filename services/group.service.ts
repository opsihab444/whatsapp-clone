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
  avatarUrl?: string,
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
        avatar_url: avatarUrl || null,
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

    // Get sender names for groups that don't have last_message_sender_name
    const senderIds = groups
      .filter((g) => g.last_message_sender_id && !g.last_message_sender_name)
      .map((g) => g.last_message_sender_id);

    let senderNameMap = new Map<string, string>();
    if (senderIds.length > 0) {
      const { data: senderProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', senderIds);

      senderProfiles?.forEach((p) => {
        const name = p.full_name || p.email?.split('@')[0] || null;
        if (name) senderNameMap.set(p.id, name);
      });
    }

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
        last_message_content: group.last_message_content,
        last_message_time: group.last_message_time,
        last_message_sender_id: group.last_message_sender_id,
        last_message_sender_name: group.last_message_sender_name || senderNameMap.get(group.last_message_sender_id) || null,
      },
      last_message_content: group.last_message_content,
      last_message_time: group.last_message_time,
      last_message_sender_id: group.last_message_sender_id,
      last_message_sender_name: group.last_message_sender_name || senderNameMap.get(group.last_message_sender_id) || null,
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

    // Get added user's profile for system message
    const { data: addedUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Get current user's profile for system message
    const { data: currentUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId, role: 'member' });

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    // Send system message about member addition
    const addedUserName = addedUserProfile?.full_name || addedUserProfile?.email?.split('@')[0] || 'Someone';
    const currentUserName = currentUserProfile?.full_name || currentUserProfile?.email?.split('@')[0] || 'Admin';

    await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: `${currentUserName} added ${addedUserName}`,
        type: 'system',
      });

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

    // Get removed user's profile for system message
    const { data: removedUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Get current user's profile for system message
    const { data: currentUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

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

    // Send system message about member removal
    const removedUserName = removedUserProfile?.full_name || removedUserProfile?.email?.split('@')[0] || 'Someone';
    const currentUserName = currentUserProfile?.full_name || currentUserProfile?.email?.split('@')[0] || 'Admin';

    // Different message for self-leave vs kick
    const isLeaving = userId === user.id;
    const systemMessage = isLeaving
      ? `${currentUserName} left the group`
      : `${currentUserName} removed ${removedUserName}`;

    await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: systemMessage,
        type: 'system',
      });

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
 * Update a member's role (e.g. make admin)
 */
export async function updateGroupMemberRole(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
  newRole: 'admin' | 'member'
): Promise<ServiceResult<void>> {
  console.log('[GroupService] updateGroupMemberRole called', { groupId, userId, newRole });
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      console.error('[GroupService] User not authenticated');
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Check if current user is admin
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (membershipError) {
      console.error('[GroupService] Error fetching membership', membershipError);
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: membershipError.message },
      };
    }

    if (!membership || membership.role !== 'admin') {
      console.error('[GroupService] Permission denied: Current user is not admin', { membership });
      return {
        success: false,
        error: { type: 'PERMISSION_DENIED', message: 'Only admins can change member roles' },
      };
    }

    // Update role
    console.log('[GroupService] Attempting to update role...');
    const { data: updatedData, error: updateError } = await supabase
      .from('group_members')
      .update({ role: newRole })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select(); // Select to verify update

    if (updateError) {
      console.error('[GroupService] Update failed', updateError);
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: updateError.message },
      };
    }

    if (!updatedData || updatedData.length === 0) {
      console.error('[GroupService] Update returned no data. Possible RLS issue or user not found in group.');
      return {
        success: false,
        error: { type: 'UNKNOWN_ERROR', message: 'Failed to update role. User might not be in the group.' },
      };
    }

    console.log('[GroupService] Role updated successfully', updatedData);

    // Get target user's profile for system message
    const { data: targetUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Get current user's profile for system message
    const { data: currentUserProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const targetUserName = targetUserProfile?.full_name || targetUserProfile?.email?.split('@')[0] || 'Someone';
    const currentUserName = currentUserProfile?.full_name || currentUserProfile?.email?.split('@')[0] || 'Admin';

    const action = newRole === 'admin' ? 'promoted to admin' : 'dismissed as admin';

    // Send system message
    await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: `${currentUserName} ${action} ${targetUserName}`,
        type: 'system',
      });

    return { success: true, data: undefined };
  } catch (error) {
    console.error('[GroupService] Unexpected error', error);
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
 * Get messages for a group with pagination support
 */
export async function getGroupMessages(
  supabase: SupabaseClient,
  groupId: string,
  offset: number = 0,
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
      .range(offset, offset + limit - 1);

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    // Return in newest-first order (same as one-to-one messages)
    const result = (messages || []).map((m) => ({
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
  content: string | null,
  type: 'text' | 'image' = 'text',
  mediaUrl?: string,
  tempId?: string,
  senderProfile?: { full_name?: string | null; avatar_url?: string | null },
  mediaWidth?: number | null,
  mediaHeight?: number | null
): Promise<ServiceResult<{ id: string }>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Insert to database FIRST - this is the source of truth
    const { data: message, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: content?.trim() || null,
        type,
        media_url: mediaUrl,
        media_width: mediaWidth || null,
        media_height: mediaHeight || null,
      })
      .select('id')
      .single();

    if (error) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    // NOTE: WebSocket broadcast removed - using only Postgres Realtime for message delivery

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
  updates: { name?: string; description?: string; avatar_url?: string }
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

/**
 * Mark all messages in a group as read (reset unread count)
 */
export async function markGroupAsRead(
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

    // Reset unread count to 0
    const { error } = await supabase
      .from('group_unread_counts')
      .upsert({
        user_id: user.id,
        group_id: groupId,
        count: 0
      }, {
        onConflict: 'user_id,group_id'
      });

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
 * Edit a group message
 */
export async function editGroupMessage(
  supabase: SupabaseClient,
  messageId: string,
  newContent: string
): Promise<ServiceResult<GroupMessage>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Validate content
    if (!newContent || !newContent.trim()) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Message content cannot be empty' },
      };
    }

    // Update message
    const { data: message, error: updateError } = await supabase
      .from('group_messages')
      .update({
        content: newContent.trim(),
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', user.id) // Ensure user owns the message
      .select()
      .single();

    if (updateError || !message) {
      return {
        success: false,
        error: {
          type: updateError?.code === 'PGRST116' ? 'PERMISSION_DENIED' : 'NETWORK_ERROR',
          message: updateError?.message || 'Failed to edit message',
        },
      };
    }

    return { success: true, data: message as GroupMessage };
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
 * Delete a group message (soft delete)
 */
export async function deleteGroupMessage(
  supabase: SupabaseClient,
  messageId: string
): Promise<ServiceResult<GroupMessage>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    // Soft delete message
    const { data: message, error: updateError } = await supabase
      .from('group_messages')
      .update({
        content: 'This message was deleted',
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', user.id) // Ensure user owns the message
      .select()
      .single();

    if (updateError || !message) {
      return {
        success: false,
        error: {
          type: updateError?.code === 'PGRST116' ? 'PERMISSION_DENIED' : 'NETWORK_ERROR',
          message: updateError?.message || 'Failed to delete message',
        },
      };
    }

    return { success: true, data: message as GroupMessage };
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
 * Update user's last read message in a group
 */
export async function updateGroupReadReceipt(
  supabase: SupabaseClient,
  groupId: string,
  messageId: string
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
      .from('group_message_reads')
      .upsert({
        user_id: user.id,
        group_id: groupId,
        last_read_message_id: messageId,
        last_read_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,group_id'
      });

    if (error) {
      console.error('[GroupService] Error updating read receipt:', error);
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
 * Get read receipts for a group (who has read up to which message)
 */
export interface GroupReadReceipt {
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: string;
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };
}

export async function getGroupReadReceipts(
  supabase: SupabaseClient,
  groupId: string
): Promise<ServiceResult<GroupReadReceipt[]>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: { type: 'AUTH_ERROR', message: 'User not authenticated' },
      };
    }

    const { data, error } = await supabase
      .from('group_message_reads')
      .select(`
        user_id,
        last_read_message_id,
        last_read_at,
        profile:profiles!user_id (
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq('group_id', groupId)
      .neq('user_id', user.id); // Exclude current user

    if (error) {
      console.error('[GroupService] Error fetching read receipts:', error);
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: error.message },
      };
    }

    return { success: true, data: data as GroupReadReceipt[] };
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
