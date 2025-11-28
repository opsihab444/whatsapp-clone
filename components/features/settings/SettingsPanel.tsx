'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useUIStore } from '@/store/ui.store';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Lock, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

export function SettingsPanel() {
  const { closeSettings } = useUIStore();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  
  const [activeSection, setActiveSection] = useState<'profile' | 'password' | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (currentUser?.name) {
      setName(currentUser.name);
    }
    if (currentUser?.avatar) {
      setAvatarPreview(currentUser.avatar);
    }
  }, [currentUser]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image must be less than 5MB');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMessage(null);
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', avatarFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload avatar');

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Avatar upload error:', error);
      return null;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Name is required');
      return;
    }

    setIsUpdatingProfile(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let avatarUrl = currentUser?.avatar || null;

      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: name,
          avatar_url: avatarUrl,
        },
      });

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            full_name: name,
            avatar_url: avatarUrl,
          })
          .eq('id', user.id);
      }

      queryClient.setQueryData(['currentUser'], (old: any) => ({
        ...old,
        name: name,
        avatar: avatarUrl,
      }));

      setSuccessMessage('Profile updated successfully!');
      setAvatarFile(null);
      setActiveSection(null);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to update profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const onPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('All fields are required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('User not found');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setErrorMessage('Current password is incorrect');
        setIsChangingPassword(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setSuccessMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveSection(null);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm min-h-[64px]">
        <Button
          variant="ghost"
          size="icon"
          onClick={closeSettings}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* Messages */}
          {successMessage && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <span className="text-sm text-green-500">{successMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-500">{errorMessage}</p>
            </div>
          )}

          {/* Profile Card */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 ring-4 ring-background">
                  {avatarPreview && <AvatarImage src={avatarPreview} />}
                  <AvatarFallback className="bg-muted text-muted-foreground text-xl">
                    {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {currentUser?.name || 'User'}
                  </h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {currentUser?.email}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Sections */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {/* Edit Profile */}
            <button
              onClick={() => setActiveSection(activeSection === 'profile' ? null : 'profile')}
              className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Edit Profile</p>
                <p className="text-sm text-muted-foreground">Change your name and photo</p>
              </div>
            </button>

            {activeSection === 'profile' && (
              <form onSubmit={onProfileSubmit} className="p-6 bg-muted/30 space-y-6">
                <div className="flex justify-center">
                  <div className="relative group">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border-2 border-border hover:border-primary transition-all"
                    >
                      {avatarPreview ? (
                        <Image src={avatarPreview} alt="Avatar" fill className="object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Users className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ImageIcon className="h-6 w-6 text-white" />
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1 w-full h-12 px-4 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setActiveSection(null)} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUpdatingProfile || isUploadingAvatar} className="flex-1">
                    {isUpdatingProfile || isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </form>
            )}

            {/* Change Password */}
            <button
              onClick={() => setActiveSection(activeSection === 'password' ? null : 'password')}
              className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Lock className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Change Password</p>
                <p className="text-sm text-muted-foreground">Update your password</p>
              </div>
            </button>

            {activeSection === 'password' && (
              <form onSubmit={onPasswordSubmit} className="p-6 bg-muted/30 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Current Password</label>
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="mt-1 w-full h-12 px-4 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="mt-1 w-full h-12 px-4 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Confirm Password</label>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="mt-1 w-full h-12 px-4 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setActiveSection(null);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isChangingPassword} className="flex-1">
                    {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
