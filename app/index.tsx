import { useState, useRef, useEffect } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Button from "../lib/components/Button";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../lib/auth";

const TAGLINES = ["Set goals.", "Show proof.", "Call BS."];

const PREVIEW_CARDS = [
  {
    emoji: "🏃",
    name: "Maya",
    goal: "Run 5km · day 12",
    reactions: "🔥🔥💪",
    color: "#D9EED3",
  },
  {
    emoji: "🧘",
    name: "Alex",
    goal: "Morning meditation",
    approved: "✓ James approved",
    color: "#C4B5D6",
  },
  {
    emoji: "📚",
    name: "Sarah",
    goal: "Read 30 mins",
    reactions: "✨📖",
    color: "#F5E6C8",
  },
];

export default function Page() {
  const { signInWithGoogle, loading: authLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const lineAnims = useRef(
    TAGLINES.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(18),
    })),
  ).current;
  const lineActiveAnims = useRef(
    TAGLINES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;
  const btnActiveAnim = useRef(new Animated.Value(0)).current;
  const [activeIdx, setActiveIdx] = useState(0);
  const activeIdxRef = useRef(0);
  const cycleRef = useRef<NodeJS.Timeout | null>(null);
  // 0–2 = taglines, 3 = button
  const TOTAL_STEPS = TAGLINES.length + 1;

  useEffect(() => {
    const entrance = lineAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 500,
          delay: i * 180,
          useNativeDriver: true,
        }),
        Animated.timing(anim.translateY, {
          toValue: 0,
          duration: 500,
          delay: i * 180,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.stagger(0, entrance).start();

    const startDelay = setTimeout(() => {
      const cycle = () => {
        const cur = activeIdxRef.current;
        const next = (cur + 1) % TOTAL_STEPS;

        const outAnim =
          cur < TAGLINES.length
            ? Animated.timing(lineActiveAnims[cur], { toValue: 0, duration: 300, useNativeDriver: false })
            : Animated.timing(btnActiveAnim, { toValue: 0, duration: 300, useNativeDriver: true });

        const inAnim =
          next < TAGLINES.length
            ? Animated.timing(lineActiveAnims[next], { toValue: 1, duration: 300, useNativeDriver: false })
            : Animated.timing(btnActiveAnim, { toValue: 1, duration: 300, useNativeDriver: true });

        Animated.parallel([outAnim, inAnim]).start(() => {
          activeIdxRef.current = next;
          setActiveIdx(next);
        });
      };
      cycleRef.current = setInterval(cycle, 1400);
    }, 1200);

    return () => clearTimeout(startDelay);
  }, []);

  useEffect(() => {
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, []);

  useEffect(() => {
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ]),
    );
    glowLoopRef.current.start();
    return () => glowLoopRef.current?.stop();
  }, [glowAnim]);

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#7C9473", "#4F6F52"],
  });

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.logo}>prova</Text>
      </View>

      <View style={styles.hero}>
        {TAGLINES.map((line, i) => {
          const fontSize = lineActiveAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [33, 48],
          });
          const highlightOpacity = lineActiveAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          });
          const textOpacity = lineActiveAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          });
          return (
            <Animated.View
              key={line}
              style={{
                opacity: lineAnims[i].opacity,
                transform: [{ translateY: lineAnims[i].translateY }],
                marginBottom: 2,
                alignSelf: "flex-start",
              }}
            >
              <Animated.View
                style={{
                  position: "absolute",
                  borderRadius: 10,
                  backgroundColor: "#B5C9AB",
                  opacity: highlightOpacity,
                  top: 2,
                  bottom: 2,
                  left: -6,
                  right: -6,
                }}
              />
              <Animated.Text
                style={[
                  styles.tagline,
                  {
                    fontSize,
                    opacity: textOpacity,
                    fontWeight: activeIdx === i ? "800" : "500",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  },
                ]}
              >
                {line}
              </Animated.Text>
            </Animated.View>
          );
        })}

        <Animated.View style={{
          alignSelf: "flex-start",
          marginTop: 28,
          marginBottom: 14,
          transform: [{
            scale: btnActiveAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }),
          }],
          opacity: btnActiveAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        }}>
          <Button
            label="Get started"
            variant="primary"
            size="md"
            loading={signingIn || authLoading}
            disabled={signingIn || authLoading}
            onPress={async () => {
              setSigningIn(true);
              try {
                await signInWithGoogle();
              } catch (e) {
                console.error(e);
              } finally {
                setSigningIn(false);
              }
            }}
          />
        </Animated.View>

        <View style={styles.accountabilityRow}>
          <Text style={styles.accountabilityText}>
            Accountability that actually feels good
          </Text>
          <Animated.View
            style={[styles.accountabilityLine, { backgroundColor: glowColor }]}
          />
        </View>
      </View>

      {/* Preview cards */}
      <View style={styles.stage}>
        {/* Left card */}
        <View style={[styles.previewCard, styles.previewCardLeft]}>
          <View
            style={[
              styles.previewEmojiCircle,
              { backgroundColor: PREVIEW_CARDS[0].color },
            ]}
          >
            <Text style={styles.previewEmoji}>{PREVIEW_CARDS[0].emoji}</Text>
          </View>
          <View style={styles.previewCardBody}>
            <Text style={styles.previewName}>{PREVIEW_CARDS[0].name}</Text>
            <Text style={styles.previewGoal}>{PREVIEW_CARDS[0].goal}</Text>
            <Text style={styles.previewReactions}>
              {PREVIEW_CARDS[0].reactions}
            </Text>
          </View>
        </View>
        {/* Center card */}
        <View style={[styles.previewCard, styles.previewCardCenter]}>
          <View
            style={[
              styles.previewEmojiCircle,
              { backgroundColor: PREVIEW_CARDS[1].color },
            ]}
          >
            <Text style={styles.previewEmoji}>{PREVIEW_CARDS[1].emoji}</Text>
          </View>
          <View style={styles.previewCardBody}>
            <Text style={styles.previewName}>
              {PREVIEW_CARDS[1].name} · {PREVIEW_CARDS[1].goal}
            </Text>
            <View style={styles.approvedBadge}>
              <Text style={styles.approvedText}>
                {PREVIEW_CARDS[1].approved}
              </Text>
            </View>
          </View>
        </View>
        {/* Right card */}
        <View style={[styles.previewCard, styles.previewCardRight]}>
          <View
            style={[
              styles.previewEmojiCircle,
              { backgroundColor: PREVIEW_CARDS[2].color },
            ]}
          >
            <Text style={styles.previewEmoji}>{PREVIEW_CARDS[2].emoji}</Text>
          </View>
          <View style={styles.previewCardBody}>
            <Text style={styles.previewName}>{PREVIEW_CARDS[2].name}</Text>
            <Text style={styles.previewGoal}>{PREVIEW_CARDS[2].goal}</Text>
            <Text style={styles.previewReactions}>
              {PREVIEW_CARDS[2].reactions}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F3EF" },
  header: { paddingTop: 64, paddingHorizontal: 28, paddingBottom: 8 },
  logo: {
    fontSize: 38,
    color: "#2F2F2F",
    fontWeight: "900",
    fontFamily: "Inter_900Black",
    letterSpacing: -0.5,
  },
  hero: { paddingHorizontal: 28, paddingTop: 20, flex: 1 },
  tagline: { color: "#2F2F2F", fontFamily: "Inter_500Medium" },
  accountabilityRow: { position: "relative", alignSelf: "flex-start" },
  accountabilityText: {
    fontSize: 16,
    color: "#6B6560",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
  },
  accountabilityLine: {
    position: "absolute",
    bottom: 1,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    opacity: 0.5,
  },
  // Preview cards
  stage: {
    height: 200,
    position: "relative",
    marginBottom: 20,
  },
  previewCard: {
    position: "absolute",
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
    width: 210,
  },
  previewCardLeft: {
    bottom: 24,
    left: 8,
    transform: [{ rotate: "-7deg" }],
    zIndex: 1,
    opacity: 0.78,
  },
  previewCardCenter: {
    bottom: 44,
    left: "50%",
    marginLeft: -105,
    zIndex: 3,
  },
  previewCardRight: {
    bottom: 18,
    right: 8,
    transform: [{ rotate: "6deg" }],
    zIndex: 2,
    opacity: 0.78,
  },
  previewEmojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewEmoji: { fontSize: 18 },
  previewCardBody: { flex: 1 },
  previewName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#2F2F2F",
  },
  previewGoal: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8A8075",
    marginTop: 1,
  },
  previewReactions: { fontSize: 12, marginTop: 3 },
  approvedBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#D9EED3",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  approvedText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#4F6F52",
  },
});
