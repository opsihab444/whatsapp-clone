'use client';

import { useState, useRef } from 'react';
import { X, Users, Shield, UserMinus, LogOut, Crown, MoreVertical, UserPlus, Search, Loader2, Image as ImageIcon, ChevronRight, Pencil, Camera, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupMember, Profile } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { removeGroupMember, addGroupMember, searchUsersForGroup, leaveGroup, updateGroupMemberRole, updateGroup } from '@/services/group.service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { showErrorToast, showSuccessToast } from '@/lib/toast.utils';

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
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(groupName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      showSuccessToast('Member added successfully');
    } else {
      // Suppress duplicate key error (user already in group)
      if (!result.error.message.includes('duplicate key value') && !result.error.message.includes('unique constraint')) {
        showErrorToast(result.error.message);
      }
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const supabase = createClient();
    const result = await removeGroupMember(supabase, groupId, userId);
    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      showSuccessToast('Member removed');
    } else {
      showErrorToast(result.error.message);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    if (isUpdatingRole) return;
    setIsUpdatingRole(true);
    const supabase = createClient();
    const result = await updateGroupMemberRole(supabase, groupId, userId, 'admin');

    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      showSuccessToast('Member promoted to admin');
    } else {
      showErrorToast(result.error.message);
    }
    setIsUpdatingRole(false);
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (isUpdatingRole) return;
    setIsUpdatingRole(true);
    const supabase = createClient();
    const result = await updateGroupMemberRole(supabase, groupId, userId, 'member');

    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      showSuccessToast('Admin dismissed');
    } else {
      showErrorToast(result.error.message);
    }
    setIsUpdatingRole(false);
  };

  const handleNameSave = async () => {
    if (!editedName.trim() || editedName === groupName) {
      setIsEditingName(false);
      setEditedName(groupName);
      return;
    }

    setIsSavingName(true);
    const supabase = createClient();
    const result = await updateGroup(supabase, groupId, { name: editedName.trim() });

    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      showSuccessToast('Group name updated');
      setIsEditingName(false);
    } else {
      showErrorToast(result.error.message);
    }
    setIsSavingName(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showErrorToast('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showErrorToast('Image size must be less than 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      const avatarUrl = data.url;

      if (avatarUrl) {
        const supabase = createClient();
        const result = await updateGroup(supabase, groupId, { avatar_url: avatarUrl });

        if (result.success) {
          await queryClient.invalidateQueries({ queryKey: ['groups'] });
          showSuccessToast('Group icon updated');
        } else {
          showErrorToast(result.error.message);
        }
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      showErrorToast('Failed to upload image');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[340px] bg-background border-l border-border/50 flex flex-col z-50 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        {/* Header */}
        <div className="flex items-center gap-6 px-4 py-3 bg-background border-b border-border/50 min-h-[70px]">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-all duration-300"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
          <h2 className="text-foreground text-base font-medium">Group info</h2>
        </div>

        <ScrollArea className="flex-1">
          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center py-10 bg-background">
            <div className="relative group">
              <Avatar className="h-[200px] w-[200px] mb-4">
                {groupAvatar && <AvatarImage src={groupAvatar} />}
                <AvatarFallback className="bg-muted text-muted-foreground text-6xl">
                  <Users className="h-24 w-24" />
                </AvatarFallback>
              </Avatar>

              {isAdmin && (
                <>
                  <div
                    className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer mb-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-8 w-8 text-white mb-2" />
                    <span className="text-white text-sm font-medium">CHANGE <br /> PHOTO</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center mb-4">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 w-full px-8">
              {isEditingName ? (
                <div className="flex items-center gap-2 w-full">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 text-[22px] font-normal text-center"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    onClick={handleNameSave}
                    disabled={isSavingName}
                  >
                    {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group relative">
                  <h3 className="text-[22px] text-foreground font-normal mt-2 text-center break-all">
                    {groupName}
                  </h3>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -right-10 top-2"
                      onClick={() => {
                        setEditedName(groupName);
                        setIsEditingName(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <p className="text-[14px] text-muted-foreground mt-1">Group · {members.length} members</p>
          </div>

          {/* Description */}
          {groupDescription && (
            <div className="px-6 py-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{groupDescription}</p>
            </div>
          )}

          {/* Media Section */}
          <div className="border-t border-border/50">
            <div
              className="flex items-center justify-between px-8 py-4 hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-6">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground text-[15px]">Media, links and docs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">0</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Members Section */}
          <div className="py-4 border-t border-border/50">
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
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary transition-colors"
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
                      className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        {member.profile?.avatar_url && <AvatarImage src={member.profile.avatar_url} />}
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          {getInitials(member.profile?.full_name || null, member.profile?.email || '')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground truncate text-sm">
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
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                              <Shield className="h-3 w-3" />
                              Group Admin
                            </span>
                          )}
                        </div>
                      </div>

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
          <div className="px-6 py-4 border-t border-border/50">
            <button
              onClick={async () => {
                if (!currentUserId || isLeaving) return;
                setIsLeaving(true);
                const supabase = createClient();
                const result = await leaveGroup(supabase, groupId);
                if (result.success) {
                  await queryClient.invalidateQueries({ queryKey: ['groups'] });
                  onClose();
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
        </ScrollArea>
      </div>
    </>
  );
}
