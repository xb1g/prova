/**
 * CallBsButton — overengineered "Call BS" button
 *
 * Idle  : breathing pulse + subtle glow ring
 * Press : haptic burst · screen-shake · radial ripple · emoji particle explosion
 * Active: red-orange gradient · pulsing danger glow · "✓ BS Called" text
 */
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

// ─── Particles ──────────────────────────────────────────────────────────────

const PARTICLES = ["💩", "🚨", "❌", "⚠️", "💥", "🤥", "😤", "🙅"];

type Particle = {
  emoji: string;
  tx: Animated.Value; // final translateX
  ty: Animated.Value; // final translateY (negative = up)
  opacity: Animated.Value;
  rotate: Animated.Value;
  scale: Animated.Value;
};

function makeParticles(): Particle[] {
  return Array.from({ length: 8 }, (_, i) => ({
    emoji: PARTICLES[i],
    tx: new Animated.Value(0),
    ty: new Animated.Value(0),
    opacity: new Animated.Value(0),
    rotate: new Animated.Value(0),
    scale: new Animated.Value(0),
  }));
}

// Random spread: left half gets negative X, right half positive
const SPREADS = [
  { x: -60, y: -90 }, { x: 60, y: -100 }, { x: -80, y: -60 },
  { x: 80, y: -70 },  { x: -40, y: -110 }, { x: 40, y: -95 },
  { x: -100, y: -50 }, { x: 100, y: -55 },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  active: boolean;
  onPress: () => void;
}

export default function CallBsButton({ active, onPress }: Props) {
  // --- shared refs ---
  const shakeX = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const rippleScale = useRef(new Animated.Value(0.4)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const activeGlow = useRef(new Animated.Value(0)).current;
  const particles = useRef(makeParticles()).current;
  const breatheRef = useRef<Animated.CompositeAnimation | null>(null);
  const activeGlowRef = useRef<Animated.CompositeAnimation | null>(null);

  // --- idle breathing ---
  useEffect(() => {
    if (!active) {
      breatheRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.03, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      breatheRef.current.start();
    } else {
      breatheRef.current?.stop();
      breathe.setValue(1);
    }
    return () => breatheRef.current?.stop();
  }, [active]);

  // --- active danger glow pulse ---
  useEffect(() => {
    if (active) {
      activeGlowRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(activeGlow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(activeGlow, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ])
      );
      activeGlowRef.current.start();
    } else {
      activeGlowRef.current?.stop();
      activeGlow.setValue(0);
    }
    return () => activeGlowRef.current?.stop();
  }, [active]);

  const handlePress = () => {
    if (active) { onPress(); return; }

    // 1. Haptic burst
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // 2. Shake
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 8,  duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6,  duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -3, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,  duration: 35, useNativeDriver: true }),
    ]).start();

    // 3. Scale pop
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.15, speed: 80, bounciness: 10, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1,    speed: 40, bounciness: 4,  useNativeDriver: true }),
    ]).start();

    // 4. Ripple
    rippleScale.setValue(0.3);
    rippleOpacity.setValue(0.7);
    Animated.parallel([
      Animated.timing(rippleScale,   { toValue: 2.8, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(rippleOpacity, { toValue: 0,   duration: 600, useNativeDriver: true }),
    ]).start();

    // 5. Glow flash
    glowOpacity.setValue(1);
    Animated.timing(glowOpacity, { toValue: 0, duration: 400, useNativeDriver: false }).start();

    // 6. Particle burst
    particles.forEach((p, i) => {
      p.tx.setValue(0); p.ty.setValue(0);
      p.opacity.setValue(1); p.rotate.setValue(0); p.scale.setValue(0);

      const spread = SPREADS[i];
      const rotEnd = (Math.random() - 0.5) * 720;

      Animated.parallel([
        Animated.spring(p.scale,   { toValue: 1.4, speed: 60, bounciness: 12, useNativeDriver: true }),
        Animated.timing(p.tx,      { toValue: spread.x, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(p.ty,      { toValue: spread.y, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(p.rotate,  { toValue: rotEnd,   duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(p.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    });

    // 7. Second haptic at peak
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);

    onPress();
  };

  const activeShadowRadius = activeGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] });
  const activeShadowOpacity = activeGlow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.75] });

  return (
    <View style={styles.wrapper}>
      {/* Ripple ring */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ripple,
          {
            transform: [{ scale: rippleScale }],
            opacity: rippleOpacity,
          },
        ]}
      />

      {/* Glow halo (JS driver — separate view, no conflict) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowHalo,
          { opacity: glowOpacity },
        ]}
      />

      {/* Active danger glow (pulsing, JS driver) */}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeGlowRing,
            {
              shadowRadius: activeShadowRadius,
              shadowOpacity: activeShadowOpacity,
            },
          ]}
        />
      )}

      {/* Particles */}
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          pointerEvents="none"
          style={[
            styles.particle,
            {
              opacity: p.opacity,
              transform: [
                { translateX: p.tx },
                { translateY: p.ty },
                { rotate: p.rotate.interpolate({ inputRange: [-720, 720], outputRange: ["-720deg", "720deg"] }) },
                { scale: p.scale },
              ],
            },
          ]}
        >
          {p.emoji}
        </Animated.Text>
      ))}

      {/* The button itself */}
      <Animated.View
        style={[
          styles.shadowOuter,
          active && styles.shadowOuterActive,
          { transform: [{ translateX: shakeX }, { scale: active ? 1 : breathe }] },
        ]}
      >
        <Animated.View
          style={[
            styles.shadowInner,
            active && styles.shadowInnerActive,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={active ? "Remove Call BS" : "Call BS on this post"}
            style={{ borderRadius: 9999, overflow: "hidden" }}
          >
            <LinearGradient
              colors={active ? ["#FF5C3A", "#D92E0A"] : ["#FFFFFF", "#F0EEF8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.inner}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {active ? "✓  BS Called" : "Call BS"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  // ── shadows ──────────────────────────────────────────────────────
  shadowOuter: {
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#252c61",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 11,
    elevation: 6,
  },
  shadowOuterActive: {
    backgroundColor: "#FF5C3A",
    shadowColor: "#CC2200",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  shadowInner: {
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#5d6494",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  shadowInnerActive: {
    backgroundColor: "#FF5C3A",
    shadowColor: "#FF2200",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  // ── gradient pill ─────────────────────────────────────────────────
  inner: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    fontSize: 13,
    color: "#484c7a",
    lineHeight: 18,
  },
  labelActive: {
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  // ── effects ──────────────────────────────────────────────────────
  ripple: {
    position: "absolute",
    width: 100,
    height: 44,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: "#FF4411",
    backgroundColor: "transparent",
  },
  glowHalo: {
    position: "absolute",
    width: 110,
    height: 54,
    borderRadius: 9999,
    backgroundColor: "#FF3300",
    opacity: 0,
  },
  activeGlowRing: {
    position: "absolute",
    width: 108,
    height: 52,
    borderRadius: 9999,
    backgroundColor: "#FF4422",
    shadowColor: "#FF2200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  particle: {
    position: "absolute",
    fontSize: 18,
  },
});
