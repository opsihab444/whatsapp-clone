'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, UserPlus, LogOut, Trash2, Edit2, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { searchUserByEmail, addParticipants, updateGroupDetails } from '@/services/chat.service';
import { useToast } from '@/hooks/use-toast';
import { Conversation, Profile } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface GroupInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversation: Conversation;
    currentUserId: string;
}

export function GroupInfoModal({ isOpen, onClose, conversation, currentUserId }: GroupInfoModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Profile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [groupName, setGroupName] = useState(conversation.group_name || '');
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const supabase = createClient();

    // Reset group name when conversation changes
    useEffect(() => {
        setGroupName(conversation.group_name || '');
    }, [conversation]);

    // Search users
    useEffect(() => {
        const searchUsers = async () => {
            if (searchQuery.length < 3) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const result = await searchUserByEmail(supabase, searchQuery);
                if (result.success && result.data) {
                    setSearchResults([result.data].filter(u => u.id !== currentUserId));
                } else {
                    setSearchResults([]);
                }
            } catch (error) {
                console.error('Error searching users:', error);
            } finally {
                setIsSearching(false);
            }
        };

        const debounce = setTimeout(searchUsers, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, currentUserId, supabase]);

    // Add participant
    const handleAddParticipant = async (user: Profile) => {
        try {
            const result = await addParticipants(supabase, conversation.id, [user.id]);
            if (result.success) {
                toast({ title: 'Success', description: `${user.full_name} added to group` });
                setSearchQuery('');
                setSearchResults([]);
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            } else {
                toast({ title: 'Error', description: 'Failed to add participant', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'An error occurred', variant: 'destructive' });
        }
    };

    // Update group name
    const handleUpdateName = async () => {
        if (!groupName.trim() || groupName === conversation.group_name) {
            setIsEditingName(false);
            return;
        }

        try {
            const result = await updateGroupDetails(supabase, conversation.id, { group_name: groupName });
            if (result.success) {
                toast({ title: 'Success', description: 'Group name updated' });
                setIsEditingName(false);
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            } else {
                toast({ title: 'Error', description: 'Failed to update group name', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'An error occurred', variant: 'destructive' });
        }
    };

    const isAdmin = conversation.created_by === currentUserId;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-[#222e35] text-[#e9edef] border-none p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 bg-[#202c33]">
                    <DialogTitle className="text-[#e9edef]">Group Info</DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6">
                    {/* Group Header */}
                    <div className="flex flex-col items-center gap-4">
                        <Avatar className="h-24 w-24">
                            <AvatarImage src={conversation.group_avatar || undefined} />
                            <AvatarFallback className="bg-[#6a7175] text-2xl">
                                {conversation.group_name?.[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex items-center gap-2 w-full justify-center">
                            {isEditingName ? (
                                <div className="flex items-center gap-2 w-full max-w-[200px]">
                                    <Input
                                        value={groupName}
                                        onChange={(e) => setGroupName(e.target.value)}
                                        className="bg-[#2a3942] border-none text-[#e9edef] h-8"
                                        autoFocus
                                    />
                                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#374045]" onClick={handleUpdateName}>
                                        <Check className="h-4 w-4 text-green-500" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold">{conversation.group_name}</h2>
                                    {isAdmin && (
                                        <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-[#374045]" onClick={() => setIsEditingName(true)}>
                                            <Edit2 className="h-3 w-3 text-[#8696a0]" />
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-[#8696a0]">Group • {conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : ''}</p>
                    </div>

                    {/* Add Participants */}
                    {isAdmin && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-[#8696a0]">Add Participants</h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8696a0]" />
                                <Input
                                    placeholder="Search by email..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 bg-[#2a3942] border-none text-[#e9edef] placeholder:text-[#8696a0]"
                                />
                            </div>

                            {searchResults.length > 0 && (
                                <ScrollArea className="h-[120px] rounded-md border border-[#374045] bg-[#111b21] p-2">
                                    <div className="space-y-2">
                                        {searchResults.map((user) => (
                                            <div key={user.id} className="flex items-center justify-between p-2 hover:bg-[#202c33] rounded cursor-pointer" onClick={() => handleAddParticipant(user)}>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user.avatar_url || undefined} />
                                                        <AvatarFallback>{user.full_name?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-[#e9edef]">{user.full_name}</span>
                                                        <span className="text-xs text-[#8696a0]">{user.email}</span>
                                                    </div>
                                                </div>
                                                <UserPlus className="h-4 w-4 text-[#00a884]" />
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-2 pt-4 border-t border-[#374045]">
                        <Button variant="ghost" className="w-full justify-start text-[#ea0038] hover:bg-[#202c33] hover:text-[#ea0038]">
                            <LogOut className="mr-2 h-4 w-4" />
                            Exit Group
                        </Button>
                        {isAdmin && (
                            <Button variant="ghost" className="w-full justify-start text-[#ea0038] hover:bg-[#202c33] hover:text-[#ea0038]">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Group
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
