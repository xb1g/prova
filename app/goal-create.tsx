import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useState, useRef, useCallback } from "react";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Button from "../lib/components/Button";
import {
  gradeGoal,
  realityCheck,
  parseGoal,
  createGoal,
  nameGoal,
  SmartGradeResult,
  RealityCheckResult,
  GoalParseResult,
  NameGoalResult,
} from "../lib/ai";
import { useAuth } from "../lib/auth";

const MEASUREMENT_OPTIONS = [
  { id: "photo", label: "📷 Photo" },
  { id: "video", label: "📹 Video" },
  { id: "screenshot", label: "📸 Screenshot" },
  { id: "text", label: "📝 Text" },
  { id: "voice", label: "🎤 Voice" },
];

const SMART_DIMS = [
  { key: "specific", label: "S", full: "Specific" },
  { key: "measurable", label: "M", full: "Measurable" },
  { key: "achievable", label: "A", full: "Achievable" },
  { key: "relevant", label: "R", full: "Relevant" },
  { key: "time_bound", label: "T", full: "Time-bound" },
] as const;

export default function GoalCreateScreen() {
  const { profile } = useAuth();

  const [goalText, setGoalText] = useState("");
  const [smartGrade, setSmartGrade] = useState<SmartGradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const [parsedGoal, setParsedGoal] = useState<GoalParseResult | null>(null);
  const [parseChipDismissed, setParseChipDismissed] = useState(false);

  const [goalName, setGoalName] = useState<NameGoalResult | null>(null);
  const [namingGoal, setNamingGoal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [selectedMeasurements, setSelectedMeasurements] = useState<string[]>([]);
  const [proofDescription, setProofDescription] = useState("");

  const [realityResult, setRealityResult] = useState<RealityCheckResult | null>(null);
  const [checkingReality, setCheckingReality] = useState(false);
  const [realityDone, setRealityDone] = useState(false);
  const [realityError, setRealityError] = useState<string | null>(null);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [friendSearch, setFriendSearch] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalInputRef = useRef<TextInput>(null);
  const friendInputRef = useRef<TextInput>(null);
  const gradeRunRef = useRef(0);

  const showMeasurement = goalText.trim().length > 5;
  const showRealityCheck = selectedMeasurements.length > 0;
  const showInvite = realityDone || (smartGrade !== null && !checkingReality);

  const userProfileForGrading = profile
    ? { life_areas: profile.life_areas, direction: profile.direction, values: profile.values }
    : null;

  const runGrading = useCallback(
    async (
      text: string,
      proofTypes: string[],
      proofDesc: string,
      parsed: GoalParseResult | null
    ) => {
      if (text.trim().length < 5) return;
      const runId = ++gradeRunRef.current;
      setGrading(true);
      setGradeError(null);
      try {
        const result = await gradeGoal({
          goalText: text,
          proofTypes,
          proofDescription: proofDesc,
          userProfile: userProfileForGrading,
          parsedFrequency: parsed?.humanReadable ?? null,
        });
        if (runId !== gradeRunRef.current) return;
        setSmartGrade(result);
        // Auto-trigger reality check after grading
        if (!realityDone) {
          setRealityDone(false);
          triggerRealityCheck(text, proofTypes, parsed);
        }
      } catch (err: unknown) {
        if (runId !== gradeRunRef.current) return;
        setGradeError(err instanceof Error ? err.message : String(err));
      } finally {
        if (runId === gradeRunRef.current) {
          setGrading(false);
        }
      }
    },
    [profile]
  );

  const handleGoalBlur = useCallback(async () => {
    if (goalText.trim().length < 5) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setParseChipDismissed(false);
      // Fire parse + name + grade in parallel
      const [parseResult, nameResult] = await Promise.all([
        parseGoal(goalText).catch(() => null),
        nameGoal(goalText).catch(() => null),
        runGrading(goalText, selectedMeasurements, proofDescription, null),
      ]);
      if (nameResult) setGoalName(nameResult);
      if (parseResult) {
        setParsedGoal(parseResult);
        // Re-grade with frequency context
        if (parseResult.humanReadable) {
          await runGrading(goalText, selectedMeasurements, proofDescription, parseResult);
        }
      }
    }, 800);
  }, [goalText, selectedMeasurements, proofDescription, runGrading]);

  const handleProofChange = useCallback(
    (newTypes: string[], newDesc: string) => {
      runGrading(goalText, newTypes, newDesc, parsedGoal);
    },
    [goalText, parsedGoal, runGrading]
  );

  const toggleMeasurement = (id: string) => {
    const next = selectedMeasurements.includes(id)
      ? selectedMeasurements.filter((m) => m !== id)
      : [...selectedMeasurements, id];
    setSelectedMeasurements(next);
    handleProofChange(next, proofDescription);
  };

  const triggerRealityCheck = useCallback(async (
    text: string,
    proofTypes: string[],
    parsed: GoalParseResult | null
  ) => {
    if (checkingReality) return;
    setCheckingReality(true);
    setRealityError(null);
    try {
      const result = await realityCheck({
        goalText: text,
        proofTypes,
        parsedFrequency: parsed?.humanReadable ?? null,
      });
      setRealityResult(result);
      setRealityDone(true);
      console.log("[goal-create] reality check result:", result);
    } catch (err: unknown) {
      setRealityError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingReality(false);
    }
  }, [checkingReality]);

  const handleRealityCheck = () => triggerRealityCheck(goalText, selectedMeasurements, parsedGoal);

  const handleStartChallenge = async () => {
    setCreatingGoal(true);
    setCreateError(null);
    try {
      await createGoal({
        goalText,
        proofTypes: selectedMeasurements,
        proofDescription: proofDescription.trim(),
        smartGrade,
        parsedGoal,
        realityResult,
        shortName: goalName?.shortName ?? undefined,
        emoji: goalName?.emoji ?? undefined,
      });
      router.replace("/(tabs)/goals");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingGoal(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "#7C9473";
    if (score >= 50) return "#E6A817";
    return "#C0392B";
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>New Goal</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Goal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🎯 What's your goal?</Text>
          <View style={styles.inputCard}>
            <TextInput
              ref={goalInputRef}
              style={styles.goalInput}
              multiline
              placeholder={"I will...  (include how often, e.g. 3× a week)"}
              placeholderTextColor="#A8A098"
              value={goalText}
              onChangeText={setGoalText}
              onBlur={handleGoalBlur}
              blurOnSubmit={false}
            />
          </View>

          {/* Parse chip */}
          {parsedGoal?.humanReadable && !parseChipDismissed && (
            <View style={styles.parseChip}>
              <Text style={styles.parseChipText}>
                📅 {parsedGoal.humanReadable} · interpreted from your goal
              </Text>
              <Pressable onPress={() => setParseChipDismissed(true)}>
                <Text style={styles.parseChipDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Name chip */}
          {goalName && !editingName && (
            <Pressable style={styles.nameChip} onPress={() => {
              setEditingName(true);
              setCustomName(goalName.shortName);
              setCustomEmoji(goalName.emoji);
            }}>
              <Text style={styles.nameChipEmoji}>{goalName.emoji}</Text>
              <Text style={styles.nameChipText}>{goalName.shortName}</Text>
              <Text style={styles.nameChipEdit}>✏️</Text>
            </Pressable>
          )}
          {editingName && (
            <>
              <View style={styles.nameEditRow}>
                <Pressable onPress={() => setShowEmojiPicker((v) => !v)} style={styles.emojiPickerBtn}>
                  <Text style={{ fontSize: 28 }}>{customEmoji || goalName?.emoji || "🎯"}</Text>
                </Pressable>
                <TextInput
                  style={styles.nameEditInput}
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Short name..."
                  placeholderTextColor="#A8A098"
                  maxLength={40}
                  onSubmitEditing={() => {
                    setGoalName({ shortName: customName, emoji: customEmoji || goalName?.emoji || "🎯" });
                    setEditingName(false);
                    setShowEmojiPicker(false);
                  }}
                />
                <Pressable onPress={() => {
                  setGoalName({ shortName: customName, emoji: customEmoji || goalName?.emoji || "🎯" });
                  setEditingName(false);
                  setShowEmojiPicker(false);
                }}>
                  <Text style={styles.nameEditDone}>✓</Text>
                </Pressable>
              </View>
              {showEmojiPicker && (
                <View style={styles.emojiRow}>
                  {["🏃", "📚", "🧘", "💧", "🏋️", "🥗", "🌙", "✍️", "🎯", "💪", "🌿", "🎨"].map((em) => (
                    <Pressable key={em} onPress={() => { setCustomEmoji(em); setShowEmojiPicker(false); }}>
                      <Text style={styles.emojiOption}>{em}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {(grading || Boolean(smartGrade) || Boolean(gradeError)) && (
            <View style={styles.gradeContainer}>
              {grading ? (
                <View>
                  <View style={styles.gradeRow}>
                    <ActivityIndicator size="small" color="#111" />
                    <Text style={styles.gradingText}>Grading...</Text>
                  </View>
                  <Text style={styles.placeholderTitle}>Estimated score will appear here</Text>
                  {SMART_DIMS.map((item) => (
                    <View key={item.key} style={styles.placeholderRow}>
                      <Text style={styles.placeholderDimLabel}>{item.label}</Text>
                      <View style={styles.placeholderBar} />
                    </View>
                  ))}
                </View>
              ) : smartGrade ? (
                <View>
                  <View style={styles.overallRow}>
                    <Text style={styles.overallLabel}>SMART Score</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: scoreColor(smartGrade.score) }]}>
                      <Text style={styles.scoreText}>{smartGrade.score}%</Text>
                    </View>
                  </View>
                  {smartGrade.degraded && (
                    <Text style={styles.degradedText}>Using offline estimate while AI quota is unavailable.</Text>
                  )}
                  {SMART_DIMS.map(({ key, label, full }) => {
                    const score = smartGrade.scores?.[key] ?? 0;
                    const tip = smartGrade.tips[key];
                    return (
                      <View key={key} style={styles.dimRow}>
                        <View style={styles.dimLabelWrap}>
                          <Text style={styles.dimLetter}>{label}</Text>
                          <Text style={styles.dimFull}>{full}</Text>
                        </View>
                        <View style={styles.dimBarTrack}>
                          <View
                            style={[
                              styles.dimBarFill,
                              { width: `${score}%` as any, backgroundColor: scoreColor(score) },
                            ]}
                          />
                        </View>
                        <Text style={[styles.dimScore, { color: scoreColor(score) }]}>{score}</Text>
                        {tip && <Text style={styles.dimTip}>⚠️ {tip}</Text>}
                      </View>
                    );
                  })}

                  {/* Auto reality check — shown inside grade area */}
                  {checkingReality && (
                    <View style={styles.realityInline}>
                      <ActivityIndicator size="small" color="#7C9473" />
                      <Text style={styles.realityInlineLabel}>Checking reality...</Text>
                    </View>
                  )}
                  {realityResult && (
                    <View style={styles.realityInlineResult}>
                      <Text style={styles.realityLikelihood}>
                        {realityResult.likelihood >= 70 ? "✅" : realityResult.likelihood >= 40 ? "⚠️" : "🚨"}{" "}
                        {realityResult.likelihood}% likely to stick
                      </Text>
                      {realityResult.pitfalls.map((p, i) => (
                        <Text key={i} style={styles.pitfallText}>• {p}</Text>
                      ))}
                      {realityResult.suggestions.map((s, i) => (
                        <Text key={i} style={styles.suggestionText}>💡 {s}</Text>
                      ))}
                    </View>
                  )}
                  {realityError && <Text style={styles.errorText}>⚠️ {realityError}</Text>}
                </View>
              ) : (
                <Text style={styles.errorText}>⚠️ {gradeError}</Text>
              )}
            </View>
          )}
        </View>

        {/* Section 2: Proof type */}
        {showMeasurement && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📏 Proof type</Text>
            <View style={styles.chipRow}>
              {MEASUREMENT_OPTIONS.map((opt) => {
                const selected = selectedMeasurements.includes(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleMeasurement(opt.id)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              📝 Proof description (optional)
            </Text>
            <View style={styles.inputCard}>
              <TextInput
                style={styles.proofInput}
                multiline
                placeholder="Describe what the proof should show..."
                placeholderTextColor="#A8A098"
                value={proofDescription}
                onChangeText={(v) => {
                  setProofDescription(v);
                  handleProofChange(selectedMeasurements, v);
                }}
              />
            </View>
          </View>
        )}

        {/* Section 4: Invite */}
        {showInvite && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>👥 Invite friends</Text>
            <View style={styles.inputCard}>
              <TextInput
                ref={friendInputRef}
                style={styles.searchInput}
                placeholder="Search username..."
                placeholderTextColor="#A8A098"
                value={friendSearch}
                onChangeText={setFriendSearch}
                returnKeyType="done"
              />
            </View>
            <Button
              label="🔗 Copy invite link"
              variant="ghost"
              size="md"
              onPress={() => {}}
              style={{ alignSelf: "stretch" }}
            />
            <Text style={styles.inviteNote}>
              Friends set their own goal. Challenge starts once you both approve.
            </Text>
          </View>
        )}

        {showInvite && (
          <View style={styles.section}>
            {createError && <Text style={styles.errorText}>⚠️ {createError}</Text>}
            <Button
              label="🚀 Start Challenge"
              variant="primary"
              size="lg"
              loading={creatingGoal}
              disabled={creatingGoal}
              onPress={handleStartChallenge}
              style={{ alignSelf: "stretch" }}
            />
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3EF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#8A8075",
    width: 60,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    color: "#2F2F2F",
    letterSpacing: 0.2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#2F2F2F",
    marginBottom: 10,
  },
  inputCard: {
    backgroundColor: "#FDFAF5",
    borderRadius: 16,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  goalInput: {
    padding: 16,
    minHeight: 80,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
  },
  parseChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D9EED3",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
    gap: 8,
  },
  parseChipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#4F6F52",
  },
  parseChipDismiss: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#8A8075",
  },
  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  gradingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },
  gradeContainer: {
    marginTop: 12,
    backgroundColor: "#FDFAF5",
    borderRadius: 16,
    padding: 14,
    minHeight: 140,
    gap: 10,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  placeholderTitle: {
    fontSize: 14,
    color: "#8A8075",
    marginBottom: 8,
    fontFamily: "Inter_400Regular",
  },
  placeholderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  placeholderDimLabel: {
    width: 18,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#8A8075",
  },
  placeholderBar: {
    flex: 1,
    height: 8,
    borderRadius: 3,
    backgroundColor: "#E8E2D9",
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  degradedText: {
    fontSize: 12,
    color: "#8A8075",
    marginBottom: 6,
    fontFamily: "Inter_400Regular",
  },
  overallLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#2F2F2F",
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  scoreText: {
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#FDFAF5",
  },
  dimRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  dimLabelWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    width: 90,
  },
  dimLetter: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },
  dimFull: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
  },
  dimBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#E8E2D9",
    borderRadius: 3,
    overflow: "hidden",
  },
  dimBarFill: {
    height: 6,
    borderRadius: 3,
  },
  dimScore: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    width: 28,
    textAlign: "right",
  },
  dimTip: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    width: "100%",
    paddingLeft: 98,
    lineHeight: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  chipSelected: { backgroundColor: "#2F2F2F" },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium", fontWeight: "500", color: "#2F2F2F" },
  chipTextSelected: { color: "#FDFAF5" },
  proofInput: {
    padding: 14,
    minHeight: 60,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
  },
  realityBtn: {},
  realityBtnDisabled: {},
  realityBtnText: {},
  realityResult: {
    marginTop: 16,
    backgroundColor: "#FDFAF5",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  likelihoodText: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#2F2F2F",
  },
  pitfallText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    lineHeight: 18,
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
    lineHeight: 18,
  },
  searchInput: {
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
  },
  shareBtn: {},
  shareBtnText: {},
  inviteNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
  startBtn: {},
  startBtnDisabled: {},
  startBtnText: {},
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#C0392B",
    marginTop: 8,
  },
  nameChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
    gap: 8,
    alignSelf: "flex-start",
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  nameChipEmoji: { fontSize: 20 },
  nameChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600", color: "#2F2F2F" },
  nameChipEdit: { fontSize: 12, color: "#8A8075" },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDFAF5",
    borderRadius: 16,
    padding: 10,
    marginTop: 10,
    gap: 8,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  emojiPickerBtn: { padding: 4 },
  nameEditInput: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: "#2F2F2F" },
  nameEditDone: { fontSize: 20, color: "#7C9473", fontWeight: "700" },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  emojiOption: { fontSize: 28, padding: 4 },
  realityInline: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 },
  realityInlineLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8A8075" },
  realityInlineResult: { paddingTop: 10, gap: 6 },
  realityLikelihood: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#2F2F2F" },
});
