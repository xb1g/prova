import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable } from "react-native";

const TABS = [
  { name: "goals", label: "Goals", icon: "🎯" },
  { name: "proofs", label: "Proofs", icon: "📸" },
  { name: "profile", label: "Profile", icon: "🌿" },
];

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tab = TABS.find((t) => t.name === route.name) ?? { label: route.name, icon: "○" };

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.6 }]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{tab.label}</Text>
            {isFocused && <View style={styles.tabIndicator} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#F5F3EF" } }}
    >
      <Tabs.Screen name="goals" />
      <Tabs.Screen name="proofs" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 28 : 20,
    left: 20,
    right: 20,
    flexDirection: "row",
    backgroundColor: "#FDFAF5",
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    position: "relative",
    paddingVertical: 4,
  },
  tabIcon: { fontSize: 18 },
  tabLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#A8A098",
    letterSpacing: 0.1,
  },
  tabLabelActive: { color: "#4F6F52" },
  tabIndicator: {
    position: "absolute",
    bottom: -4,
    width: 20,
    height: 3,
    backgroundColor: "#7C9473",
    borderRadius: 2,
  },
});
