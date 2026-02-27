# Supabase Google Login Flow

## Overview

The app uses Supabase OAuth with Google provider. The flow uses a custom URL scheme (`prova://`) to handle the redirect back to the app after authentication.

## How It Works

### 1. User Initiates Login
- User taps "Sign in with Google" button
- `signInWithGoogle()` is called from `lib/auth.tsx:89`

### 2. OAuth Request
```typescript
const redirectTo = "prova://google-auth";

const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo, skipBrowserRedirect: true },
});
```
- Uses `skipBrowserRedirect: true` to prevent automatic browser redirect
- Sets redirect URL to custom scheme: `prova://google-auth`

### 3. Open Browser Auth Session
```typescript
const result = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo, {
  showInRecents: true,
});
```
- Opens Google sign-in in a browser (WebBrowser)
- `showInRecents: true` allows user to switch back to app easily
- The browser redirects to `prova://google-auth` with tokens in the URL hash

### 4. Extract Tokens from URL
```typescript
function extractParamsFromUrl(url: string) {
  const parsedUrl = new URL(url);
  const hash = parsedUrl.hash.substring(1);
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    // ...
  };
}
```
- After success, the browser returns with tokens in the URL hash fragment
- Extracts `access_token` and `refresh_token` from the redirect URL

### 5. Set Session
```typescript
const { data: sessionData } = await supabase.auth.setSession({
  access_token: params.access_token,
  refresh_token: params.refresh_token,
});
```
- Calls `setSession()` to store the tokens in Supabase client
- This updates the auth state and triggers `onAuthStateChange`

## Components Involved

| File | Role |
|------|------|
| `lib/auth.tsx` | Contains `signInWithGoogle()` function and `AuthProvider` |
| `app.json` | Defines `"scheme": "prova"` for deep linking |
| `app/_layout.tsx` | Uses `RootNavigator` to route based on session state |

## Session Persistence

- Supabase client stores session in AsyncStorage (default behavior)
- On app launch, `supabase.auth.getSession()` checks for existing session
- `onAuthStateChange` listener handles session changes (login/logout)

## Profile Fetching

After successful login, the `AuthProvider` fetches the user profile:
```typescript
const { data } = await supabase
  .from("user_profiles")
  .select("onboarding_done, life_areas, direction, values, blockers, weekly_hours")
  .eq("user_id", userId)
  .maybeSingle();
```

This profile data is exposed via `useAuth()` hook as `profile`.
