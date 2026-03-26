import React from "react";
import { Composition } from "remotion";
import { BarberDemo } from "./Composition";

// Total: 530 scene frames - 80 transition frames (4 × 20) = 450 frames @ 30fps = 15 seconds
const TOTAL_DURATION = 450;

export const Root: React.FC = () => {
  return (
    <Composition
      id="BarberDemo"
      component={BarberDemo}
      durationInFrames={TOTAL_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
