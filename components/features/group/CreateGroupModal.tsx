'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Search, Users, Check, Loader2, Camera, ArrowLeft, Sparkles } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createGroup, searchUsersForGroup } from '@/services/group.service';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageCropModal } from '@/components/ui/image-crop-modal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Profile, Conversation } from '@/types';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import Image from 'next/image';

export function CreateGroupModal() {
  const { modals, closeCreateGroupModal, setActiveGroupId } = useUIStore();
  const { data: currentUser } = useCurrentUser();
  const [step, setStep] = useState<'members' | 'details'>('members');
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
  const [groupAvatarBlob, setGroupAvatarBlob] = useState<Blob | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const { isOpen } = modals.createGroup;

  // Fetch user's conversations to get contacts
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    enabled: isOpen,
  });

  // Extract contacts from conversations (don't filter out selected - show with tick)
  const contacts = useMemo(() => {
    if (!conversations || !currentUser?.id) return [];
    
    const contactsMap = new Map<string, Profile>();
    
    conversations.forEach((conv) => {
      const otherUser = conv.other_user;
      if (otherUser) {
        contactsMap.set(otherUser.id, otherUser);
      }
    });
    
    return Array.from(contactsMap.values());
  }, [conversations, currentUser?.id]);


  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (contact) =>
        contact.full_name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('members');
      setGroupName('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedMembers([]);
      setError(null);
      setGroupAvatarPreview(null);
      setGroupAvatarBlob(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Focus name input when moving to details step
  useEffect(() => {
    if (step === 'details') {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Search users not in contacts
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const result = await searchUsersForGroup(supabase, searchQuery.trim());

      if (result.success) {
        const selectedIds = new Set(selectedMembers.map((m) => m.id));
        const contactIds = new Set(contacts.map((c) => c.id));
        setSearchResults(
          result.data.filter((p) => !selectedIds.has(p.id) && !contactIds.has(p.id))
        );
      }
      setIsSearching(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, selectedMembers, contacts, supabase]);

  const handleSelectMember = (profile: Profile) => {
    setSelectedMembers((prev) => [...prev, profile]);
  };

  const handleRemoveMember = (profileId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== profileId));
  };

  const isUserSelected = (userId: string) => {
    return selectedMembers.some((m) => m.id === userId);
  };

  const toggleUserSelection = (profile: Profile) => {
    if (isUserSelected(profile.id)) {
      handleRemoveMember(profile.id);
    } else {
      handleSelectMember(profile);
    }
  };

  const handleNext = () => {
    if (selectedMembers.length === 0) {
      setError('Select at least one member');
      return;
    }
    setError(null);
    setStep('details');
  };

  const handleBack = () => {
    setStep('members');
    setError(null);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setSelectedImageFile(file);
    setShowCropModal(true);
    setError(null);

    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    setGroupAvatarBlob(croppedBlob);
    const previewUrl = URL.createObjectURL(croppedBlob);
    setGroupAvatarPreview(previewUrl);
    setShowCropModal(false);
    setSelectedImageFile(null);
  };


  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const memberIds = selectedMembers.map((m) => m.id);

      // Upload avatar if selected
      let avatarUrl: string | undefined;
      if (groupAvatarBlob) {
        const formData = new FormData();
        formData.append('file', new File([groupAvatarBlob], 'group-avatar.jpg', { type: 'image/jpeg' }));

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          avatarUrl = data.url;
        }
      }

      const result = await createGroup(supabase, groupName.trim(), memberIds, avatarUrl);

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
        closeCreateGroupModal();
        setActiveGroupId(result.data.id);
        router.push(`/g/${result.data.id}`);
      } else {
        setError(result.error?.message || 'Failed to create group');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setIsCreating(false);
    }
  };

  const getInitials = (profile: Profile) => {
    if (profile.full_name) {
      return profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return profile.email?.slice(0, 2).toUpperCase() || '??';
  };

  const renderUserItem = (user: Profile) => {
    const selected = isUserSelected(user.id);

    return (
      <button
        key={user.id}
        onClick={() => toggleUserSelection(user)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-all duration-200',
          selected && 'bg-primary/5'
        )}
      >
        <div
          className={cn(
            'h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-200',
            selected
              ? 'bg-emerald-500 border-emerald-500 scale-110'
              : 'border-muted-foreground/40 hover:border-primary/60'
          )}
        >
          {selected && <Check className="h-3 w-3 text-white" />}
        </div>

        <Avatar className="h-11 w-11 ring-2 ring-background">
          {user.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-sm font-medium">
            {getInitials(user)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 text-left min-w-0">
          <p className="font-medium text-foreground truncate text-[15px]">
            {user.full_name || 'Unknown'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
      </button>
    );
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCreateGroupModal()}>
      <DialogContent className="w-[420px] max-w-[95vw] p-0 gap-0 overflow-hidden bg-card border-border/50 rounded-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <DialogTitle className="sr-only">Create new group</DialogTitle>

        {step === 'members' ? (
          <>
            {/* Header - Members Step */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
              <div className="relative flex items-center gap-3 px-4 py-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-foreground hover:bg-white/10 rounded-full"
                  onClick={closeCreateGroupModal}
                >
                  <X className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground">New Group</h2>
                  {selectedMembers.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
                {selectedMembers.length > 0 && (
                  <Button
                    size="sm"
                    onClick={handleNext}
                    className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white px-4 shadow-lg shadow-emerald-500/25"
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="px-4 py-3 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search name or email"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted/50 border-transparent focus:bg-background rounded-full h-10"
                />
              </div>
            </div>

            {/* Selected Members Pills */}
            {selectedMembers.length > 0 && (
              <div className="px-4 py-3 border-b border-border/50 flex flex-wrap gap-2 bg-muted/20">
                {selectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-200"
                  >
                    <Avatar className="h-6 w-6">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback className="text-[10px] bg-emerald-500 text-white">
                        {getInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-foreground font-medium max-w-[80px] truncate">
                      {member.full_name?.split(' ')[0] || member.email?.split('@')[0]}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMember(member.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded-full transition-colors"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="py-2">
                {/* Contacts Section */}
                {filteredContacts.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Your Contacts
                    </p>
                    {filteredContacts.map((contact) => renderUserItem(contact))}
                  </div>
                )}

                {/* Search Results */}
                {searchQuery.trim() && searchResults.length > 0 && (
                  <div className="mt-2">
                    <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Search Results
                    </p>
                    {searchResults.map((user) => renderUserItem(user))}
                  </div>
                )}

                {/* Loading */}
                {isSearching && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}

                {/* Empty State */}
                {!isSearching && filteredContacts.length === 0 && searchResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-primary/60" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {searchQuery.trim() ? 'No users found' : 'No contacts yet'}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Search by name or email to find users
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Header - Details Step */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent" />
              <div className="relative flex items-center gap-3 px-4 py-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-foreground hover:bg-white/10 rounded-full"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground">Group Details</h2>
                  <p className="text-xs text-muted-foreground">Add a name and photo</p>
                </div>
              </div>
            </div>


            {/* Group Details Content */}
            <div className="p-6 space-y-8">
              {/* Group Avatar */}
              <div className="flex justify-center">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative group"
                >
                  <div className="h-28 w-28 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/50 transition-all overflow-hidden">
                    {groupAvatarPreview ? (
                      <Image src={groupAvatarPreview} alt="Group avatar" fill className="object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Camera className="h-8 w-8 text-emerald-500/60" />
                        <span className="text-[10px] text-emerald-500/60 font-medium">ADD PHOTO</span>
                      </div>
                    )}
                  </div>
                  {groupAvatarPreview && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                    <Camera className="h-4 w-4 text-white" />
                  </div>
                </button>
              </div>

              {/* Group Name Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Group Name</label>
                <div className="relative">
                  <Input
                    ref={nameInputRef}
                    type="text"
                    placeholder="Enter group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="h-12 bg-muted/50 border-transparent focus:border-emerald-500/50 rounded-xl text-foreground text-base placeholder:text-muted-foreground pr-16"
                    maxLength={50}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {groupName.length}/50
                  </span>
                </div>
              </div>

              {/* Members Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Members ({selectedMembers.length + 1})
                  </p>
                  <span className="text-xs text-muted-foreground">including you</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Current User */}
                  <div className="flex flex-col items-center gap-1">
                    <Avatar className="h-12 w-12 ring-2 ring-emerald-500/30">
                      {currentUser?.avatar && <AvatarImage src={currentUser.avatar} />}
                      <AvatarFallback className="bg-emerald-500 text-white text-sm">
                        {currentUser?.name?.[0]?.toUpperCase() || 'Y'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">You</span>
                  </div>
                  {selectedMembers.slice(0, 4).map((member) => (
                    <div key={member.id} className="flex flex-col items-center gap-1">
                      <Avatar className="h-12 w-12 ring-2 ring-background">
                        {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                        <AvatarFallback className="bg-primary/20 text-primary text-sm">
                          {getInitials(member)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] text-muted-foreground max-w-[50px] truncate">
                        {member.full_name?.split(' ')[0] || member.email?.split('@')[0]}
                      </span>
                    </div>
                  ))}
                  {selectedMembers.length > 4 && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm text-muted-foreground font-medium">
                          +{selectedMembers.length - 4}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">more</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-destructive/10 rounded-xl border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>

            {/* Create Button */}
            <div className="p-4 border-t border-border/50 bg-muted/20">
              <Button
                onClick={handleCreateGroup}
                disabled={isCreating || !groupName.trim()}
                className={cn(
                  'w-full h-12 rounded-xl font-medium text-base transition-all duration-300',
                  groupName.trim() && !isCreating
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isCreating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Create Group
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={showCropModal}
        onClose={() => {
          setShowCropModal(false);
          setSelectedImageFile(null);
        }}
        imageFile={selectedImageFile}
        onCropComplete={handleCropComplete}
        title="Drag the image to adjust"
      />
    </Dialog>
  );
}
