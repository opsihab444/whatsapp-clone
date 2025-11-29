'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, Check, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addGroupMember, searchUsersForGroup } from '@/services/group.service';
import { showErrorToast, showSuccessToast } from '@/lib/toast.utils';
import { cn } from '@/lib/utils';
import { Profile, Conversation } from '@/types';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  existingMemberIds: string[];
  currentUserId?: string;
}

export function AddMemberModal({
  isOpen,
  onClose,
  groupId,
  existingMemberIds,
  currentUserId,
}: AddMemberModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  // Fetch user's conversations to get contacts
  const { data: conversations = [], isLoading: isLoadingContacts } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    enabled: isOpen,
  });

  // Extract contacts from conversations (excluding existing members)
  const contacts = useMemo(() => {
    if (!conversations || !currentUserId) return [];
    
    const contactsMap = new Map<string, Profile>();
    
    conversations.forEach((conv) => {
      // Get the other participant from other_user field
      const otherUser = conv.other_user;
      
      if (otherUser && !existingMemberIds.includes(otherUser.id)) {
        contactsMap.set(otherUser.id, otherUser);
      }
    });
    
    return Array.from(contactsMap.values());
  }, [conversations, currentUserId, existingMemberIds]);


  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    
    const query = searchQuery.toLowerCase();
    return contacts.filter((contact) => 
      contact.full_name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  // Search for users not in contacts
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const result = await searchUsersForGroup(supabase, searchQuery.trim(), groupId);
      
      if (result.success) {
        // Filter out contacts (they're already shown) and existing members
        const contactIds = new Set(contacts.map(c => c.id));
        const filtered = result.data.filter(
          (user) => !contactIds.has(user.id) && !existingMemberIds.includes(user.id)
        );
        setSearchResults(filtered);
      }
      setIsSearching(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, supabase, groupId, contacts, existingMemberIds]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedUsers([]);
      setSearchResults([]);
    }
  }, [isOpen]);

  const toggleUserSelection = (user: Profile) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u.id === user.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const isUserSelected = (userId: string) => {
    return selectedUsers.some((u) => u.id === userId);
  };

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) return;
    
    setIsAdding(true);
    let successCount = 0;
    
    for (const user of selectedUsers) {
      const result = await addGroupMember(supabase, groupId, user.id);
      if (result.success) {
        successCount++;
      }
    }
    
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
      showSuccessToast(`${successCount} member${successCount > 1 ? 's' : ''} added`);
      onClose();
    } else {
      showErrorToast('Failed to add members');
    }
    
    setIsAdding(false);
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };


  const renderUserItem = (user: Profile, showCheckbox: boolean = true) => {
    const selected = isUserSelected(user.id);
    
    return (
      <button
        key={user.id}
        onClick={() => toggleUserSelection(user)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
          selected && "bg-primary/5"
        )}
      >
        {showCheckbox && (
          <div className={cn(
            "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
            selected 
              ? "bg-primary border-primary" 
              : "border-muted-foreground/40 hover:border-primary/60"
          )}>
            {selected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        )}
        
        <Avatar className="h-10 w-10">
          {user.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {getInitials(user.full_name, user.email)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 text-left min-w-0">
          <p className="font-medium text-foreground truncate text-sm">
            {user.full_name || 'Unknown'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user.email}
          </p>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0 overflow-hidden bg-card border-border rounded-xl max-h-[80vh] flex flex-col">
        <DialogTitle className="sr-only">Add member</DialogTitle>
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-base font-medium text-foreground">Add member</h2>
            {selectedUsers.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedUsers.length} selected</p>
            )}
          </div>
          {selectedUsers.length > 0 && (
            <Button
              size="sm"
              onClick={handleAddMembers}
              disabled={isAdding}
              className="rounded-full"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" />
                  Add
                </>
              )}
            </Button>
          )}
        </div>


        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50 border-transparent focus:bg-background rounded-full h-10"
            />
          </div>
        </div>

        {/* Selected Users Pills */}
        {selectedUsers.length > 0 && (
          <div className="px-4 py-2 border-b border-border/50 flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full border border-primary/20"
              >
                <Avatar className="h-5 w-5">
                  {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {getInitials(user.full_name, user.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-foreground max-w-[80px] truncate">
                  {user.full_name?.split(' ')[0] || user.email?.split('@')[0]}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleUserSelection(user);
                  }}
                  className="p-0.5 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoadingContacts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="py-2">
              {/* Contacts Section */}
              {filteredContacts.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Contacts
                  </p>
                  {filteredContacts.map((contact) => renderUserItem(contact))}
                </div>
              )}

              {/* Search Results Section */}
              {searchQuery.trim() && searchResults.length > 0 && (
                <div className="mt-2">
                  <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Search Results
                  </p>
                  {searchResults.map((user) => renderUserItem(user))}
                </div>
              )}

              {/* Loading Search */}
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Empty State */}
              {!isLoadingContacts && filteredContacts.length === 0 && searchResults.length === 0 && !isSearching && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <UserPlus className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery.trim() 
                      ? 'No users found' 
                      : 'No contacts available'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {searchQuery.trim() 
                      ? 'Try a different search term' 
                      : 'Search by name or email to find users'}
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
