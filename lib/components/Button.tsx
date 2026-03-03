import { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Variant = "ghost" | "primary" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const GRADIENT: Record<Variant, readonly [string, string]> = {
  ghost: ["#ffffff", "#f5f5fa"],
  primary: ["#8FAF85", "#5F7A56"],
  danger: ["#fff5f5", "#ffeaea"],
};

// Background colour used by shadow views (must match gradient start for seamless look)
const SHADOW_BG: Record<Variant, string> = {
  ghost: "#ffffff",
  primary: "#8FAF85",
  danger: "#fff5f5",
};

const TEXT_COLOR: Record<Variant, string> = {
  ghost: "#484c7a",
  primary: "#FDFAF5",
  danger: "#c0392b",
};

// Two-layer shadow colours matching the reference CSS
const SHADOW1: Record<Variant, string> = {
  ghost: "#252c61",
  primary: "#2E4A2A",
  danger: "#c0392b",
};
const SHADOW2: Record<Variant, string> = {
  ghost: "#5d6494",
  primary: "#4F6F52",
  danger: "#e74c3c",
};

const PADDING: Record<Size, { paddingVertical: number; paddingHorizontal: number }> = {
  sm: { paddingVertical: 10, paddingHorizontal: 16 },
  md: { paddingVertical: 16, paddingHorizontal: 24 },
  lg: { paddingVertical: 18, paddingHorizontal: 32 },
};

const FONT_SIZE: Record<Size, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

export default function Button({
  label,
  onPress,
  variant = "ghost",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  style,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 1.04,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const padding = PADDING[size];
  const fontSize = FONT_SIZE[size];
  const textColor = TEXT_COLOR[variant];
  const bg = SHADOW_BG[variant];

  return (
    <Animated.View
      style={[
        { transform: [{ scale }], alignSelf: fullWidth ? "stretch" : "flex-start", opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {/* Outer shadow — large diffuse (box-shadow 1) */}
      <View
        style={{
          borderRadius: 9999,
          backgroundColor: bg,
          shadowColor: SHADOW1[variant],
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 11,
          elevation: 6,
          alignSelf: fullWidth ? "stretch" : undefined,
        }}
      >
        {/* Inner shadow — tight close (box-shadow 2) */}
        <View
          style={{
            borderRadius: 9999,
            backgroundColor: bg,
            shadowColor: SHADOW2[variant],
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.2,
            shadowRadius: 3,
            alignSelf: fullWidth ? "stretch" : undefined,
          }}
        >
          <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={disabled || loading}
            accessibilityRole="button"
            style={{ borderRadius: 9999, overflow: "hidden" }}
          >
            <LinearGradient
              colors={GRADIENT[variant]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.inner, padding]}
            >
              {icon}
              {loading ? (
                <ActivityIndicator color={textColor} size="small" />
              ) : (
                <Text style={[styles.label, { color: textColor, fontSize }]}>
                  {label}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 9999,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
});
