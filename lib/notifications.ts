import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerPushToken(accessToken: string): Promise<void> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/register-push-token';
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {
    // best-effort registration — silently swallow errors
  }
}
