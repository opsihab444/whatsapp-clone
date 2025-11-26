'use client';

import { useState } from 'react';
import { X, Users, Shield, UserMinus, LogOut, Crown, MoreVertical, UserPlus, Search, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupMember, Profile } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { removeGroupMember, addGroupMember, searchUsersForGroup, leaveGroup } from '@/services/group.service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface GroupInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  groupAvatar?: string | null;
  groupDescription?: string | null;
  members: GroupMember[];
  currentUserId?: string;
  createdBy: string;
}

export function GroupInfoPanel({
  isOpen,
  onClose,
  groupId,
  groupName,
  groupAvatar,
  groupDescription,
  members,
  currentUserId,
  createdBy,
}: GroupInfoPanelProps) {
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const currentUserMember = members.find((m) => m.user_id === currentUserId);
  const isAdmin = currentUserMember?.role === 'admin';

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };


  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const supabase = createClient();
    const result = await searchUsersForGroup(supabase, query.trim(), groupId);
    if (result.success) {
      setSearchResults(result.data);
    }
    setIsSearching(false);
  };

  const handleAddMember = async (userId: string) => {
    const supabase = createClient();
    const result = await addGroupMember(supabase, groupId, userId);
    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      setSearchQuery('');
      setSearchResults([]);
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const supabase = createClient();
    const result = await removeGroupMember(supabase, groupId, userId);
    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('group_members')
      .update({ role: 'member' })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-background h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4 bg-primary text-primary-foreground">
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-medium">Group info</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center py-8 bg-muted/30">
            <Avatar className="h-32 w-32 mb-4">
              {groupAvatar && <AvatarImage src={groupAvatar} />}
              <AvatarFallback className="bg-primary/20 text-primary text-4xl">
                <Users className="h-16 w-16" />
              </AvatarFallback>
            </Avatar>
            <h3 className="text-2xl font-semibold text-foreground">{groupName}</h3>
            <p className="text-sm text-muted-foreground mt-1">Group · {members.length} members</p>
          </div>

          {/* Description */}
          {groupDescription && (
            <div className="px-6 py-4 border-b border-border">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{groupDescription}</p>
            </div>
          )}

          {/* Members Section */}
          <div className="py-4">
            <div className="flex items-center justify-between px-6 mb-3">
              <p className="text-sm text-muted-foreground">{members.length} members</p>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingMember(!isAddingMember)}
                  className="text-primary hover:text-primary"
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
            </div>

            {/* Add Member Search */}
            {isAddingMember && (
              <div className="px-4 pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {isSearching ? (
                  <div className="mt-2 flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length > 0 && (
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleAddMember(user.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <Avatar className="h-8 w-8">
                          {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                          <AvatarFallback className="text-xs">
                            {getInitials(user.full_name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="text-sm font-medium">{user.full_name || user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Member List */}
            <div className="space-y-1">
              {members
                .sort((a, b) => {
                  // Creator first, then admins, then members
                  if (a.user_id === createdBy) return -1;
                  if (b.user_id === createdBy) return 1;
                  if (a.role === 'admin' && b.role !== 'admin') return -1;
                  if (b.role === 'admin' && a.role !== 'admin') return 1;
                  return 0;
                })
                .map((member) => {
                  const isCurrentUser = member.user_id === currentUserId;
                  const isMemberCreator = member.user_id === createdBy;
                  const isMemberAdmin = member.role === 'admin';

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-12 w-12">
                        {member.profile?.avatar_url && <AvatarImage src={member.profile.avatar_url} />}
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(member.profile?.full_name || null, member.profile?.email || '')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground truncate">
                            {member.profile?.full_name || member.profile?.email || 'Unknown'}
                            {isCurrentUser && <span className="text-muted-foreground"> (You)</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isMemberCreator && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                              <Crown className="h-3 w-3" />
                              Creator
                            </span>
                          )}
                          {isMemberAdmin && !isMemberCreator && (
                            <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              <Shield className="h-3 w-3" />
                              Admin
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions dropdown - only for admins, not for self or creator */}
                      {isAdmin && !isCurrentUser && !isMemberCreator && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isMemberAdmin ? (
                              <DropdownMenuItem onClick={() => handleRemoveAdmin(member.user_id)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Remove admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleMakeAdmin(member.user_id)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Make admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from group
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Leave Group */}
          <div className="px-6 py-4 border-t border-border">
            <button
              onClick={async () => {
                if (!currentUserId || isLeaving) return;
                setIsLeaving(true);
                const supabase = createClient();
                const result = await leaveGroup(supabase, groupId);
                if (result.success) {
                  // Invalidate groups cache to remove from sidebar
                  await queryClient.invalidateQueries({ queryKey: ['groups'] });
                  onClose();
                  // Navigate to home
                  router.push('/');
                }
                setIsLeaving(false);
              }}
              disabled={isLeaving}
              className="flex items-center gap-3 text-destructive hover:bg-destructive/10 w-full px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLeaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
              <span>{isLeaving ? 'Leaving...' : 'Exit group'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
