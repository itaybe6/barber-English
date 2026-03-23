import React, { FC, ReactNode, useEffect } from "react";
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
}

export const TabButton: FC<TabButtonProps> = ({
  focused,
  onPress,
  children,
  activeColor = "#F5F5F5",
}) => {
  const scale = useSharedValue(1);
  const bg = useSharedValue(focused ? activeColor : "#ffffff");

  const rStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(scale.get(), { duration: SCALE_DURATION }) }],
    backgroundColor: withTiming(bg.get(), { duration: SCALE_DURATION }),
  }));

  useEffect(() => {
    setTimeout(() => {
      bg.set(focused ? activeColor : "#ffffff");
    }, BG_DELAY);
  }, [focused, bg, activeColor]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      onPressIn={() => {
        scale.set(SCALE_PRESSED);
        if (!focused) bg.set("#FAFAFA");
      }}
      onPressOut={() => {
        scale.set(1);
        bg.set(focused ? activeColor : "#ffffff");
      }}
    >
      <Animated.View style={[styles.button, rStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 14,
    borderRadius: 999,
  },
});
