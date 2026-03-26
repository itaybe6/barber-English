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

const services = [
  {
    name: "Classic Haircut",
    desc: "Traditional cut with hot towel",
    duration: "30 min",
    price: "₪80",
    selected: true,
  },
  {
    name: "Beard Sculpt",
    desc: "Shape, trim & line-up",
    duration: "25 min",
    price: "₪60",
    selected: false,
  },
  {
    name: "Full Grooming",
    desc: "Haircut + beard + treatment",
    duration: "75 min",
    price: "₪180",
    selected: false,
  },
];

const barbers = [
  { name: "Eliya", emoji: "💈", available: true },
  { name: "David", emoji: "✂", available: true },
  { name: "Moshe", emoji: "🪒", available: false },
];

const BookingScreenContent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { label: "Service", done: true },
    { label: "Barber", done: false },
    { label: "Time", done: false },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#FFFFFF",
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
          NEW BOOKING
        </div>
        <div style={{ fontSize: 22, color: "#FFFFFF", fontWeight: 700 }}>Choose a Service</div>

        {/* Progress steps */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: i === 0 ? BRAND : "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#FFFFFF",
                    fontWeight: 700,
                  }}
                >
                  {i === 0 ? "✓" : i + 1}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: i === 0 ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                    fontWeight: i === 0 ? 600 : 400,
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: "rgba(255,255,255,0.15)",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Service cards */}
      <div style={{ flex: 1, padding: "14px 16px", overflow: "hidden" }}>
        {services.map((svc, i) => {
          const cardProgress = spring({
            frame: frame - i * 10,
            fps,
            config: { damping: 200 },
          });
          return (
            <div
              key={i}
              style={{
                backgroundColor: svc.selected ? "#000000" : "#F2F2F7",
                borderRadius: 14,
                padding: "14px 16px",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: svc.selected ? `2px solid ${BRAND}` : "2px solid transparent",
                transform: `translateY(${interpolate(cardProgress, [0, 1], [30, 0])}px)`,
                opacity: interpolate(cardProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: svc.selected ? "#FFFFFF" : "#1C1C1E",
                  }}
                >
                  {svc.name}
                </div>
                <div style={{ fontSize: 12, color: svc.selected ? "#AAAAAA" : "#8E8E93", marginTop: 2 }}>
                  {svc.desc}
                </div>
                <div style={{ fontSize: 11, color: svc.selected ? GOLD : "#8E8E93", marginTop: 4, fontWeight: 600 }}>
                  {svc.duration}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: svc.selected ? BRAND : "#1C1C1E",
                  }}
                >
                  {svc.price}
                </div>
                {svc.selected && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: BRAND,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: "#FFFFFF",
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Continue button */}
      <div style={{ padding: "0 16px 40px" }}>
        <div
          style={{
            backgroundColor: BRAND,
            borderRadius: 14,
            padding: "15px 0",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>
            Continue →
          </span>
        </div>
      </div>
    </div>
  );
};

export const BookingScene: React.FC = () => {
  const steps = [
    { num: "01", title: "Choose Service", desc: "Select from premium grooming options" },
    { num: "02", title: "Pick Your Barber", desc: "Book with your trusted professional" },
    { num: "03", title: "Select a Time", desc: "Real-time availability, no waiting" },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0A0A0A 0%, #120808 50%, #0A0A0A 100%)",
        fontFamily,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Left: Phone */}
      <div
        style={{
          width: 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 80,
          transform: "scale(0.84)",
          transformOrigin: "center center",
        }}
      >
        <PhoneMockup enterDelay={0} enterFrom="left">
          <BookingScreenContent />
        </PhoneMockup>
      </div>

      {/* Right: Text */}
      <div
        style={{
          flex: 1,
          paddingLeft: 60,
          paddingRight: 120,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <AnimatedText delay={0} variant="fadeUp">
          <div style={{ fontSize: 13, fontWeight: 600, color: GOLD, letterSpacing: "5px", textTransform: "uppercase" }}>
            STREAMLINED BOOKING
          </div>
        </AnimatedText>

        <AnimatedText delay={5} variant="fadeUp">
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
            Book in
            <br />
            <span style={{ color: BRAND }}>3 Easy Steps</span>
          </div>
        </AnimatedText>

        <AnimatedLine delay={10} color={BRAND} height={4} maxWidth={80} />

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {steps.map((step, i) => (
            <AnimatedText key={i} delay={15 + i * 12} variant="fadeUp">
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily,
                    fontSize: 40,
                    fontWeight: 800,
                    color: BRAND,
                    lineHeight: 1,
                    opacity: 0.4,
                    minWidth: 52,
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div style={{ fontFamily, fontSize: 18, fontWeight: 700, color: "#FFFFFF" }}>
                    {step.title}
                  </div>
                  <div style={{ fontFamily, fontSize: 14, fontWeight: 400, color: "#999999", marginTop: 4 }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            </AnimatedText>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
