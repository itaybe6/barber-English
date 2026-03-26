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
import { AnimatedText, AnimatedDot } from "../components/AnimatedText";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const BRAND = "#FF3B30";
const GOLD = "#C9A96E";

const features = [
  { icon: "📅", label: "Instant Booking", desc: "Book in under 30 seconds" },
  { icon: "💈", label: "Choose Your Barber", desc: "Pick your favorite professional" },
  { icon: "🔔", label: "Smart Reminders", desc: "Never miss an appointment" },
];

const HomeScreenContent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerProgress = spring({ frame, fps, config: { damping: 200 } });
  const card1 = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const card2 = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const card3 = spring({ frame: frame - 24, fps, config: { damping: 200 } });
  const btnProgress = spring({ frame: frame - 35, fps, config: { damping: 200 } });

  const serviceCards = [
    { name: "Haircut", duration: "30 min", price: "₪80", color: "#1C1C1E" },
    { name: "Beard Trim", duration: "20 min", price: "₪50", color: "#2C2C2E" },
    { name: "Full Service", duration: "60 min", price: "₪150", color: "#1C1C1E" },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#F2F2F7",
        fontFamily,
        overflowY: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* App Header */}
      <div
        style={{
          backgroundColor: "#000000",
          paddingTop: 60,
          paddingBottom: 20,
          paddingLeft: 24,
          paddingRight: 24,
          opacity: interpolate(headerProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 13, color: GOLD, fontWeight: 600, letterSpacing: 2 }}>
          WELCOME BACK
        </div>
        <div style={{ fontSize: 28, color: "#FFFFFF", fontWeight: 700, marginTop: 4 }}>
          Eliya Moshe
        </div>
        <div style={{ fontSize: 13, color: "#999999", marginTop: 2 }}>
          Premium Barbershop · Tel Aviv
        </div>
      </div>

      {/* Upcoming Appointment Card */}
      <div
        style={{
          margin: "12px 16px",
          backgroundColor: BRAND,
          borderRadius: 16,
          padding: "16px 18px",
          transform: `scale(${interpolate(card1, [0, 1], [0.9, 1])})`,
          opacity: interpolate(card1, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600, letterSpacing: 1 }}>
          NEXT APPOINTMENT
        </div>
        <div style={{ fontSize: 18, color: "#FFFFFF", fontWeight: 700, marginTop: 4 }}>
          Haircut + Beard
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>Tomorrow, 14:00</div>
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 20,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 5,
              paddingBottom: 5,
              fontSize: 11,
              color: "#FFFFFF",
              fontWeight: 600,
            }}
          >
            Confirmed
          </div>
        </div>
      </div>

      {/* Services section */}
      <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C1C1E", marginBottom: 10 }}>
          Our Services
        </div>

        {serviceCards.map((svc, i) => {
          const cardProgress = [card1, card2, card3][i];
          return (
            <div
              key={i}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transform: `translateX(${interpolate(cardProgress, [0, 1], [40, 0])}px)`,
                opacity: interpolate(cardProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1C1E" }}>{svc.name}</div>
                <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>{svc.duration}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1C1C1E" }}>{svc.price}</div>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: BRAND,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    color: "#FFFFFF",
                    fontWeight: 700,
                  }}
                >
                  +
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Book Now Button */}
      <div
        style={{
          margin: "8px 16px",
          backgroundColor: "#000000",
          borderRadius: 14,
          padding: "14px 0",
          textAlign: "center",
          transform: `scale(${interpolate(btnProgress, [0, 1], [0.8, 1])})`,
          opacity: interpolate(btnProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Book Appointment</span>
      </div>
    </div>
  );
};

export const HomeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #0D0D0D 100%)",
        fontFamily,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Background texture lines */}
      {[200, 400, 600, 800].map((y, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(to right, transparent, rgba(255,255,255,0.03), transparent)",
          }}
        />
      ))}

      {/* Left text panel */}
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
        {/* Label */}
        <AnimatedText delay={0} variant="fadeLeft">
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: GOLD,
              letterSpacing: "5px",
              textTransform: "uppercase",
            }}
          >
            CLIENT EXPERIENCE
          </div>
        </AnimatedText>

        {/* Headline */}
        <AnimatedText delay={5} variant="fadeLeft">
          <div
            style={{
              fontFamily,
              fontSize: 68,
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1.05,
              letterSpacing: "-1px",
            }}
          >
            Your Style.
            <br />
            <span style={{ color: BRAND }}>Your Schedule.</span>
          </div>
        </AnimatedText>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {features.map((feat, i) => (
            <AnimatedText key={i} delay={15 + i * 10} variant="fadeLeft">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <AnimatedDot delay={15 + i * 10} color={BRAND} size={10} />
                <div style={{ marginTop: -1 }}>
                  <div
                    style={{
                      fontFamily,
                      fontSize: 18,
                      fontWeight: 600,
                      color: "#FFFFFF",
                    }}
                  >
                    {feat.label}
                  </div>
                  <div
                    style={{
                      fontFamily,
                      fontSize: 15,
                      fontWeight: 400,
                      color: "#999999",
                      marginTop: 2,
                    }}
                  >
                    {feat.desc}
                  </div>
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
          <HomeScreenContent />
        </PhoneMockup>
      </div>
    </AbsoluteFill>
  );
};
