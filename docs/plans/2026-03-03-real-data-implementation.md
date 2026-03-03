# Real Data Implementation

**Date:** 2026-03-03
**Status:** Approved

## Decisions

| Concern | Decision |
|---|---|
| Media storage | Cloudinary (upload from device, store `secure_url`) |
| Friends | Invite by email/username per goal |
| Progress display | Streak counter (consecutive approved proofs, no % bar) |
| Proof approval | Majority vote (approve/dispute) among accountability partners |
| Social layer | Emoji reactions + text comments on proofs |
| Push notifications | Expo Push Notifications |
| Realtime | Pull on screen focus / manual refresh |
| Discover goals | Query popular goal titles from real `goals` table |

---

## Current State

- ✅ Auth (Google OAuth)
- ✅ Onboarding (AI chat → `user_profiles`)
- ✅ Goal creation (SMART grading, AI parse, reality check, `create-goal` edge fn)
- ✅ DB: `goals`, `challenges`, `challenge_participants`, `user_profiles`
- ❌ No proofs table
- ❌ No proof upload flow
- ❌ No social layer (reactions / comments / votes)
- ❌ No push tokens table
- ❌ No invite-by-username flow
- ❌ All frontend screens show mock data

---

## Phase 1 — Database Schema

### `proofs`
```sql
id              uuid primary key default gen_random_uuid()
goal_id         uuid references goals(id) on delete cascade
user_id         uuid references auth.users(id) on delete cascade
media_url       text          -- Cloudinary secure_url
media_type      text          -- photo | video | text | voice
caption         text
status          text default 'pending'  -- pending | approved | disputed
streak_period   text          -- ISO week "2026-W09" or date "2026-03-03"
submitted_at    timestamptz default now()
```

### `proof_votes`
```sql
id          uuid primary key default gen_random_uuid()
proof_id    uuid references proofs(id) on delete cascade
voter_id    uuid references auth.users(id) on delete cascade
vote        text    -- approve | dispute
created_at  timestamptz default now()
UNIQUE(proof_id, voter_id)
```

### `proof_reactions`
```sql
id          uuid primary key default gen_random_uuid()
proof_id    uuid references proofs(id) on delete cascade
user_id     uuid references auth.users(id) on delete cascade
emoji       text
created_at  timestamptz default now()
UNIQUE(proof_id, user_id, emoji)
```

### `proof_comments`
```sql
id          uuid primary key default gen_random_uuid()
proof_id    uuid references proofs(id) on delete cascade
user_id     uuid references auth.users(id) on delete cascade
body        text
created_at  timestamptz default now()
```

### `push_tokens`
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users(id) on delete cascade UNIQUE
token       text
platform    text    -- ios | android
updated_at  timestamptz default now()
```

### RLS policies
All new tables: users can read/write rows linked to their own goals or challenges they participate in.

---

## Phase 2 — Edge Functions

All edge functions use `verify_jwt = false` in their `config.toml` and validate the JWT manually inside via `supabase.auth.getUser(token)`.

### `submit-proof`
1. Verify JWT
2. Accept: `goal_id`, `media_url`, `media_type`, `caption`
3. Derive `streak_period` from goal's `frequency_unit` (week → ISO week, day → date string)
4. Insert into `proofs` (status = `pending`)
5. Fetch accountability partners from `challenge_participants`
6. Fetch their `push_tokens`
7. POST to Expo Push API to notify each partner

### `vote-proof`
1. Verify JWT
2. Accept: `proof_id`, `vote` (approve | dispute)
3. Upsert into `proof_votes`
4. Count votes vs total partners: if `approve >= ceil(partners / 2 + 1)` → set `status = approved`; if `dispute >= ceil(...)` → set `status = disputed`
5. Return updated proof status

### `invite-to-goal`
1. Verify JWT (caller must own the goal's challenge)
2. Accept: `goal_id`, `identifier` (email or username)
3. Lookup user by email in `auth.users`
4. Insert into `challenge_participants` with `status = invited`
5. Send push notification to invitee if push token exists

### `get-popular-goals`
1. No auth required
2. `SELECT title, COUNT(*) as count FROM goals GROUP BY lower(title) ORDER BY count DESC LIMIT 20`
3. Return deduplicated list with participant counts

### `register-push-token`
1. Verify JWT
2. Accept: `token`, `platform`
3. Upsert into `push_tokens`

---

## Phase 3 — Frontend Data Layer

### `lib/goals.ts` (new)
- `fetchMyGoals(userId)` — goals + challenge_participants + latest proof streak
- `fetchGoalProofs(goalId)` — proofs with reaction/comment/vote counts
- `fetchPopularGoals()` — calls `get-popular-goals` edge fn

### `lib/proofs.ts` (new)
- `uploadToCloudinary(file)` — FormData POST to Cloudinary unsigned upload preset → returns `secure_url`
- `submitProof(goalId, mediaUrl, mediaType, caption)` — calls `submit-proof` edge fn
- `voteOnProof(proofId, vote)` — calls `vote-proof` edge fn
- `addReaction(proofId, emoji)` — direct Supabase insert into `proof_reactions`
- `addComment(proofId, body)` — direct Supabase insert into `proof_comments`

### `lib/notifications.ts` (new)
- `registerPushToken()` — `expo-notifications` `getExpoPushTokenAsync()` → calls `register-push-token` edge fn
- Called once on app load after auth session is confirmed

---

## Phase 4 — Screens

### Goals screen (`(tabs)/goals.tsx`)
- Replace mock data with `fetchMyGoals(userId)`
- Show real streak count per goal
- "Add Friends" → search by email → `invite-to-goal` edge fn
- "Submit proof" → navigate to `app/proof-submit.tsx`
- Discover section → `fetchPopularGoals()`

### Proof submission screen (`app/proof-submit.tsx`) — new
- `expo-image-picker` for camera or gallery
- Upload progress indicator
- Cloudinary upload → receive `secure_url`
- Caption text input
- Calls `submit-proof` edge fn
- Navigate back to goals on success

### Proofs feed screen (`(tabs)/proofs.tsx`)
- Fetch all proofs from goals the user owns or participates in
- Approve / Dispute buttons → `vote-proof` edge fn
- Emoji reaction bar → `addReaction`
- Comments thread → `addComment` + list `proof_comments`

### Profile screen (`(tabs)/profile.tsx`)
- Real counts: goals, proofs, streak from DB
- Active goals list from `goals` table
- Recent proofs grid using real `media_url` images (`<Image>`)
- Accountability circle from `challenge_participants` usernames/avatars

### Invite friends flow (inside goal card)
- Search input by email
- Calls `invite-to-goal` edge fn
- Shows `invited` / `active` status per invitee

---

## Phase 5 — External Setup

### Cloudinary
- Create account at cloudinary.com
- Create an **unsigned upload preset** (Settings → Upload → Add upload preset)
- Add to `.env.local`:
  ```
  EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
  EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_preset
  ```
- Only `secure_url` is stored in DB — no API secret on client

### Expo Push Notifications
- `npx expo install expo-notifications`
- Add to `app.json` → `expo.plugins`: `["expo-notifications"]`
- Request permissions on first authenticated app launch
- Store token in `push_tokens` via `register-push-token` edge fn
- Edge functions call Expo Push API: `https://exp.host/--/api/v2/push/send`

---

## Implementation Order

1. DB migrations (5 new tables + RLS)
2. `register-push-token` edge fn
3. `get-popular-goals` edge fn
4. `submit-proof` edge fn
5. `vote-proof` edge fn
6. `invite-to-goal` edge fn
7. Cloudinary setup (`.env.local` + upload preset)
8. Expo push notifications setup
9. `lib/goals.ts`
10. `lib/proofs.ts` (+ Cloudinary upload helper)
11. `lib/notifications.ts`
12. Goals screen → real data + discover
13. Proof submission screen
14. Proofs feed → vote / react / comment
15. Profile screen → real stats + media grid
16. Invite friends flow in goal card
