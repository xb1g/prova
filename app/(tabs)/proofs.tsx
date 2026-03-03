import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fetchGoalProofs, GoalProof } from "../../lib/goals";
import { voteOnProof, addReaction, addComment, fetchComments, Comment } from "../../lib/proofs";

type FeedFilter = "all" | "myGoals" | "friends";

type ProofItem = GoalProof & {
  reactionSummary: Record<string, number>;
  isOwnGoal: boolean;
};

type FullImageState = { uri: string } | null;

const PICKER_EMOJIS = ["🔥", "💪", "✨", "❤️", "👏"];

function animateSoftly() {
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

function formatTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function fetchReactionSummary(proofId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("proof_reactions")
    .select("emoji")
    .eq("proof_id", proofId);
  const summary: Record<string, number> = {};
  (data ?? []).forEach((r: { emoji: string }) => {
    summary[r.emoji] = (summary[r.emoji] ?? 0) + 1;
  });
  return summary;
}

async function loadAllProofs(userId: string): Promise<ProofItem[]> {
  const { data: ownedGoals } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId);

  const { data: participations } = await supabase
    .from("challenge_participants")
    .select("challenge_id, challenges(creator_goal_id)")
    .eq("user_id", userId);

  const ownedIds = new Set<string>((ownedGoals ?? []).map((g: { id: string }) => g.id));
  const allGoalIds = new Set<string>(ownedIds);
  (participations ?? []).forEach((p: { challenges: { creator_goal_id: string } | null }) => {
    const gid = p.challenges?.creator_goal_id;
    if (gid) allGoalIds.add(gid);
  });

  if (allGoalIds.size === 0) return [];

  const proofArrays = await Promise.all([...allGoalIds].map((gid) => fetchGoalProofs(gid)));

  const flat: GoalProof[] = proofArrays
    .flat()
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return Promise.all(
    flat.map(async (proof) => ({
      ...proof,
      reactionSummary: await fetchReactionSummary(proof.id),
      isOwnGoal: ownedIds.has(proof.goal_id),
    }))
  );
}

type ProofCardProps = {
  proof: ProofItem;
  currentUserId: string;
  accessToken: string;
  onVoteDone: () => void;
  onOpenEmojiPicker: (proofId: string) => void;
  onOpenFullImage: (state: FullImageState) => void;
  onReactionAdded: (proofId: string, emoji: string) => void;
};

function ProofCard({
  proof,
  currentUserId,
  accessToken,
  onVoteDone,
  onOpenEmojiPicker,
  onOpenFullImage,
  onReactionAdded,
}: ProofCardProps) {
  const [voting, setVoting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageRetryTick, setImageRetryTick] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const statusColor =
    proof.status === "approved" ? "#4A7E5A" : proof.status === "disputed" ? "#C0392B" : "#D97706";
  const statusBg =
    proof.status === "approved" ? "#E6F4EB" : proof.status === "disputed" ? "#FDECEA" : "#FEF3C7";
  const statusLabel =
    proof.status === "approved" ? "Approved" : proof.status === "disputed" ? "Disputed" : "Pending";

  const handleVote = async (vote: "approve" | "dispute") => {
    if (voting) return;
    setVoting(true);
    try {
      await voteOnProof(proof.id, vote, accessToken);
      onVoteDone();
    } catch {
      // no-op
    } finally {
      setVoting(false);
    }
  };

  const toggleComments = async () => {
    animateSoftly();
    if (!commentsOpen && comments.length === 0) {
      setCommentsLoading(true);
      try {
        setComments(await fetchComments(proof.id));
      } finally {
        setCommentsLoading(false);
      }
    }
    setCommentsOpen((prev) => !prev);
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await addComment(proof.id, commentText.trim());
      setComments(await fetchComments(proof.id));
      setCommentText("");
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <View style={styles.postCard} accessible accessibilityLabel="proof card">
      <View style={styles.postHeader}>
        <View style={styles.profileRow}>
          <View style={styles.profilePlaceholder}>
            <Text style={styles.profilePlaceholderText}>
              {proof.user_id.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>
            {proof.user_id === currentUserId ? "You" : proof.user_id.slice(0, 8) + "…"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.timestamp}>{formatTime(proof.submitted_at)}</Text>
        </View>
      </View>

      {proof.media_url ? (
        imageError ? (
          <View style={styles.imageErrorState} accessibilityLabel="Failed to load image">
            <Text style={styles.imageErrorTitle}>Couldn&apos;t load proof photo</Text>
            <Pressable
              onPress={() => { setImageError(false); setImageRetryTick((t) => t + 1); }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => onOpenFullImage({ uri: proof.media_url! })}
            style={({ pressed }) => [styles.photoWrapper, pressed && styles.mediaPressed]}
            accessibilityRole="button"
          >
            <Image
              key={`${proof.id}-${imageRetryTick}`}
              source={{ uri: proof.media_url }}
              onError={() => setImageError(true)}
              style={styles.proofImage}
            />
          </Pressable>
        )
      ) : (
        <View style={styles.mediaPlaceholder}>
          <Text style={styles.mediaPlaceholderText}>No media</Text>
        </View>
      )}

      {proof.streak_period ? (
        <View style={styles.goalPill}>
          <Text style={styles.goalPillText}>📅 {proof.streak_period}</Text>
        </View>
      ) : null}

      {!!proof.caption && <Text style={styles.caption}>{proof.caption}</Text>}

      {proof.status === "pending" && (
        <View style={styles.voteRow}>
          <Pressable
            onPress={() => handleVote("approve")}
            disabled={voting}
            style={({ pressed }) => [styles.voteButton, styles.voteApprove, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Approve proof"
          >
            <Text style={styles.voteButtonText}>✅ Approve</Text>
          </Pressable>
          <Pressable
            onPress={() => handleVote("dispute")}
            disabled={voting}
            style={({ pressed }) => [styles.voteButton, styles.voteDispute, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Dispute proof"
          >
            <Text style={[styles.voteButtonText, styles.voteDisputeText]}>❌ Dispute</Text>
          </Pressable>
        </View>
      )}

      {(proof.vote_summary.approve > 0 || proof.vote_summary.dispute > 0) && (
        <View style={styles.voteSummaryRow}>
          {proof.vote_summary.approve > 0 && (
            <Text style={styles.voteSummaryText}>✅ {proof.vote_summary.approve}</Text>
          )}
          {proof.vote_summary.dispute > 0 && (
            <Text style={[styles.voteSummaryText, { color: "#C0392B" }]}>
              ❌ {proof.vote_summary.dispute}
            </Text>
          )}
        </View>
      )}

      <View style={styles.reactionArea}>
        <View style={styles.reactionRow}>
          {PICKER_EMOJIS.map((emoji) => {
            const count = proof.reactionSummary[emoji] ?? 0;
            return count > 0 ? (
              <View key={`${proof.id}-${emoji}`} style={styles.reactionChip}>
                <Text style={styles.reactionChipText}>{emoji} {count}</Text>
              </View>
            ) : null;
          })}
          <Pressable
            onPress={() => onOpenEmojiPicker(proof.id)}
            style={({ pressed }) => [styles.plusChip, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add reaction"
          >
            <Text style={styles.plusChipText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={toggleComments}
        style={({ pressed }) => [styles.commentsToggle, pressed && styles.buttonPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.commentsToggleText}>
          {commentsOpen
            ? "Hide comments"
            : `💬 ${proof.comment_count} comment${proof.comment_count !== 1 ? "s" : ""}`}
        </Text>
      </Pressable>

      {commentsOpen && (
        <View style={styles.commentsSection}>
          {commentsLoading ? (
            <Text style={styles.commentsLoadingText}>Loading…</Text>
          ) : comments.length === 0 ? (
            <Text style={styles.commentsEmptyText}>No comments yet</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentItem}>
                <Text style={styles.commentUserId}>
                  {c.user_id === currentUserId ? "You" : c.user_id.slice(0, 8) + "…"}
                </Text>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            ))
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment…"
              placeholderTextColor="#8F9E90"
              returnKeyType="send"
              onSubmitEditing={handleAddComment}
              editable={!submittingComment}
            />
            <Pressable
              onPress={handleAddComment}
              disabled={submittingComment || !commentText.trim()}
              style={({ pressed }) => [styles.commentSendButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              <Text style={styles.commentSendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.postCard}>
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonLineLong} />
        <View style={styles.skeletonLineShort} />
      </View>
      <View style={styles.skeletonImage} />
      <View style={styles.skeletonPill} />
      <View style={styles.skeletonLineLong} />
      <View style={styles.skeletonLineMid} />
    </View>
  );
}

export default function ProofsScreen() {
  const insets = useSafeAreaInsets();
  const { session, user, loading: authLoading } = useAuth();
  const feedEntrance = useRef(new Animated.Value(0)).current;

  const [proofs, setProofs] = useState<ProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [showFilters, setShowFilters] = useState(true);
  const [fullImage, setFullImage] = useState<FullImageState>(null);
  const [emojiPickerProofId, setEmojiPickerProofId] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const fetchProofs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const items = await loadAllProofs(user.id);
      animateSoftly();
      setProofs(items);
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    fetchProofs();
  }, [authLoading, fetchProofs]);

  useEffect(() => {
    if (loading) return;
    Animated.spring(feedEntrance, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 5,
    }).start();
  }, [feedEntrance, loading]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProofs();
    setRefreshing(false);
  };

  const handleReactionAdded = async (proofId: string, emoji: string) => {
    try {
      await addReaction(proofId, emoji);
      setProofs((prev) =>
        prev.map((p) =>
          p.id === proofId
            ? {
                ...p,
                reactionSummary: {
                  ...p.reactionSummary,
                  [emoji]: (p.reactionSummary[emoji] ?? 0) + 1,
                },
              }
            : p
        )
      );
    } catch {
      // no-op
    }
    setEmojiPickerProofId(null);
  };

  const visibleProofs = (() => {
    if (activeFilter === "myGoals") return proofs.filter((p) => p.isOwnGoal);
    if (activeFilter === "friends") return proofs.filter((p) => !p.isOwnGoal);
    return proofs;
  })();

  const animatedFeedStyle = {
    opacity: feedEntrance,
    transform: [
      {
        translateY: feedEntrance.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.appTitle}>Prova</Text>
            <Text style={styles.feedTitle}>Feed</Text>
          </View>

          <Pressable
            onPress={() => setShowFilters((prev) => !prev)}
            style={({ pressed }) => [styles.filterToggle, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Toggle feed filters"
          >
            <Text style={styles.filterToggleIcon}>☷</Text>
          </Pressable>
        </View>

        {showFilters ? (
          <View style={styles.filterRow}>
            {[
              { key: "all" as const, label: "All" },
              { key: "myGoals" as const, label: "My goals" },
              { key: "friends" as const, label: "Friends" },
            ].map((filter) => {
              const selected = activeFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setActiveFilter(filter.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${filter.label} posts`}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {loading ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(item) => `skeleton-${item}`}
          renderItem={() => <SkeletonCard />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 130, paddingTop: 8 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <Animated.View style={[styles.feedWrap, animatedFeedStyle]}>
          <FlatList
            data={visibleProofs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ProofCard
                proof={item}
                currentUserId={user?.id ?? ""}
                accessToken={session?.access_token ?? ""}
                onVoteDone={fetchProofs}
                onOpenEmojiPicker={setEmojiPickerProofId}
                onOpenFullImage={setFullImage}
                onReactionAdded={handleReactionAdded}
              />
            )}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 130, paddingTop: 8 },
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No proof yet.</Text>
                <Text style={styles.emptyBody}>
                  Start a goal and post your first check-in.
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </Animated.View>
      )}

      <Modal
        visible={!!emojiPickerProofId}
        transparent
        animationType="slide"
        onRequestClose={() => setEmojiPickerProofId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEmojiPickerProofId(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>React with emoji</Text>
            <View style={styles.pickerRow}>
              {PICKER_EMOJIS.map((emoji) => (
                <Pressable
                  key={`picker-${emoji}`}
                  onPress={() => {
                    if (!emojiPickerProofId) return;
                    handleReactionAdded(emojiPickerProofId, emoji);
                  }}
                  style={({ pressed }) => [styles.pickerEmojiButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                >
                  <Text style={styles.pickerEmojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!fullImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullImage(null)}
      >
        <Pressable style={styles.fullImageBackdrop} onPress={() => setFullImage(null)}>
          {fullImage ? (
            <View style={styles.fullImageWrap}>
              <Image
                source={{ uri: fullImage.uri }}
                style={styles.fullImage}
                resizeMode="contain"
              />
              <Text style={styles.fullImageHint}>Tap anywhere to close</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2EFE5",
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appTitle: {
    fontSize: 14,
    lineHeight: 18,
    color: "#5B6C5A",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    letterSpacing: -0.05,
  },
  feedTitle: {
    marginTop: 2,
    fontSize: 32,
    lineHeight: 36,
    color: "#202922",
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  filterToggle: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#CFD8C8",
    backgroundColor: "#FBF9F2",
    alignItems: "center",
    justifyContent: "center",
  },
  filterToggleIcon: {
    fontSize: 16,
    color: "#4E5F4E",
    marginTop: 1,
  },
  filterRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: "#FAF8F1",
    borderWidth: 1,
    borderColor: "#DBE3D5",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipSelected: {
    backgroundColor: "#E2EBD9",
    borderColor: "#A9B99F",
  },
  filterChipText: {
    fontSize: 14,
    color: "#48584A",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  filterChipTextSelected: {
    color: "#2C3A2D",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  feedWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  postCard: {
    backgroundColor: "#FBF9F2",
    borderRadius: 24,
    padding: 12,
    shadowColor: "#334438",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profilePlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#D4E2CC",
    alignItems: "center",
    justifyContent: "center",
  },
  profilePlaceholderText: {
    fontSize: 12,
    color: "#3A5040",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  displayName: {
    fontSize: 15,
    color: "#243125",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 13,
    color: "#6E7E6F",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  photoWrapper: {
    borderRadius: 18,
    overflow: "hidden",
  },
  mediaPressed: {
    opacity: 0.9,
  },
  proofImage: {
    width: "100%",
    height: 270,
    borderRadius: 18,
    backgroundColor: "#E7EBE0",
  },
  mediaPlaceholder: {
    height: 100,
    borderRadius: 18,
    backgroundColor: "#E3ECDC",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPlaceholderText: {
    fontSize: 13,
    color: "#6E7E6F",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  imageErrorState: {
    height: 230,
    borderRadius: 18,
    backgroundColor: "#E8E6DE",
    borderWidth: 1,
    borderColor: "#CFCCC2",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  imageErrorTitle: {
    fontSize: 14,
    color: "#5E675F",
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  retryButton: {
    minHeight: 44,
    minWidth: 84,
    borderRadius: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#A6B59B",
    backgroundColor: "#F7F5EE",
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    fontSize: 14,
    color: "#2E3E30",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  goalPill: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: "#E3ECDC",
    borderWidth: 1,
    borderColor: "#C7D5BE",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goalPillText: {
    fontSize: 13,
    color: "#38523C",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  caption: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    color: "#2A332B",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  voteRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  voteButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  voteApprove: {
    backgroundColor: "#E6F4EB",
    borderColor: "#9DCBA8",
  },
  voteDispute: {
    backgroundColor: "#FDECEA",
    borderColor: "#E8A8A3",
  },
  voteButtonText: {
    fontSize: 14,
    color: "#2E5433",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  voteDisputeText: {
    color: "#7D1F1A",
  },
  voteSummaryRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
  },
  voteSummaryText: {
    fontSize: 13,
    color: "#4A7E5A",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  reactionArea: {
    marginTop: 12,
    gap: 8,
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  reactionChip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#D2DBC8",
    backgroundColor: "#F8F6EF",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionChipText: {
    fontSize: 15,
    color: "#334133",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  plusChip: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D2DBC8",
    backgroundColor: "#F8F6EF",
    alignItems: "center",
    justifyContent: "center",
  },
  plusChipText: {
    fontSize: 22,
    color: "#465A47",
    lineHeight: 24,
  },
  commentsToggle: {
    marginTop: 10,
    paddingVertical: 6,
  },
  commentsToggleText: {
    fontSize: 13,
    color: "#5B6C5A",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  commentsSection: {
    marginTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5EBE0",
    paddingTop: 10,
  },
  commentsLoadingText: {
    fontSize: 13,
    color: "#8F9E90",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  commentsEmptyText: {
    fontSize: 13,
    color: "#8F9E90",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontStyle: "italic",
  },
  commentItem: {
    gap: 2,
  },
  commentUserId: {
    fontSize: 12,
    color: "#4E5F4E",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  commentBody: {
    fontSize: 13,
    color: "#2A332B",
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  commentInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F0F5EC",
    borderWidth: 1,
    borderColor: "#C7D5BE",
    fontSize: 13,
    color: "#2A332B",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  commentSendButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: "#7A8F74",
    alignItems: "center",
    justifyContent: "center",
  },
  commentSendText: {
    fontSize: 13,
    color: "#F5F7F2",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  emptyState: {
    borderRadius: 20,
    paddingHorizontal: 26,
    paddingVertical: 30,
    marginTop: 24,
    backgroundColor: "#F9F7EF",
    borderWidth: 1,
    borderColor: "#DCE4D2",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    color: "#2E3A2F",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: "#5A695B",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,20,15,0.28)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FBF9F2",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    gap: 14,
  },
  sheetTitle: {
    fontSize: 18,
    color: "#243225",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  pickerEmojiButton: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#D2DBC8",
    backgroundColor: "#F8F6EF",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmojiText: {
    fontSize: 24,
  },
  fullImageBackdrop: {
    flex: 1,
    backgroundColor: "rgba(6,10,8,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  fullImageWrap: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  fullImage: {
    width: "100%",
    height: "80%",
    borderRadius: 16,
  },
  fullImageHint: {
    fontSize: 13,
    color: "#E5EBDF",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  skeletonAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E3E8DC",
  },
  skeletonLineLong: {
    flex: 1,
    maxWidth: 130,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7EBE0",
  },
  skeletonLineShort: {
    width: 30,
    height: 10,
    borderRadius: 5,
    marginLeft: "auto",
    backgroundColor: "#E7EBE0",
  },
  skeletonImage: {
    width: "100%",
    height: 250,
    borderRadius: 18,
    backgroundColor: "#E7EBE0",
    marginBottom: 12,
  },
  skeletonPill: {
    width: 130,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E7EBE0",
    marginBottom: 10,
  },
  skeletonLineMid: {
    width: "72%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7EBE0",
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
