import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { IntroScene } from "./scenes/IntroScene";
import { HomeScene } from "./scenes/HomeScene";
import { BookingScene } from "./scenes/BookingScene";
import { CalendarScene } from "./scenes/CalendarScene";
import { OutroScene } from "./scenes/OutroScene";

// Transition duration in frames (20 frames each × 4 transitions = 80 frames)
// Scene durations: 120 + 100 + 100 + 100 + 110 = 530
// Net total: 530 - 80 = 450 frames = 15 seconds at 30fps
const T = 20;

export const BarberDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0A" }}>
      <TransitionSeries>
        {/* Scene 1: Intro / Brand reveal (120 frames = 4s) */}
        <TransitionSeries.Sequence durationInFrames={120} premountFor={T}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />

        {/* Scene 2: Home screen showcase (100 frames) */}
        <TransitionSeries.Sequence durationInFrames={100} premountFor={T}>
          <HomeScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />

        {/* Scene 3: Booking flow (100 frames) */}
        <TransitionSeries.Sequence durationInFrames={100} premountFor={T}>
          <BookingScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />

        {/* Scene 4: Calendar / time selection (100 frames) */}
        <TransitionSeries.Sequence durationInFrames={100} premountFor={T}>
          <CalendarScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />

        {/* Scene 5: CTA / outro (110 frames) */}
        <TransitionSeries.Sequence durationInFrames={110} premountFor={T}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
