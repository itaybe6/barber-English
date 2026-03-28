import { sharedConfigs } from "./palette-picker-color-change-animation";
import React, { FC } from "react";

import { useWindowDimensions } from "react-native";
import Animated, {
  FadeOut,
  RotateInDownLeft,
  RotateInDownRight,
  SharedValue,
} from "react-native-reanimated";
import { ExtraThumb, Panel3, ColorFormatsObject } from "reanimated-color-picker";
const ACCENT_THUMB_BASE = 'rgba(39,39,42,0.25)';

// colorsapp-palette-picker-color-change-animation 🔽

type Props = {
  state: SharedValue<"idle" | "active">;
  lightAccentColor: SharedValue<string>;
  darkAccentColor: SharedValue<string>;
};

export const ColorPanel: FC<Props> = ({ state, lightAccentColor, darkAccentColor }) => {
  const randomNumber = Math.ceil(Math.random() * 100);

  const { width } = useWindowDimensions();

  // Panel is a centered square; subtract 32px to align with outer layout padding for
  // perfect edge rhythm between animated rings and interactive spectrum.
  const _width = width - 32;

  return (
    <Animated.View
      // Touch toggles breathing mode: active while dragging to convey energy,
      // idle when released for calmer background motion.
      onTouchStart={() => state.set("active")}
      onTouchEnd={() => state.set("idle")}
      // Randomize enter rotation for variety across mounts (keeps demo lively).
      // 500ms gives a quick but not jarring arrival.
      entering={
        randomNumber % 2 === 0 ? RotateInDownLeft.duration(500) : RotateInDownRight.duration(500)
      }
      exiting={FadeOut}
    >
      <Panel3
        style={{ width: _width, height: _width }}
        adaptSpectrum
        thumbSize={sharedConfigs.thumbPanelSize}
        centerChannel="saturation"
        thumbShape="ring"
        thumbStyle={{ overflow: "hidden" }}
      >
        <ExtraThumb
          key="lightAccentBase"
          thumbShape="solid"
          thumbSize={sharedConfigs.thumbSliderSize * 0.75}
          thumbColor={ACCENT_THUMB_BASE}
          // Triadic: +120° hue shift from the primary.
          hueTransform={120}
          // Worklet ensures assignment runs on UI thread, keeping dependent animations in sync.
          onChange={(colors: ColorFormatsObject) => {
            "worklet";
            lightAccentColor.set(colors.hex);
          }}
        />
        <ExtraThumb
          key="darkAccentBase"
          thumbShape="solid"
          thumbSize={sharedConfigs.thumbSliderSize * 0.75}
          thumbColor={ACCENT_THUMB_BASE}
          // Triadic: +240° hue shift from the primary.
          hueTransform={240}
          // Same worklet rationale as above; avoids JS<->UI bridge churn during drags.
          onChange={(colors: ColorFormatsObject) => {
            "worklet";
            darkAccentColor.set(colors.hex);
          }}
        />
      </Panel3>
    </Animated.View>
  );
};

// colorsapp-palette-picker-color-change-animation 🔼
