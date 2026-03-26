import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface AnimatedTextProps {
  children: React.ReactNode;
  /** Frame delay before animation starts */
  delay?: number;
  /** Animation style */
  variant?: "fadeUp" | "fadeLeft" | "scale" | "fadeIn";
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  delay = 0,
  variant = "fadeUp",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 60 },
  });

  const opacity = interpolate(progress, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  let transform = "none";

  if (variant === "fadeUp") {
    const y = interpolate(progress, [0, 1], [40, 0]);
    transform = `translateY(${y}px)`;
  } else if (variant === "fadeLeft") {
    const x = interpolate(progress, [0, 1], [-40, 0]);
    transform = `translateX(${x}px)`;
  } else if (variant === "scale") {
    const s = interpolate(progress, [0, 1], [0.7, 1]);
    transform = `scale(${s})`;
  }

  return (
    <div
      style={{
        opacity,
        transform,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface AnimatedLineProps {
  delay?: number;
  color?: string;
  height?: number;
  maxWidth?: number | string;
}

export const AnimatedLine: React.FC<AnimatedLineProps> = ({
  delay = 0,
  color = "#FF3B30",
  height = 4,
  maxWidth = 320,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 80 },
  });

  const width = interpolate(progress, [0, 1], [0, typeof maxWidth === "number" ? maxWidth : 320]);

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: color,
        borderRadius: height / 2,
        overflow: "hidden",
      }}
    />
  );
};

interface AnimatedDotProps {
  delay?: number;
  color?: string;
  size?: number;
}

export const AnimatedDot: React.FC<AnimatedDotProps> = ({
  delay = 0,
  color = "#FF3B30",
  size = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: `scale(${scale})`,
        flexShrink: 0,
      }}
    />
  );
};
