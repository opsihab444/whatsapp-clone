'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Search, Users, Check, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createGroup, searchUsersForGroup } from '@/services/group.service';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Profile } from '@/types';
import { useRouter } from 'next/navigation';

export function CreateGroupModal() {
  const { modals, closeCreateGroupModal, setActiveGroupId } = useUIStore();
  const [step, setStep] = useState<'members' | 'details'>('members');
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { isOpen } = modals.createGroup;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('members');
      setGroupName('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedMembers([]);
      setError(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Focus name input when moving to details step
  useEffect(() => {
    if (step === 'details') {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Search users
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const supabase = createClient();
      const result = await searchUsersForGroup(supabase, searchQuery.trim());

      if (result.success) {
        // Filter out already selected members
        const selectedIds = new Set(selectedMembers.map((m) => m.id));
        setSearchResults(result.data.filter((p) => !selectedIds.has(p.id)));
      }
      setIsSearching(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, selectedMembers]);

  const handleSelectMember = (profile: Profile) => {
    setSelectedMembers((prev) => [...prev, profile]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveMember = (profileId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== profileId));
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


  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      const memberIds = selectedMembers.map((m) => m.id);
      const result = await createGroup(supabase, groupName.trim(), memberIds);

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
        closeCreateGroupModal();
        // Navigate to the new group
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCreateGroupModal();
    }
  };

  if (!isOpen) return null;

  const getInitials = (profile: Profile) => {
    if (profile.full_name) {
      return profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return profile.email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCreateGroupModal} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-card rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 bg-primary text-primary-foreground">
          <button
            onClick={step === 'members' ? closeCreateGroupModal : handleBack}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <div>
            <h2 className="text-lg font-medium text-white">
              {step === 'members' ? 'Add group members' : 'New group'}
            </h2>
            {step === 'members' && selectedMembers.length > 0 && (
              <p className="text-sm text-primary-foreground/80">{selectedMembers.length} selected</p>
            )}
          </div>
        </div>

        {step === 'members' ? (
          <>
            {/* Selected Members */}
            {selectedMembers.length > 0 && (
              <div className="px-4 py-3 border-b border-border flex flex-wrap gap-2">
                {selectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20"
                  >
                    <Avatar className="h-6 w-6">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {getInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground">
                      {member.full_name || member.email}
                    </span>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-0.5 hover:bg-muted rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by name or email"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/50 border-transparent focus:bg-background text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Search Results */}
            <div className="max-h-[300px] overflow-y-auto">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleSelectMember(profile)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(profile)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-foreground">
                        {profile.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </div>
                  </button>
                ))
              ) : searchQuery ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No users found
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  Search for users to add to your group
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 text-sm text-red-400">{error}</div>
            )}

            {/* Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-border bg-muted/20">
              <button
                onClick={handleNext}
                disabled={selectedMembers.length === 0}
                className={cn(
                  'p-3 rounded-full transition-all shadow-md',
                  selectedMembers.length > 0
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                <Check className="w-6 h-6" />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Group Details */}
            <div className="p-6 space-y-6">
              {/* Group Icon */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                  <Users className="w-10 h-10 text-muted-foreground" />
                </div>
              </div>

              {/* Group Name Input */}
              <div>
                <Input
                  ref={nameInputRef}
                  type="text"
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="bg-transparent border-0 border-b-2 border-primary rounded-none text-foreground text-lg placeholder:text-muted-foreground focus-visible:ring-0 px-0"
                  maxLength={50}
                />
                <p className="mt-1 text-xs text-muted-foreground text-right">{groupName.length}/50</p>
              </div>

              {/* Members Preview */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Members: {selectedMembers.length + 1} (including you)
                </p>
                <div className="flex -space-x-2">
                  {selectedMembers.slice(0, 5).map((member) => (
                    <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {getInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {selectedMembers.length > 5 && (
                    <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">+{selectedMembers.length - 5}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-border bg-muted/20">
              <button
                onClick={handleCreateGroup}
                disabled={isCreating || !groupName.trim()}
                className={cn(
                  'p-3 rounded-full transition-all shadow-md',
                  groupName.trim() && !isCreating
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {isCreating ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Check className="w-6 h-6" />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
