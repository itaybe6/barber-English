import React, { FC, ReactNode, useEffect } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

// shopify-custom-bottom-tab-bar-animation 🔽

const BUTTON_SCALE_DURATION = 150; // Fast enough for instant feedback, slow enough to see the animation
const BUTTON_SCALE_PRESSED = 0.9; // 10% scale reduction creates noticeable but not excessive squeeze effect
const BG_SYNC_DELAY = 32; // Prevents background flash on rapid navigation changes

interface TabButtonProps {
  focused: boolean;
  onPress: () => void;
  children: ReactNode;
}

export const TabButton: FC<TabButtonProps> = ({ focused, onPress, children }) => {
  // Independent animation values for responsive UI thread animations
  const scale = useSharedValue(1);
  const bg = useSharedValue(focused ? "#F5F5F5" : "white"); // Light gray for active, white for inactive

  // Combined scale and background animation for press feedback
  const rStyle = useAnimatedStyle(() => ({
    // withTiming chosen over spring: deterministic 150ms press latency keeps taps feeling crisp
    transform: [{ scale: withTiming(scale.get(), { duration: BUTTON_SCALE_DURATION }) }],
    // Syncs visual state to navigation focus while avoiding overshoot; color animates with the same cadence
    backgroundColor: withTiming(bg.get(), { duration: BUTTON_SCALE_DURATION }),
  }));

  // Sync background color when focus state changes from navigation
  useEffect(() => {
    // Small delay avoids fighting the press-in state when route changes quickly (prevents flash)
    setTimeout(() => {
      bg.set(focused ? "#F5F5F5" : "white");
    }, BG_SYNC_DELAY); // Prevents flash when rapidly switching tabs
  }, [focused, bg]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      onPressIn={() => {
        if (focused) {
          scale.set(BUTTON_SCALE_PRESSED); // Quick press feedback for already active tab
          return;
        }
        scale.set(BUTTON_SCALE_PRESSED);
        bg.set("#FAFAFA"); // Temporary light hover state during press
      }}
      onPressOut={() => {
        scale.set(1); // Return to normal size
        if (focused) {
          bg.set("#F5F5F5"); // Restore active background if still focused
        } else {
          bg.set("white"); // Return to inactive background
        }
      }}
    >
      <Animated.View className="p-3.5 rounded-full" style={rStyle}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

// shopify-custom-bottom-tab-bar-animation 🔼
