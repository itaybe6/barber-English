import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  Img,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { AnimatedLine } from "../components/AnimatedText";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const BRAND = "#FF3B30";
const GOLD = "#C9A96E";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background fade in
  const bgOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Logo scale entrance — spring, no bounce
  const logoEntrance = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 60 },
  });
  const logoScale = interpolate(logoEntrance, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(logoEntrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // "BARBER BOOKING" word 1 slides in
  const word1 = spring({
    frame: frame - 8,
    fps,
    config: { damping: 200, stiffness: 80 },
  });
  const word1Y = interpolate(word1, [0, 1], [60, 0]);

  // "SIMPLIFIED" word 2 slides in
  const word2 = spring({
    frame: frame - 18,
    fps,
    config: { damping: 200, stiffness: 80 },
  });
  const word2Y = interpolate(word2, [0, 1], [60, 0]);

  // Accent underline
  const lineProgress = spring({
    frame: frame - 30,
    fps,
    config: { damping: 200, stiffness: 100 },
  });

  // Tagline fade in
  const tagOpacity = interpolate(frame, [fps * 1.2, fps * 1.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const tagY = interpolate(frame, [fps * 1.2, fps * 1.8], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Floating particles
  const particles = [
    { x: 180, y: 200, delay: 5, size: 3 },
    { x: 1740, y: 180, delay: 10, size: 4 },
    { x: 300, y: 820, delay: 15, size: 3 },
    { x: 1620, y: 860, delay: 8, size: 5 },
    { x: 960, y: 80, delay: 12, size: 3 },
    { x: 960, y: 980, delay: 20, size: 4 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse 120% 100% at 50% 50%, #1A0808 0%, #0A0A0A 60%)",
        opacity: bgOpacity,
        fontFamily,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Decorative particles */}
      {particles.map((p, i) => {
        const pScale = spring({
          frame: frame - p.delay,
          fps,
          config: { damping: 12, stiffness: 180 },
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: BRAND,
              opacity: 0.6,
              transform: `scale(${pScale})`,
            }}
          />
        );
      })}

      {/* Horizontal accent lines */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(to right, transparent, ${BRAND}22, transparent)`,
          transform: "translateY(-120px)",
          opacity: interpolate(frame, [fps * 0.5, fps * 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(to right, transparent, ${BRAND}22, transparent)`,
          transform: "translateY(120px)",
          opacity: interpolate(frame, [fps * 0.5, fps * 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      {/* Logo image or text fallback */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* Scissor icon drawn with CSS */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            backgroundColor: BRAND,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            boxShadow: `0 0 40px ${BRAND}66`,
          }}
        >
          ✂
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 22,
            fontWeight: 600,
            color: GOLD,
            letterSpacing: "8px",
            textTransform: "uppercase",
          }}
        >
          ELIYA MOSHE
        </div>
      </div>

      {/* Main headline — staggered words */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflow: "hidden",
          gap: 0,
        }}
      >
        <div
          style={{
            transform: `translateY(${word1Y}px)`,
            opacity: interpolate(word1, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          <span
            style={{
              fontFamily,
              fontSize: 112,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-3px",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            BARBER BOOKING
          </span>
        </div>

        <div
          style={{
            transform: `translateY(${word2Y}px)`,
            opacity: interpolate(word2, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            marginTop: -4,
          }}
        >
          <span
            style={{
              fontFamily,
              fontSize: 112,
              fontWeight: 800,
              color: BRAND,
              letterSpacing: "-3px",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            SIMPLIFIED
          </span>
        </div>
      </div>

      {/* Accent underline */}
      <div style={{ marginTop: 24 }}>
        <AnimatedLine delay={30} color={BRAND} height={5} maxWidth={600} />
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 28,
          fontFamily,
          fontSize: 24,
          fontWeight: 400,
          color: "#999999",
          letterSpacing: "6px",
          textTransform: "uppercase",
          opacity: tagOpacity,
          transform: `translateY(${tagY}px)`,
        }}
      >
        Smart · Elegant · Professional
      </div>
    </AbsoluteFill>
  );
};
