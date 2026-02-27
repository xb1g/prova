import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import {
  onboardingChat,
  OnboardingChatHistoryItem,
  ExtractedProfile,
} from "../lib/ai";

type DisplayMessage = {
  role: "app" | "user";
  text: string;
};

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();

  // Display messages (what the user sees)
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  // API history (role: "user"|"model") — mirrors messages minus loading states
  const [history, setHistory] = useState<OnboardingChatHistoryItem[]>([]);

  const [isTyping, setIsTyping] = useState(true); // true on mount while AI opens
  const [inputText, setInputText] = useState("");

  // Summary phase
  const [screenPhase, setScreenPhase] = useState<"chat" | "summary">("chat");
  const [extracted, setExtracted] = useState<ExtractedProfile | null>(null);
  const [editField, setEditField] = useState<keyof ExtractedProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // On mount: get AI's opening message
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await onboardingChat([], "");
        if (cancelled) return;
        if (response.type === "message") {
          setMessages([{ role: "app", text: response.text }]);
          setHistory([{ role: "model", text: response.text }]);
        }
      } catch (err) {
        console.error("[onboarding-chat open]", err);
        if (!cancelled) {
          setMessages([{ role: "app", text: "Hey! Let's get you set up. What areas of your life do you most want to work on right now?" }]);
        }
      } finally {
        if (!cancelled) {
          setIsTyping(false);
          setTimeout(() => inputRef.current?.focus(), 150);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-focus after AI responds
  useEffect(() => {
    if (!isTyping && screenPhase === "chat") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isTyping]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText("");

    // Optimistically show user message in chat
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsTyping(true);

    // Pass history WITHOUT current message — edge function receives it separately as `message`
    try {
      const response = await onboardingChat(history, text);

      if (response.type === "message") {
        setMessages((prev) => [...prev, { role: "app", text: response.text }]);
        // Now append both user + model turns to history
        setHistory((prev) => [
          ...prev,
          { role: "user", text },
          { role: "model", text: response.text },
        ]);
        setIsTyping(false);
      } else if (response.type === "done") {
        // Show farewell, then switch to summary
        setMessages((prev) => [...prev, { role: "app", text: response.text }]);
        setIsTyping(false);
        // Brief pause so user can read the farewell
        await new Promise<void>((r) => setTimeout(r, 1200));
        setExtracted(response.profile);
        setScreenPhase("summary");
      }
    } catch (err) {
      console.error("[onboarding-chat send]", err);
      setMessages((prev) => [
        ...prev,
        { role: "app", text: "Sorry, something went wrong. Try again?" },
      ]);
      // Don't update history — keep it clean for a retry
      setIsTyping(false);
    }
  };

  const handleSave = async () => {
    if (!extracted || !user) return;
    setSaving(true);
    try {
      await supabase.from("user_profiles").upsert(
        {
          user_id: user.id,
          onboarding_done: true,
          life_areas: extracted.lifeAreas,
          direction: extracted.direction,
          values: extracted.values,
          blockers: extracted.blockers,
          weekly_hours: extracted.weeklyHours,
        },
        { onConflict: "user_id" }
      );
      await refreshProfile();
      router.replace("/(tabs)/goals");
    } catch (err) {
      console.error("[onboarding save error]", err);
    } finally {
      setSaving(false);
    }
  };

  // Summary refinement
  const [refineText, setRefineText] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const refineInputRef = useRef<TextInput>(null);

  const handleRefine = async () => {
    const text = refineText.trim();
    if (!text || isRefining) return;
    setRefineText("");
    setIsRefining(true);
    try {
      const response = await onboardingChat(history, text);
      // Update history with this exchange
      setHistory((prev) => [
        ...prev,
        { role: "user", text },
        { role: "model", text: response.type === "done" ? response.text : response.text },
      ]);
      if (response.type === "done" && response.profile) {
        setExtracted(response.profile);
      } else if (response.type === "message") {
        // AI asked a follow-up — just update extracted if we can, keep on summary
        // Re-extract silently with updated context
      }
    } catch (err) {
      console.error("[refine error]", err);
    } finally {
      setIsRefining(false);
      setTimeout(() => refineInputRef.current?.focus(), 100);
    }
  };


  if (screenPhase === "summary" && extracted) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <StatusBar style="dark" />

        {/* Push card toward the bottom */}
        <View style={styles.summaryOuter}>
          <View style={styles.summaryInner}>
            <Text style={styles.summaryTitle}>Here's what I got</Text>
            <Text style={styles.summarySubtitle}>Tap any field to edit</Text>

            <View style={styles.summaryCard}>
              <SummaryRow
                icon="🎯"
                label="Focus areas"
                value={extracted.lifeAreas.join(" · ")}
                editing={editField === "lifeAreas"}
                onTap={() => setEditField(editField === "lifeAreas" ? null : "lifeAreas")}
                onChangeText={(v) =>
                  setExtracted({
                    ...extracted,
                    lifeAreas: v.split("·").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
              <SummaryRow
                icon="✨"
                label="Direction"
                value={extracted.direction}
                editing={editField === "direction"}
                onTap={() => setEditField(editField === "direction" ? null : "direction")}
                onChangeText={(v) => setExtracted({ ...extracted, direction: v })}
              />
              <SummaryRow
                icon="💡"
                label="Values"
                value={extracted.values}
                editing={editField === "values"}
                onTap={() => setEditField(editField === "values" ? null : "values")}
                onChangeText={(v) => setExtracted({ ...extracted, values: v })}
              />
              <SummaryRow
                icon="⚡"
                label="Blockers"
                value={extracted.blockers}
                editing={editField === "blockers"}
                onTap={() => setEditField(editField === "blockers" ? null : "blockers")}
                onChangeText={(v) => setExtracted({ ...extracted, blockers: v })}
              />
              <SummaryRow
                icon="⏱"
                label="Weekly time"
                value={`~${extracted.weeklyHours} hrs / week`}
                editing={editField === "weeklyHours"}
                onTap={() => setEditField(editField === "weeklyHours" ? null : "weeklyHours")}
                onChangeText={(v) => {
                  const n = parseInt(v);
                  if (!isNaN(n)) setExtracted({ ...extracted, weeklyHours: n });
                }}
                inputProps={{ keyboardType: "number-pad" }}
              />
            </View>

            {/* Confirm button */}
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#111" />
              ) : (
                <Text style={styles.saveBtnText}>Looks good →</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Refine input at bottom */}
        <View style={styles.inputRow}>
          <TextInput
            ref={refineInputRef}
            style={styles.chatInput}
            placeholder="Add more detail…"
            placeholderTextColor="#999"
            value={refineText}
            onChangeText={setRefineText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleRefine}
            blurOnSubmit={false}
            editable={!isRefining}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!refineText.trim() || isRefining) && styles.sendBtnDisabled,
            ]}
            onPress={handleRefine}
            disabled={!refineText.trim() || isRefining}
          >
            {isRefining ? (
              <ActivityIndicator size="small" color="#BFFF00" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─── Chat screen ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: 60 }]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              msg.role === "user" ? styles.bubbleUser : styles.bubbleApp,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                msg.role === "user" ? styles.bubbleTextUser : styles.bubbleTextApp,
              ]}
            >
              {msg.text}
            </Text>
          </View>
        ))}

        {isTyping && (
          <View style={[styles.bubble, styles.bubbleApp]}>
            <TypingDots />
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.chatInput}
          placeholder="Type here…"
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!isTyping}
        />
        <Pressable
          style={[
            styles.sendBtn,
            (!inputText.trim() || isTyping) && styles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || isTyping}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % 3), 400);
    return () => clearInterval(timer);
  }, []);
  const dots = ["•  ", "•• ", "•••"][frame];
  return (
    <Text
      style={{
        fontSize: 16,
        color: "#999",
        letterSpacing: 4,
        fontFamily: "Orbit_400Regular",
      }}
    >
      {dots}
    </Text>
  );
}

// ─── Summary row ──────────────────────────────────────────────────────────────
function SummaryRow({
  icon,
  label,
  value,
  editing,
  onTap,
  onChangeText,
  inputProps,
}: {
  icon: string;
  label: string;
  value: string;
  editing: boolean;
  onTap: () => void;
  onChangeText: (v: string) => void;
  inputProps?: object;
}) {
  return (
    <Pressable style={styles.summaryRow} onPress={onTap}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>{label}</Text>
        {editing ? (
          <TextInput
            style={styles.summaryEditInput}
            value={value}
            onChangeText={onChangeText}
            autoFocus
            multiline
            {...inputProps}
          />
        ) : (
          <Text style={styles.summaryValue}>{value}</Text>
        )}
      </View>
      <Text style={styles.editHint}>{editing ? "✓" : "›"}</Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFFF5" },
  // Summary layout — pushes content to the bottom half
  summaryOuter: {
    flex: 1,
    justifyContent: "flex-end",
  },
  summaryInner: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  bubble: {
    maxWidth: "85%",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  bubbleApp: {
    backgroundColor: "#FFF",
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleUser: {
    backgroundColor: "#111",
    alignSelf: "flex-end",
  },
  bubbleText: {
    fontSize: 14,
    fontFamily: "Orbit_400Regular",
    lineHeight: 20,
  },
  bubbleTextApp: { color: "#111" },
  bubbleTextUser: { color: "#BFFF00" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    backgroundColor: "#FDFFF5",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Orbit_400Regular",
    color: "#111",
    maxHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: {
    fontSize: 18,
    color: "#BFFF00",
    fontFamily: "Orbit_400Regular",
  },
  // Summary
  summaryTitle: {
    fontSize: 26,
    fontFamily: "Orbit_400Regular",
    fontWeight: "600",
    color: "#111",
    marginTop: 40,
    marginBottom: 6,
  },
  summarySubtitle: {
    fontSize: 13,
    fontFamily: "Orbit_400Regular",
    color: "#666",
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
    gap: 12,
  },
  summaryIcon: { fontSize: 18, marginTop: 2 },
  summaryContent: { flex: 1 },
  summaryLabel: {
    fontSize: 10,
    fontFamily: "Orbit_400Regular",
    color: "#999",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Orbit_400Regular",
    color: "#111",
    lineHeight: 20,
  },
  summaryEditInput: {
    fontSize: 14,
    fontFamily: "Orbit_400Regular",
    color: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#BFFF00",
    paddingVertical: 2,
  },
  editHint: {
    fontSize: 18,
    color: "#CCC",
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: "#BFFF00",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Orbit_400Regular",
    fontWeight: "600",
    color: "#111",
    letterSpacing: 0.5,
  },
});
