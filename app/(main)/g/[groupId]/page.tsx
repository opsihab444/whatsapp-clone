'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Send, Loader2, Smile, Paperclip, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { getGroupMessages, sendGroupMessage, getGroupMembers } from '@/services/group.service';
import { cn } from '@/lib/utils';
import { formatMessageTimeDisplay } from '@/lib/utils';
import { GroupInfoPanel } from '@/components/features/group/GroupInfoPanel';
import { GroupConversation } from '@/types';

export default function GroupChatPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const setActiveGroupId = useUIStore((state) => state.setActiveGroupId);
  const { data: currentUser } = useCurrentUser();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  // Fetch group info from groups cache
  const { data: groups } = useQuery<GroupConversation[]>({ queryKey: ['groups'] });
  const group = useMemo(() => {
    if (!groups) return null;
    return groups.find((g) => g.id === groupId);
  }, [groups, groupId]);

  // Fetch messages
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: async () => {
      const result = await getGroupMessages(supabase, groupId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
  });

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

  useEffect(() => {
    setActiveGroupId(groupId);
    return () => setActiveGroupId(null);
  }, [groupId, setActiveGroupId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const handleSend = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    const result = await sendGroupMessage(supabase, groupId, message.trim());

    if (result.success) {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const memberCount = members?.length || 0;
  const memberNames = members
    .slice(0, 3)
    .map((m) => m.profile?.full_name?.split(' ')[0] || m.profile?.email?.split('@')[0])
    .join(', ');

  return (
    <div className="flex flex-col h-full">
      {/* Header - Clickable to open info panel */}
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
                <h1 className="font-medium text-[15px] text-foreground truncate leading-tight">
                  {group.group.name}
                </h1>
                <p className="text-[12px] text-muted-foreground truncate">
                  {memberNames}{memberCount > 3 ? ` and ${memberCount - 3} more` : ''}
                </p>
              </div>
            </>
          )}
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-3">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-1">
            {messages.map((msg, index) => {
              const isOwn = msg.sender_id === currentUser?.id;
              const showSender = !isOwn && (index === 0 || messages[index - 1].sender_id !== msg.sender_id);
              const senderMember = members.find((m) => m.user_id === msg.sender_id);
              const isAdmin = senderMember?.role === 'admin';

              return (
                <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm',
                      isOwn
                        ? 'bg-[#005c4b] text-white rounded-tr-none'
                        : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
                    )}
                  >
                    {showSender && msg.sender && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            'text-[13px] font-medium',
                            isAdmin ? 'text-amber-400' : 'text-emerald-400'
                          )}
                        >
                          {msg.sender.full_name || msg.sender.email?.split('@')[0]}
                        </span>
                        {isAdmin && (
                          <span className="text-[10px] text-amber-400/70">Admin</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <p className="text-[14.5px] whitespace-pre-wrap break-words leading-[1.35]">
                        {msg.content}
                      </p>
                      <span className="text-[11px] text-white/60 flex-shrink-0 translate-y-0.5">
                        {formatMessageTimeDisplay(msg.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="h-10 w-10 text-primary/60" />
            </div>
            <p className="text-muted-foreground font-medium">No messages yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Send a message to start the conversation
            </p>
          </div>
        )}
      </main>

      {/* Input Area */}
      <div className="px-3 py-2 bg-[#202c33] border-t border-border/50">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground">
            <Smile className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground">
            <Paperclip className="h-6 w-6" />
          </Button>

          <div className="flex-1">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              className="w-full px-4 py-2.5 bg-[#2a3942] rounded-lg text-[15px] text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none"
            />
          </div>

          {message.trim() ? (
            <Button
              onClick={handleSend}
              disabled={isSending}
              size="icon"
              className="h-10 w-10 rounded-full bg-[#00a884] hover:bg-[#00a884]/90"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground">
              <Mic className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>

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
    </div>
  );
}
