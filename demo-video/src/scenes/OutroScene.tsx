import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { AnimatedText, AnimatedLine, AnimatedDot } from "../components/AnimatedText";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const BRAND = "#FF3B30";
const GOLD = "#C9A96E";

const AppStoreBadge: React.FC<{ label: string; icon: string; delay: number }> = ({
  label,
  icon,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 80 },
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#1C1C1E",
        border: "1.5px solid #3A3A3C",
        borderRadius: 14,
        paddingLeft: 18,
        paddingRight: 24,
        paddingTop: 12,
        paddingBottom: 12,
        opacity: interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
      }}
    >
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, color: "#8E8E93", letterSpacing: "1px", textTransform: "uppercase" }}>
          Download on
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", marginTop: 1 }}>{label}</div>
      </div>
    </div>
  );
};

const CheckRow: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateX(${interpolate(progress, [0, 1], [30, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#34C759",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "#FFFFFF",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ✓
      </div>
      <div style={{ fontSize: 16, color: "#FFFFFF", fontFamily, fontWeight: 500 }}>{text}</div>
    </div>
  );
};

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background fade in
  const bgOpacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Central glow pulse
  const glowPulse = interpolate(
    Math.sin((frame / fps) * 2 * Math.PI),
    [-1, 1],
    [0.3, 0.6]
  );

  // Logo scale bounce
  const logoEntrance = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });

  const checkItems = [
    "No waiting, no calling — book instantly",
    "View real-time barber availability",
    "Manage appointments from your phone",
    "Push & SMS reminders before every cut",
  ];

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse 100% 80% at 50% 50%, #1A0808 0%, #0A0A0A 70%)",
        opacity: bgOpacity,
        fontFamily,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Decorative corner lines */}
      {[
        { top: 80, left: 80, rotateDeg: 0 },
        { top: 80, right: 80, rotateDeg: 90 },
        { bottom: 80, left: 80, rotateDeg: 270 },
        { bottom: 80, right: 80, rotateDeg: 180 },
      ].map((pos, i) => {
        const p = spring({ frame: frame - i * 4, fps, config: { damping: 200 } });
        const len = interpolate(p, [0, 1], [0, 60]);
        const { rotateDeg, ...posStyle } = pos;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...posStyle,
              width: len,
              height: len,
              borderTop: `2px solid ${BRAND}66`,
              borderLeft: `2px solid ${BRAND}66`,
              transform: `rotate(${rotateDeg}deg)`,
            }}
          />
        );
      })}

      {/* Main content — two columns */}
      <div
        style={{
          display: "flex",
          gap: 100,
          alignItems: "center",
          maxWidth: 1400,
          width: "100%",
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        {/* Left: Brand + CTA */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Brand icon */}
          <AnimatedText delay={0} variant="scale">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  backgroundColor: BRAND,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 30,
                  boxShadow: `0 0 30px ${BRAND}88`,
                  transform: `scale(${logoEntrance})`,
                }}
              >
                ✂
              </div>
              <div>
                <div style={{ fontSize: 13, color: GOLD, letterSpacing: "4px", fontWeight: 600 }}>
                  ELIYA MOSHE
                </div>
                <div style={{ fontSize: 11, color: "#666666", letterSpacing: "2px" }}>
                  BOOKING APP
                </div>
              </div>
            </div>
          </AnimatedText>

          <AnimatedText delay={5} variant="fadeUp">
            <div
              style={{
                fontFamily,
                fontSize: 72,
                fontWeight: 800,
                color: "#FFFFFF",
                lineHeight: 1.0,
                letterSpacing: "-2px",
              }}
            >
              Your Best
              <br />
              <span style={{ color: BRAND }}>Cut Awaits.</span>
            </div>
          </AnimatedText>

          <AnimatedLine delay={10} color={BRAND} height={4} maxWidth={120} />

          <AnimatedText delay={15} variant="fadeUp">
            <div style={{ fontSize: 18, color: "#999999", fontWeight: 400, lineHeight: 1.6, maxWidth: 420 }}>
              The complete booking platform for modern barbers and their clients.
            </div>
          </AnimatedText>

          {/* App store badges */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <AppStoreBadge label="App Store" icon="🍎" delay={20} />
            <AppStoreBadge label="Google Play" icon="▶" delay={28} />
          </div>
        </div>

        {/* Right: Feature checklist */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <AnimatedText delay={5} variant="fadeUp">
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              Everything you need
            </div>
          </AnimatedText>

          {checkItems.map((item, i) => (
            <CheckRow key={i} text={item} delay={12 + i * 10} />
          ))}

          {/* Bottom stats row */}
          <AnimatedText delay={52} variant="fadeUp">
            <div
              style={{
                display: "flex",
                gap: 32,
                marginTop: 16,
                paddingTop: 20,
                borderTop: "1px solid #2A2A2A",
              }}
            >
              {[
                { val: "10K+", label: "Bookings" },
                { val: "500+", label: "Clients" },
                { val: "4.9★", label: "Rating" },
              ].map((stat, i) => (
                <div key={i}>
                  <div
                    style={{
                      fontFamily,
                      fontSize: 28,
                      fontWeight: 800,
                      color: "#FFFFFF",
                    }}
                  >
                    {stat.val}
                  </div>
                  <div style={{ fontFamily, fontSize: 13, color: "#666666", marginTop: 2 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedText>
        </div>
      </div>
    </AbsoluteFill>
  );
};
