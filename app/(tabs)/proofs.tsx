import { Platform, View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FAB_BOTTOM_OFFSET = Platform.OS === "ios" ? 120 : 108;

export default function ProofsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>Proofs</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>□</Text>
          <Text style={styles.emptyTitle}>No proofs in your feed yet</Text>
          <Text style={styles.emptyBody}>
            Complete a goal action to submit your proof.{"\n"}
            Your friends&apos; proofs will also appear in this combined feed.
          </Text>
        </View>
      </ScrollView>

      {/* Submit proof FAB */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: FAB_BOTTOM_OFFSET + insets.bottom },
          pressed && styles.fabPressed,
        ]}
      >
        {({ pressed }) => (
          <Text style={[styles.fabText, pressed && styles.fabTextPressed]}>
            + Submit Proof
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDFFF5",
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#111",
    letterSpacing: 0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    color: "#111",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#111",
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: "Inter_300Light_Italic",
    fontWeight: "300",
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
  },
  fab: {
    position: "absolute",
    left: 24,
    right: 24,
    backgroundColor: "#111",
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    borderRadius: 30,
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: {
    backgroundColor: "#BFFF00",
    borderColor: "#BFFF00",
  },
  fabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#FDFFF5",
    letterSpacing: 0.2,
  },
  fabTextPressed: {
    color: "#111",
  },
});
