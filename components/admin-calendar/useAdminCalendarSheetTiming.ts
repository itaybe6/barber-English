import { useMemo } from 'react';
import { Easing } from 'react-native-reanimated';
import { useBottomSheetTimingConfigs } from '@gorhom/bottom-sheet';

/**
 * Shared open/close curve for admin calendar bottom sheets (+ menu, constraints, reminders).
 *
 * `Easing.out(Easing.sin)` starts at ~1.57× velocity (vs cubic's 3×), so a late first frame
 * causes a smaller visual "jump". The deceleration to zero is smooth with no abrupt stop.
 * 380 ms gives more frames at 60 fps, making individual dropped frames less noticeable.
 */
export function useAdminCalendarSheetTimingConfig() {
  return useBottomSheetTimingConfigs(
    useMemo(
      () => ({
        duration: 300,
        easing: Easing.out(Easing.sin),
      }),
      [],
    ),
  );
}
