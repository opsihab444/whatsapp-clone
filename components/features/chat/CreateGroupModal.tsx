import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { createGroupConversation, searchUserByEmail } from '@/services/chat.service';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Search, Users, X } from 'lucide-react';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGroupCreated: (conversationId: string) => void;
}

interface UserResult {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
}

export function CreateGroupModal({ isOpen, onClose, onGroupCreated }: CreateGroupModalProps) {
    const [step, setStep] = useState<'participants' | 'details'>('participants');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const supabase = createClient();

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsLoading(true);
        const result = await searchUserByEmail(supabase, searchQuery);
        setIsLoading(false);

        if (result.success && result.data) {
            // Check if already selected
            if (!selectedUsers.find(u => u.id === result.data!.id)) {
                setSearchResults([result.data]);
            } else {
                setSearchResults([]);
                toast({ title: 'User already added', variant: 'default' });
            }
        } else {
            setSearchResults([]);
            toast({ title: 'User not found', variant: 'destructive' });
        }
    };

    const toggleUser = (user: UserResult) => {
        if (selectedUsers.find(u => u.id === user.id)) {
            setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
        } else {
            setSelectedUsers([...selectedUsers, user]);
            setSearchResults([]); // Clear search after adding
            setSearchQuery('');
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            toast({ title: 'Group name is required', variant: 'destructive' });
            return;
        }
        if (selectedUsers.length === 0) {
            toast({ title: 'Add at least one participant', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        const result = await createGroupConversation(
            supabase,
            groupName,
            selectedUsers.map(u => u.id)
        );
        setIsLoading(false);

        if (result.success) {
            toast({ title: 'Group created successfully' });
            onGroupCreated(result.data);
            onClose();
            // Reset state
            setStep('participants');
            setSelectedUsers([]);
            setGroupName('');
        } else {
            toast({ title: 'Failed to create group', description: result.error.message, variant: 'destructive' });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{step === 'participants' ? 'Add Participants' : 'Group Details'}</DialogTitle>
                </DialogHeader>

                {step === 'participants' ? (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Search by email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Button onClick={handleSearch} disabled={isLoading}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>

                        {searchResults.length > 0 && (
                            <div className="border rounded-md p-2">
                                {searchResults.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer" onClick={() => toggleUser(user)}>
                                        <div className="flex items-center gap-2">
                                            <Avatar>
                                                <AvatarImage src={user.avatar_url || undefined} />
                                                <AvatarFallback>{user.full_name?.[0] || user.email[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium">{user.full_name || 'Unknown'}</p>
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                            </div>
                                        </div>
                                        <Button size="sm" variant="ghost">Add</Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Selected Participants ({selectedUsers.length})</Label>
                            <ScrollArea className="h-[200px] border rounded-md p-2">
                                {selectedUsers.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">No participants selected</p>
                                ) : (
                                    <div className="space-y-2">
                                        {selectedUsers.map(user => (
                                            <div key={user.id} className="flex items-center justify-between bg-secondary/50 p-2 rounded">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user.avatar_url || undefined} />
                                                        <AvatarFallback>{user.full_name?.[0] || user.email[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium">{user.full_name || user.email}</span>
                                                </div>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleUser(user)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Group Name</Label>
                            <Input
                                placeholder="Enter group name"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Participants</Label>
                            <div className="flex -space-x-2 overflow-hidden">
                                {selectedUsers.slice(0, 5).map(user => (
                                    <Avatar key={user.id} className="inline-block border-2 border-background">
                                        <AvatarImage src={user.avatar_url || undefined} />
                                        <AvatarFallback>{user.full_name?.[0] || user.email[0]}</AvatarFallback>
                                    </Avatar>
                                ))}
                                {selectedUsers.length > 5 && (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
                                        +{selectedUsers.length - 5}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {step === 'participants' ? (
                        <Button onClick={() => setStep('details')} disabled={selectedUsers.length === 0}>
                            Next
                        </Button>
                    ) : (
                        <div className="flex gap-2 w-full justify-between">
                            <Button variant="outline" onClick={() => setStep('participants')}>Back</Button>
                            <Button onClick={handleCreateGroup} disabled={isLoading}>
                                {isLoading ? 'Creating...' : 'Create Group'}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
