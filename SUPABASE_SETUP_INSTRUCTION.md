# 📌 SUPABASE SQL SETUP - একবার পড়ো

## তোমাকে শুধু এটা করতে হবে:

### 1️⃣ Supabase Dashboard যাও
- https://supabase.com/dashboard
- তোমার project select করো

### 2️⃣ SQL Editor Open করো
- Left sidebar → SQL Editor
- "New Query" তে ক্লিক করো

### 3️⃣ SQL Code Copy করো
- এই folder থেকে `COMPLETE_SUPABASE_SCHEMA.sql` open করো
- **সব কিছু** select করো (Ctrl+A)
- Copy করো (Ctrl+C)

### 4️⃣ Paste এবং Run করো
- Supabase SQL Editor তে paste করো (Ctrl+V)
- নিচে **"Run"** button এ ক্লিক করো
- Wait করো... (5-10 seconds)

### 5️⃣ Success দেখবে! ✅
```
Success. No rows returned.
```

---

## ⚠️ Important Notes:

### এটা Safe কেন?
- Existing data **delete হবে না**
- এটা `CREATE TABLE IF NOT EXISTS` use করে
- এটা শুধু missing tables/policies add করবে

### এটা কী করবে?
1. ✅ All tables create করবে (যদি না থাকে)
2. ✅ All RLS policies setup করবে
3. ✅ Triggers create করবে (auto-update last_message)
4. ✅ **Realtime enable করবে** (important!)
5. ✅ Indexes create করবে (performance জন্য)

### কতক্ষণ লাগবে?
- প্রথমবার: ~10-15 seconds
- পরে: ~5 seconds

---

## 🔍 Verify করো (Optional)

### Check Tables আছে কিনা:
SQL Editor তে run করো:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

তোমার দেখতে হবে:
- ✅ conversations
- ✅ messages
- ✅ unread_counts
- ✅ profiles
- ✅ groups
- ✅ group_members
- ✅ group_messages
- ✅ group_unread_counts

### Check Realtime Enabled কিনা:
SQL Editor তে run করো:
```sql
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

তোমার দেখতে হবে:
- ✅ conversations
- ✅ messages
- ✅ unread_counts
- ✅ groups
- ✅ group_members
- ✅ group_messages
- ✅ group_unread_counts

---

## 🎉 Done!

এখন তোমার app restart করো এবং test করো।

**Group chat এখন realtime এ কাজ করবে!** 🚀
