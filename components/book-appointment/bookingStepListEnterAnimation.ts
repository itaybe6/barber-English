import { Easing, FadeInUp } from 'react-native-reanimated';

export const BOOKING_STEP_ROW_ENTER_BASE_MS = 200;
export const BOOKING_STEP_ROW_STAGGER_MS = 150;
export const BOOKING_STEP_ROW_ENTER_DURATION_MS = 720;
export const BOOKING_STEP_ROW_DRIFT_PX = 10;

/** Fade + short drift down from above — staff / service step lists. */
export function bookingStepRowEntering(index: number) {
  return FadeInUp.duration(BOOKING_STEP_ROW_ENTER_DURATION_MS)
    .easing(Easing.out(Easing.cubic))
    .delay(BOOKING_STEP_ROW_ENTER_BASE_MS + index * BOOKING_STEP_ROW_STAGGER_MS)
    .withInitialValues({
      opacity: 0,
      transform: [{ translateY: -BOOKING_STEP_ROW_DRIFT_PX }],
    });
}
