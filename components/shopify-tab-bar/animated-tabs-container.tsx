import React, { FC, PropsWithChildren } from "react";
import { useMenu } from "./menu-provider";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

export const AnimatedTabsContainer: FC<PropsWithChildren> = ({ children }) => {
  const { menuProgress } = useMenu();

  const rContainerStyle = useAnimatedStyle(() => {
    const translateY = interpolate(menuProgress.get(), [0, 1], [0, 20]);
    return { transform: [{ translateY }] };
  });

  return (
    <Animated.View style={[{ flex: 1 }, rContainerStyle]}>
      {children}
    </Animated.View>
  );
};
