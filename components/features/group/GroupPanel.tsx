'use client';

import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { getGroupMembers } from '@/services/group.service';
import { GroupInfoPanel } from '@/components/features/group/GroupInfoPanel';
import { GroupMessageList } from '@/components/features/group/GroupMessageList';
import { GroupInputArea } from '@/components/features/group/GroupInputArea';
import { EditGroupMessageModal } from '@/components/features/group/EditGroupMessageModal';
import { DeleteGroupMessageModal } from '@/components/features/group/DeleteGroupMessageModal';
import { GroupConversation } from '@/types';

interface GroupPanelProps {
  groupId: string;
}

export function GroupPanel({ groupId }: GroupPanelProps) {
  const { data: currentUser } = useCurrentUser();
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // Fetch group info
  const { data: groups } = useQuery<GroupConversation[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('*, group:groups(*)')
        .eq('user_id', currentUser?.id)
        .order('last_read_at', { ascending: false });

      if (error) throw error;
      return data as unknown as GroupConversation[];
    },
    enabled: !!currentUser?.id,
  });

  const group = useMemo(() => {
    if (!groups) return null;
    return groups.find((g) => g.id === groupId);
  }, [groups, groupId]);

  // Fetch members
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const result = await getGroupMembers(supabase, groupId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  const memberCount = members?.length || 0;
  const memberNames = members
    .slice(0, 3)
    .map((m) => m.profile?.full_name?.split(' ')[0] || m.profile?.email?.split('@')[0])
    .join(', ');

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between bg-background px-4 py-2 border-b border-border z-10 shadow-sm min-h-[64px]">
        <button
          onClick={() => setShowInfoPanel(true)}
          className="flex items-center gap-3 overflow-hidden hover:bg-muted/50 -ml-2 px-2 py-1.5 rounded-lg transition-colors flex-1"
        >
          {!group ? (
            <>
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </>
          ) : (
            <>
              <Avatar className="h-10 w-10 flex-shrink-0">
                {group.group.avatar_url && <AvatarImage src={group.group.avatar_url} />}
                <AvatarFallback className="bg-primary/20 text-primary">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden text-left">
                <h1 className="font-medium text-[15px] text-foreground truncate leading-tight">{group.group.name}</h1>
                <p className="text-[12px] text-muted-foreground truncate">
                  {memberNames}
                  {memberCount > 3 ? ` and ${memberCount - 3} more` : ''}
                </p>
              </div>
            </>
          )}
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-hidden">
        <GroupMessageList key={groupId} groupId={groupId} currentUserId={currentUser?.id} members={members} />
      </main>

      {/* Input Area - Separate memoized component */}
      <GroupInputArea
        groupId={groupId}
        currentUserId={currentUser?.id}
        currentUserName={currentUser?.name}
        currentUserEmail={currentUser?.email}
        currentUserAvatar={currentUser?.avatar}
      />

      {/* Group Info Panel */}
      <GroupInfoPanel
        isOpen={showInfoPanel}
        onClose={() => setShowInfoPanel(false)}
        groupId={groupId}
        groupName={group?.group.name || ''}
        groupAvatar={group?.group.avatar_url}
        groupDescription={group?.group.description}
        members={members}
        currentUserId={currentUser?.id}
        createdBy={group?.group.created_by || ''}
      />

      {/* Modals */}
      <EditGroupMessageModal />
      <DeleteGroupMessageModal />
    </div>
  );
}
