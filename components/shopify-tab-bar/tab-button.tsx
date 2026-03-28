import React, { FC, ReactNode, useEffect, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const SCALE_DURATION = 150;
const SCALE_PRESSED = 0.88;
const BG_DELAY = 32;

interface TabButtonProps {
  focused: boolean;
  onPress: () => void;
  children: ReactNode;
  activeColor?: string;
  /** Default 14 — use a larger value for oversized tab bars (e.g. booking). */
  buttonPadding?: number;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "tab";
}

export const TabButton: FC<TabButtonProps> = ({
  focused,
  onPress,
  children,
  activeColor = "#F5F5F5",
  buttonPadding = 14,
  accessibilityLabel,
  accessibilityRole = "button",
}) => {
  const scale = useSharedValue(1);
  const bg = useSharedValue(focused ? activeColor : "#ffffff");
  /** onPressOut must not read stale `focused` after parent toggles state in onPress — sync after layout. */
  const focusedRef = useRef(focused);
  const activeColorRef = useRef(activeColor);
  focusedRef.current = focused;
  activeColorRef.current = activeColor;

  const rStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(scale.get(), { duration: SCALE_DURATION }) }],
    backgroundColor: withTiming(bg.get(), { duration: SCALE_DURATION }),
  }));

  useEffect(() => {
    const t = setTimeout(() => {
      bg.set(focused ? activeColor : "#ffffff");
    }, BG_DELAY);
    return () => clearTimeout(t);
  }, [focused, bg, activeColor]);

  const syncBgToFocused = () => {
    const f = focusedRef.current;
    const c = activeColorRef.current;
    bg.set(f ? c : "#ffffff");
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      onPressIn={() => {
        scale.set(SCALE_PRESSED);
        if (!focusedRef.current) bg.set("#FAFAFA");
      }}
      onPressOut={() => {
        scale.set(1);
        // After parent onPress (e.g. toggle) React may commit on the next frame — avoid stale `focused` in bg.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            syncBgToFocused();
          });
        });
      }}
    >
      <Animated.View style={[styles.button, { padding: buttonPadding }, rStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
  },
});
