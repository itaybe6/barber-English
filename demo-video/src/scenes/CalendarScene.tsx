import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { PhoneMockup } from "../components/PhoneMockup";
import { AnimatedText, AnimatedLine } from "../components/AnimatedText";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const BRAND = "#FF3B30";
const GOLD = "#C9A96E";

const CALENDAR_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DATES = [
  [null, null, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, 31, null, null],
];

const TIME_SLOTS = [
  { time: "09:00", available: true },
  { time: "10:30", available: true },
  { time: "12:00", available: false },
  { time: "14:00", available: true },
  { time: "15:30", available: true },
  { time: "17:00", available: false },
];

const CalendarScreenContent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const calProgress = spring({ frame, fps, config: { damping: 200 } });
  const slotsProgress = spring({ frame: frame - 20, fps, config: { damping: 200 } });

  const SELECTED_DATE = 15;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#F2F2F7",
        fontFamily,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "#000000",
          paddingTop: 60,
          paddingBottom: 16,
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, letterSpacing: 2, marginBottom: 4 }}>
          STEP 3 OF 3
        </div>
        <div style={{ fontSize: 22, color: "#FFFFFF", fontWeight: 700 }}>Select Date & Time</div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginTop: 4 }}>
          Classic Haircut · 30 min
        </div>
      </div>

      {/* Calendar */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          margin: "12px 16px",
          borderRadius: 16,
          padding: "14px 12px",
          opacity: interpolate(calProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(calProgress, [0, 1], [20, 0])}px)`,
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        {/* Month header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E" }}>April 2026</div>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 16, color: "#8E8E93" }}>‹</span>
            <span style={{ fontSize: 16, color: "#1C1C1E", fontWeight: 600 }}>›</span>
          </div>
        </div>

        {/* Day headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 2,
            marginBottom: 4,
          }}
        >
          {CALENDAR_DAYS.map((d, i) => (
            <div
              key={i}
              style={{
                textAlign: "center",
                fontSize: 11,
                fontWeight: 600,
                color: "#8E8E93",
                paddingBottom: 4,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Date grid */}
        {DATES.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              marginBottom: 4,
            }}
          >
            {week.map((date, di) => {
              const isSelected = date === SELECTED_DATE;
              const isToday = date === 11;
              const isPast = date !== null && date < 11;

              return (
                <div
                  key={di}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isSelected ? BRAND : isToday ? "rgba(255,59,48,0.12)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                  }}
                >
                  {date !== null && (
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected || isToday ? 700 : 400,
                        color: isSelected ? "#FFFFFF" : isToday ? BRAND : isPast ? "#C7C7CC" : "#1C1C1E",
                      }}
                    >
                      {date}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Time slots */}
      <div style={{ paddingLeft: 16, paddingRight: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E", marginBottom: 8 }}>
          Available Times
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            opacity: interpolate(slotsProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(slotsProgress, [0, 1], [20, 0])}px)`,
          }}
        >
          {TIME_SLOTS.map((slot, i) => (
            <div
              key={i}
              style={{
                backgroundColor: i === 1 ? BRAND : slot.available ? "#FFFFFF" : "#F2F2F7",
                borderRadius: 10,
                padding: "10px 0",
                textAlign: "center",
                border: `1.5px solid ${i === 1 ? BRAND : slot.available ? "#E5E5EA" : "#E5E5EA"}`,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: i === 1 ? "#FFFFFF" : slot.available ? "#1C1C1E" : "#C7C7CC",
                }}
              >
                {slot.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm button */}
      <div style={{ padding: "12px 16px 40px", marginTop: "auto" }}>
        <div
          style={{
            backgroundColor: "#000000",
            borderRadius: 14,
            padding: "14px 0",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Confirm Booking</span>
        </div>
      </div>
    </div>
  );
};

export const CalendarScene: React.FC = () => {
  const highlights = [
    { label: "Real-time availability", icon: "⚡" },
    { label: "Instant confirmation", icon: "✓" },
    { label: "Free cancellation 24h", icon: "🔄" },
    { label: "SMS & push reminders", icon: "🔔" },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0A0A0A 0%, #0A0F0A 50%, #0A0A0A 100%)",
        fontFamily,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Left: Text */}
      <div
        style={{
          flex: 1,
          paddingLeft: 120,
          paddingRight: 60,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <AnimatedText delay={0} variant="fadeLeft">
          <div style={{ fontSize: 13, fontWeight: 600, color: GOLD, letterSpacing: "5px", textTransform: "uppercase" }}>
            SMART SCHEDULING
          </div>
        </AnimatedText>

        <AnimatedText delay={5} variant="fadeLeft">
          <div
            style={{
              fontFamily,
              fontSize: 64,
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1.05,
              letterSpacing: "-1px",
            }}
          >
            Pick Your
            <br />
            <span style={{ color: BRAND }}>Perfect Time</span>
          </div>
        </AnimatedText>

        <AnimatedLine delay={10} color={BRAND} height={4} maxWidth={80} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {highlights.map((h, i) => (
            <AnimatedText key={i} delay={15 + i * 10} variant="fadeLeft">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "rgba(255,59,48,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {h.icon}
                </div>
                <div style={{ fontFamily, fontSize: 17, fontWeight: 500, color: "#FFFFFF" }}>
                  {h.label}
                </div>
              </div>
            </AnimatedText>
          ))}
        </div>
      </div>

      {/* Right: Phone mockup */}
      <div
        style={{
          width: 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingRight: 80,
          transform: "scale(0.84)",
          transformOrigin: "center center",
        }}
      >
        <PhoneMockup enterDelay={0} enterFrom="right">
          <CalendarScreenContent />
        </PhoneMockup>
      </div>
    </AbsoluteFill>
  );
};
