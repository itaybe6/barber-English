import { sharedConfigs } from "./color-picker-background-animation";
import React, { FC } from "react";

import { useWindowDimensions, View } from "react-native";
import { HueSlider, Panel1 } from "reanimated-color-picker";

// colorsapp-color-picker-background-animation 🔽

export const ColorPickerPanel: FC = () => {
  const { width } = useWindowDimensions();

  return (
    <View className="flex-1 justify-center px-[16]">
      <View className="items-center mb-[16]">
        <Panel1 style={{ width: width - 55, height: width - 55, borderRadius: 16 }} />
      </View>
      <View className="h-8 w-[120] rounded-full bg-gray-200/10 mb-2" />
      <View className="h-4 w-full rounded-full bg-gray-200/10 mb-2" />
      <View className="h-4 w-5/6 rounded-full bg-gray-200/10 mb-2" />
      <View className="h-8 w-3/4 rounded-full bg-gray-200/10 mb-2" />
      <View className="my-5">
        <HueSlider
          thumbShape="circle"
          sliderThickness={sharedConfigs.sliderThickness}
          thumbSize={sharedConfigs.thumbSliderSize}
          style={{ zIndex: 999 }}
        />
      </View>
    </View>
  );
};

// colorsapp-color-picker-background-animation 🔼
