import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface PhoneMockupProps {
  children: React.ReactNode;
  /** Delay in frames before the phone animates in */
  enterDelay?: number;
  /** Direction the phone slides from */
  enterFrom?: "right" | "left" | "bottom";
}

const PHONE_W = 390;
const PHONE_H = 844;
const BORDER_RADIUS = 50;
const BORDER_W = 10;

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  children,
  enterDelay = 0,
  enterFrom = "right",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - enterDelay,
    fps,
    config: { damping: 150, stiffness: 80, mass: 1 },
  });

  const translateX = interpolate(
    entrance,
    [0, 1],
    [enterFrom === "right" ? 200 : enterFrom === "left" ? -200 : 0, 0]
  );
  const translateY = interpolate(
    entrance,
    [0, 1],
    [enterFrom === "bottom" ? 200 : 0, 0]
  );
  const scale = interpolate(entrance, [0, 1], [0.9, 1]);
  const opacity = interpolate(entrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: BORDER_RADIUS,
        border: `${BORDER_W}px solid #2C2C2E`,
        backgroundColor: "#1C1C1E",
        overflow: "hidden",
        position: "relative",
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        opacity,
        boxShadow:
          "0 60px 120px rgba(0,0,0,0.6), 0 0 0 1px #3A3A3C, inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 50,
          backgroundColor: "rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 24,
          paddingRight: 20,
          paddingTop: 10,
          zIndex: 20,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Signal bars */}
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
            {[6, 9, 12, 15].map((h, i) => (
              <div
                key={i}
                style={{ width: 3, height: h, backgroundColor: "#FFFFFF", borderRadius: 1 }}
              />
            ))}
          </div>
          {/* WiFi */}
          <div style={{ fontSize: 12, color: "#FFFFFF" }}>⚡</div>
          {/* Battery */}
          <div
            style={{
              width: 22,
              height: 11,
              border: "1.5px solid #FFFFFF",
              borderRadius: 3,
              position: "relative",
              display: "flex",
              alignItems: "center",
              paddingLeft: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 2,
                height: 5,
                backgroundColor: "#FFFFFF",
                borderRadius: "0 1px 1px 0",
              }}
            />
            <div
              style={{
                width: "80%",
                height: "60%",
                backgroundColor: "#34C759",
                borderRadius: 1,
              }}
            />
          </div>
        </div>
      </div>

      {/* Dynamic Island */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 126,
          height: 37,
          backgroundColor: "#000000",
          borderRadius: 20,
          zIndex: 30,
        }}
      />

      {/* Screen content */}
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
        }}
      >
        {children}
      </div>

      {/* Home indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 134,
          height: 5,
          backgroundColor: "#1C1C1E",
          borderRadius: 3,
          zIndex: 20,
        }}
      />
    </div>
  );
};
