import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../lib/auth";
import { registerPushToken } from "../lib/notifications";
import { useFonts } from "expo-font";
import {
  Inter_100Thin,
  Inter_100Thin_Italic,
  Inter_200ExtraLight,
  Inter_200ExtraLight_Italic,
  Inter_300Light,
  Inter_300Light_Italic,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_500Medium_Italic,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
  Inter_700Bold,
  Inter_700Bold_Italic,
  Inter_800ExtraBold,
  Inter_800ExtraBold_Italic,
  Inter_900Black,
  Inter_900Black_Italic,
} from "@expo-google-fonts/inter";
import { Text } from "react-native";

function RootNavigator() {
  const { session, loading, profile, profileLoading } = useAuth();

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    // Profile null = no row yet = needs onboarding
    if (!profile || !profile.onboarding_done) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)/goals");
      // Best-effort push token registration after routing
      registerPushToken(session.access_token);
    }
  }, [session, loading, profile, profileLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="goal-create" />
      <Stack.Screen name="proof-submit" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_100Thin,
    Inter_100Thin_Italic,
    Inter_200ExtraLight,
    Inter_200ExtraLight_Italic,
    Inter_300Light,
    Inter_300Light_Italic,
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_500Medium_Italic,
    Inter_600SemiBold,
    Inter_600SemiBold_Italic,
    Inter_700Bold,
    Inter_700Bold_Italic,
    Inter_800ExtraBold,
    Inter_800ExtraBold_Italic,
    Inter_900Black,
    Inter_900Black_Italic,
  });
  const existingTextDefaultStyle = Text.defaultProps?.style;
  Text.defaultProps = {
    ...(Text.defaultProps || {}),
    style: [{ letterSpacing: -0.22 }, ...(existingTextDefaultStyle ? Array.isArray(existingTextDefaultStyle)
      ? existingTextDefaultStyle
      : [existingTextDefaultStyle] : [])],
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
