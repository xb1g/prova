import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fetchMyGoals, MyGoal } from "../../lib/goals";

const CIRCLE_COLORS = ["#D9EED3", "#C4B5D6", "#F5E6C8", "#D8A7A7", "#B5D6E8", "#F5D0B5"];


export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const [goals, setGoals] = useState<MyGoal[]>([]);
  const [proofs, setProofs] = useState<any[]>([]);
  const [circle, setCircle] = useState<{ user_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    const load = async () => {
      try {
        const [fetchedGoals, { data: fetchedProofs }] = await Promise.all([
          fetchMyGoals(userId),
          supabase
            .from("proofs")
            .select("id, media_url, media_type, goal_id")
            .eq("user_id", userId)
            .order("submitted_at", { ascending: false })
            .limit(6),
        ]);

        setGoals(fetchedGoals);
        setProofs(fetchedProofs ?? []);

        const challengeIds = fetchedGoals
          .flatMap((g) => g.participants.map((p) => p.user_id))
          .filter(Boolean);

        if (challengeIds.length > 0) {
          const { data: participants } = await supabase
            .from("challenge_participants")
            .select("user_id")
            .in("user_id", challengeIds);

          const seen = new Set<string>();
          const deduped = (participants ?? []).filter((p) => {
            if (p.user_id === userId || seen.has(p.user_id)) return false;
            seen.add(p.user_id);
            return true;
          });
          setCircle(deduped);
        }
      } catch (e) {
        // silently ignore load errors
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "You";
  const email = user?.email || "";
  const maxStreak = goals.length > 0 ? Math.max(...goals.map((g) => g.streak)) : 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>🌿</Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.displayName}>{displayName}</Text>
            <Text style={styles.emailText}>{email}</Text>
            <Pressable style={styles.editBtn}>
              <Text style={styles.editBtnText}>Edit profile</Text>
            </Pressable>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { value: String(goals.length), label: "Goals" },
            { value: String(proofs.length), label: "Proofs" },
            { value: `${maxStreak}d`, label: "Streak 🔥" },
          ].map((s, i) => (
            <View key={i} style={styles.statPill}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Focus areas */}
        {profile != null && (profile.life_areas?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Focus areas</Text>
            <View style={styles.chipsRow}>
              {profile.life_areas!.map((area: string) => (
                <View key={area} style={styles.chip}>
                  <Text style={styles.chipText}>{area}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Active goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active goals</Text>
          {goals.slice(0, 3).map((g, i) => (
            <View key={g.id} style={styles.miniGoalCard}>
              <Text style={styles.miniGoalEmoji}>🎯</Text>
              <View style={styles.miniGoalBody}>
                <Text style={styles.miniGoalTitle}>{g.title}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Recent proofs grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent proofs</Text>
          <View style={styles.proofsGrid}>
            {proofs.map((p, i) =>
              p.media_url ? (
                <Pressable key={p.id ?? i} style={styles.proofThumb}>
                  <Image
                    source={{ uri: p.media_url }}
                    style={styles.proofThumb}
                    resizeMode="cover"
                  />
                </Pressable>
              ) : (
                <Pressable
                  key={p.id ?? i}
                  style={[styles.proofThumb, { backgroundColor: "#D9EED3" }]}
                />
              )
            )}
          </View>
        </View>

        {/* Accountability circle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accountability circle</Text>
          <View style={styles.circleRow}>
            {circle.map((f, i) => {
              const color = CIRCLE_COLORS[i % CIRCLE_COLORS.length];
              const label = f.user_id.slice(0, 6);
              return (
                <View key={f.user_id} style={styles.circleItem}>
                  <View style={[styles.circleBubble, { backgroundColor: color }]}>
                    <Text style={styles.circleInitial}>{label[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.circleName}>{label}</Text>
                </View>
              );
            })}
            <Pressable style={styles.circleItem}>
              <View style={[styles.circleBubble, { backgroundColor: "#F0EDE8" }]}>
                <Text style={[styles.circleInitial, { color: "#8A8075" }]}>+</Text>
              </View>
              <Text style={styles.circleName}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Profile data */}
        {profile && (
          <View style={styles.section}>
            {profile.direction ? (
              <View style={styles.profileDataCard}>
                <Text style={styles.profileDataLabel}>✨ Direction</Text>
                <Text style={styles.profileDataValue} numberOfLines={3}>{profile.direction}</Text>
              </View>
            ) : null}
            {profile.values ? (
              <View style={styles.profileDataCard}>
                <Text style={styles.profileDataLabel}>💡 Values</Text>
                <Text style={styles.profileDataValue} numberOfLines={3}>{profile.values}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          {["Friends", "Notifications", "Settings"].map((label) => (
            <Pressable
              key={label}
              style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.actionLabel}>{label}</Text>
              <Text style={styles.actionArrow}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }]}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3EF" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  header: {
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },

  // Identity
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#D9EED3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F6F52",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarEmoji: { fontSize: 32 },
  identityInfo: { flex: 1, gap: 3 },
  displayName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },
  emailText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },
  editBtn: { marginTop: 4, alignSelf: "flex-start" },
  editBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#7C9473",
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  statPill: {
    flex: 1,
    backgroundColor: "#FDFAF5",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    gap: 3,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#2F2F2F",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Section
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
    marginBottom: 12,
  },

  // Chips
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#D9EED3",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#4F6F52",
  },

  // Mini goal cards
  miniGoalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FDFAF5",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  miniGoalEmoji: { fontSize: 24 },
  miniGoalBody: { flex: 1, gap: 5 },
  miniGoalTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#2F2F2F",
  },
  miniProgressTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E8E2D9",
    overflow: "hidden",
  },
  miniGoalPct: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#7C9473",
  },

  // Proofs grid
  proofsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  proofThumb: {
    width: "47.5%",
    aspectRatio: 1.2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  proofThumbEmoji: { fontSize: 36 },

  // Accountability circle
  circleRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  circleItem: { alignItems: "center", gap: 5 },
  circleBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  circleInitial: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },
  circleName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },

  // Profile data
  profileDataCard: {
    backgroundColor: "#FDFAF5",
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    gap: 6,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  profileDataLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#8A8075",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  profileDataValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
    lineHeight: 19,
  },

  // Actions
  actionsSection: { marginHorizontal: 20, marginBottom: 16, gap: 8 },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FDFAF5",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
  },
  actionArrow: { fontSize: 20, color: "#A8A098" },

  // Sign out
  signOutBtn: {
    marginHorizontal: 20,
    backgroundColor: "#FDFAF5",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  signOutText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#D8A7A7",
  },
});
