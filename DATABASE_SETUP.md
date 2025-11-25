# Database Setup Guide

## Issues Fixed

### 1. Routing Issues
- Fixed circular redirect between `/` and `/c`
- `/` now redirects to `/login`
- After login/signup, users are redirected to `/c` (main chat page)
- `/c` shows the empty state "Select a chat"

### 2. Database Tables Missing
Your Supabase database is missing the required tables. Follow these steps:

## Setup Instructions

### Step 1: Run the SQL Schema

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the file `supabase-schema.sql` in this project
4. Copy all the SQL code
5. Paste it into the SQL Editor
6. Click **Run** to execute

This will create:
- `profiles` table (user profiles)
- `conversations` table (chat conversations)
- `messages` table (chat messages)
- `unread_counts` table (unread message counts)
- All necessary indexes, policies, and triggers
- Automatic profile creation on user signup
- Realtime subscriptions for live updates

### Step 2: Verify Tables

After running the SQL, verify in your Supabase Dashboard:

1. Go to **Table Editor**
2. You should see these tables:
   - profiles
   - conversations
   - messages
   - unread_counts

### Step 3: Test the Application

1. Sign up for a new account
2. A profile should be automatically created
3. You should be redirected to `/c` (empty state)
4. No more 404 errors for profiles or conversations

## What Was Fixed

### Routing Flow
```
Before:
/ → /c → / (circular redirect)
login → / → /login (circular redirect)

After:
/ → /login
login (success) → /c
signup (success) → /c
/c → shows empty state or chat list
```

### Database Structure
```
auth.users (Supabase Auth)
    ↓ (trigger creates profile)
profiles (user data)
    ↓
conversations (between 2 users)
    ↓
messages (in conversations)
    ↓
unread_counts (per user per conversation)
```

## Common Issues

### Still Getting 404 Errors?
- Make sure you ran the SQL schema in Supabase
- Check that RLS (Row Level Security) policies are enabled
- Verify your `.env.local` has correct Supabase credentials

### Hydration Errors?
- Clear your browser cache
- Restart the Next.js dev server
- The root `/` is now a simple server-side redirect (no hydration issues)

### WebSocket Connection Failed?
- This is normal if you haven't enabled Realtime in Supabase
- Go to Database → Replication → Enable for messages, conversations, unread_counts tables
