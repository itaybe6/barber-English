import { Easing, FadeInUp } from 'react-native-reanimated';

export const BOOKING_STEP_ROW_ENTER_BASE_MS = 60;
export const BOOKING_STEP_ROW_STAGGER_MS = 80;
export const BOOKING_STEP_ROW_ENTER_DURATION_MS = 340;
export const BOOKING_STEP_ROW_DRIFT_PX = 8;

/** Time step section headers — short delay so the grid appears quickly. */
const BOOKING_TIME_ROW_ENTER_BASE_MS = 30;
const BOOKING_TIME_ROW_STAGGER_MS = 50;
const BOOKING_TIME_ROW_ENTER_DURATION_MS = 260;
const BOOKING_TIME_ROW_DRIFT_PX = 6;

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

/**
 * Same motion as {@link bookingStepRowEntering}, tuned for time UI.
 * Use on section/header rows only — never on every slot cell (large slot counts stall the UI thread).
 */
export function bookingTimeRowEntering(index: number) {
  return FadeInUp.duration(BOOKING_TIME_ROW_ENTER_DURATION_MS)
    .easing(Easing.out(Easing.cubic))
    .delay(BOOKING_TIME_ROW_ENTER_BASE_MS + index * BOOKING_TIME_ROW_STAGGER_MS)
    .withInitialValues({
      opacity: 0,
      transform: [{ translateY: -BOOKING_TIME_ROW_DRIFT_PX }],
    });
}
