import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import Button from "../../lib/components/Button";
import { useAuth } from "../../lib/auth";
import { fetchMyGoals, fetchPopularGoals, MyGoal, PopularGoal } from "../../lib/goals";

function GoalCard({ goal, sessionToken }: { goal: MyGoal; sessionToken: string }) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const friends = goal.participants.map((p) => ({
    name: p.user_id.slice(0, 6),
    color: '#D9EED3',
  }));

  const freqLabel = goal.frequency_count
    ? `${goal.frequency_count}× per ${goal.frequency_unit}`
    : 'Daily';

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    await fetch(
      process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/invite-to-goal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + sessionToken,
        },
        body: JSON.stringify({ goal_id: goal.id, identifier: inviteEmail.trim() }),
      }
    );
    setInviteEmail('');
    setShowInvite(false);
  };

  return (
    <View style={styles.goalCard}>
      {/* Header row */}
      <View style={styles.goalCardTop}>
        <View style={styles.goalTitleRow}>
          <View style={styles.goalEmojiCircle}>
            <Text style={styles.goalEmoji}>🎯</Text>
          </View>
          <View>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <Text style={styles.goalFreq}>{freqLabel}</Text>
          </View>
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 {goal.streak}</Text>
        </View>
      </View>

      {/* Friends */}
      <View style={styles.friendsRow}>
        {friends.map((f) => (
          <View key={f.name} style={[styles.friendBubble, { backgroundColor: f.color }]}>
            <Text style={styles.friendInitial}>{f.name[0].toUpperCase()}</Text>
          </View>
        ))}
        <Button
          label="+ Invite"
          variant="ghost"
          size="sm"
          onPress={() => setShowInvite(!showInvite)}
        />
      </View>

      {/* Invite by email */}
      {showInvite && (
        <View style={styles.friendDropdown}>
          <TextInput
            style={styles.inviteInput}
            placeholder="Enter email or username"
            placeholderTextColor="#8A8075"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button label="Send invite" variant="primary" size="sm" onPress={handleInvite} />
        </View>
      )}

      {/* Actions */}
      <View style={styles.goalActions}>
        <Button
          label="📸  Submit proof"
          variant="primary"
          size="md"
          fullWidth
          onPress={() => router.push(`/proof-submit?goalId=${goal.id}`)}
        />
        <View style={styles.goalMeta}>
          <Pressable style={styles.metaChip}>
            <Text style={styles.metaChipText}>💬 0</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const { user, session } = useAuth();
  const [goals, setGoals] = useState<MyGoal[]>([]);
  const [popular, setPopular] = useState<PopularGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchMyGoals(user.id), fetchPopularGoals()])
      .then(([myGoals, popularGoals]) => {
        setGoals(myGoals);
        setPopular(popularGoals);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

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
          <Text style={styles.title}>My Goals</Text>
          <Button
            label="+ New"
            variant="primary"
            size="sm"
            onPress={() => router.push("/goal-create")}
          />
        </View>

        {/* Loading indicator */}
        {loading && (
          <ActivityIndicator size="large" color="#7C9473" style={{ marginTop: 40 }} />
        )}

        {/* Active goals */}
        {!loading && goals.map((g) => (
          <GoalCard key={g.id} goal={g} sessionToken={session?.access_token ?? ''} />
        ))}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Discover goals 👀</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.discoverSubtitle}>What others are working on right now</Text>

        {/* Popular 2-col grid */}
        <View style={styles.suggestedGrid}>
          {popular.map((s, i) => (
            <View key={i} style={styles.suggestedCard}>
              <Text style={styles.suggestedEmoji}>🎯</Text>
              <Text style={styles.suggestedTitle}>{s.title}</Text>
              <Text style={styles.suggestedUsers}>{s.count} people</Text>
              <Button
                label="+ Add goal"
                variant="ghost"
                size="sm"
                fullWidth
                onPress={() => {}}
                style={{ marginTop: 6 }}
              />
            </View>
          ))}
        </View>

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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#2F2F2F",
  },

  // Goal card
  goalCard: {
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 18,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    gap: 14,
  },
  goalCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  goalEmojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EDF4E8",
    alignItems: "center",
    justifyContent: "center",
  },
  goalEmoji: { fontSize: 22 },
  goalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },
  goalFreq: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    marginTop: 2,
  },
  streakBadge: {
    backgroundColor: "#FFF3E0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  streakText: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  // Progress
  progressSection: { gap: 6 },
  progressTrack: {
    flexDirection: "row",
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E8E2D9",
    overflow: "hidden",
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },

  // Friend / invite
  friendsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  friendBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  friendInitial: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },
  addFriendsBtn: {},
  addFriendsText: {},
  newBtn: {},
  newBtnText: {},

  // Invite dropdown
  friendDropdown: {
    backgroundColor: "#F0EDE8",
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  friendOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  friendOptionName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
  },
  friendAdded: {
    fontSize: 14,
    color: "#4F6F52",
    fontWeight: "700",
  },
  inviteInput: {
    backgroundColor: "#FDFAF5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
    borderWidth: 1,
    borderColor: "#DDD8D0",
  },

  // Actions
  goalActions: { gap: 10 },
  goalMeta: { flexDirection: "row", gap: 8, alignItems: "center" },
  metaChip: {
    backgroundColor: "#F0EDE8",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 28,
    marginBottom: 6,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#DDD8D0" },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#8A8075",
  },
  discoverSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    marginHorizontal: 24,
    marginBottom: 14,
  },

  // Suggested grid
  suggestedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 16,
    gap: 12,
  },
  suggestedCard: {
    width: "47%",
    backgroundColor: "#FDFAF5",
    borderRadius: 18,
    padding: 16,
    gap: 6,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  suggestedEmoji: { fontSize: 26, marginBottom: 2 },
  suggestedTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#2F2F2F",
    lineHeight: 18,
  },
  suggestedUsers: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },
});
