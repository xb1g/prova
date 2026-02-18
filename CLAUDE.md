# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Prova** — accountability app for goal-setting with friends. Users set SMART goals (x times per day/week/month), invite friends, and submit daily proof (image/video with real-time timestamp + voice note). Friends review and approve or dispute each proof.

## Commands

```bash
pnpm start          # Start Expo dev server (scan QR or use simulator)
pnpm ios            # Run on iOS simulator (requires Xcode)
pnpm android        # Run on Android emulator
pnpm web            # Run in browser
```

Package manager: **pnpm** (not npm or yarn).

## Architecture

**Expo Router v6** with file-based routing. Entry point is `expo-router/entry`. All screens live under `app/`.

- `app/_layout.tsx` — root Stack layout (headerShown: false globally)
- `app/index.tsx` — landing/marketing page (current state: sign-in stub + stickman figures)

**New Architecture** is enabled (`newArchEnabled: true` in app.json).

### Design System
- Background: `#FDFFF5` (off-white)
- Text: `#111`
- Accent: `#BFFF00` / `#9FE800` (yellow-green glow)
- Font: **Orbit_400Regular** loaded from `assets/Orbit_400Regular.ttf` via `expo-font`
- All text uses `fontFamily: "Orbit_400Regular"` with explicit `fontWeight`

### Routing conventions
Expo Router maps `app/` files to routes. Tab navigation goes inside `app/(tabs)/` with `app/(tabs)/_layout.tsx` as the tab bar config. Auth-gated screens can use `app/(auth)/` group.

### Key dependencies
- `expo-router` — navigation
- `react-native-svg` — SVG rendering (stickman figures, spotlight effects)
- `react-native-safe-area-context` + `react-native-screens` — required by Expo Router
- `@expo-google-fonts/orbit` — font package (font file also bundled locally in assets)

## Supabase setup

Client lives in `lib/supabase.ts`. Auth session context in `lib/auth.tsx` — use `useAuth()` anywhere to get `{ session, user, loading }`.

Env vars (in `.env.local`, gitignored):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Auth redirect logic is in `app/_layout.tsx` → `RootNavigator`: if session exists → `/(tabs)/goals`, else → `/` (landing).

Session is persisted via `AsyncStorage`. The `service_role` key is **never** in the client — it's only used in Supabase Edge Functions for tamper-proof proof submission.

## MVP Scope

Planned screens: **Goals**, **Proofs**, **Profile** (bottom tabs). Auth is skipped/mocked for now.

Proof submission flow: capture image/video in real-time with verified timestamp → add voice note → friends review → approve or dispute.
