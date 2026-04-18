import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Check, ChevronLeft, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  CLIENT_FLOATING_TAB_BAR_HEIGHT,
  getClientTabBarBottomInset,
} from '@/constants/clientTabBarInsets';
import { useColors } from '@/src/theme/ThemeProvider';

type Props = {
  safeAreaBottom: number;
  /** Override bottom inset (e.g. when client tab bar is hidden on this screen). */
  bottomInsetOverride?: number;
  labels: { barber: string; service: string; day: string; time: string; continue?: string };
  /**
   * Steps 1–3: chevron advances to next step.
   * Step 4: confirm variant = checkmark; gray until a time is chosen.
   */
  advanceNext?: {
    enabled: boolean;
    onPress: () => void;
    variant?: 'chevron' | 'confirm' | 'waitlist';
    loading?: boolean;
    label?: string;
  };
};

const DISABLED = '#c4c7cf';

// Side pills plus center icon-only step pill — keep in sync with layout
export const BOOKING_TABS_HEIGHT = 62;

/** Gap between client floating tab bar and booking step row (confirm / waitlist). */
const BOOKING_STEP_BAR_GAP_ABOVE_TAB = 8;

/**
 * Total bottom inset for scroll/time layers: client tab bar + gap + booking step bar.
 * Keeps content clear when both bars are visible (e.g. on book-appointment).
 */
export function getBookingStepBarTopFromBottom(safeAreaBottom: number): number {
  return (
    getClientTabBarBottomInset(safeAreaBottom) +
    CLIENT_FLOATING_TAB_BAR_HEIGHT +
    BOOKING_STEP_BAR_GAP_ABOVE_TAB +
    BOOKING_TABS_HEIGHT
  );
}

/** Same but without the client floating tab bar (use when tab bar is hidden on the screen). */
export function getBookingStepBarTopFromBottomNoTabBar(safeAreaBottom: number): number {
  return safeAreaBottom + BOOKING_STEP_BAR_GAP_ABOVE_TAB + BOOKING_TABS_HEIGHT;
}

/** Bottom inset for BookingStepTabs when tab bar is hidden. */
export function getBookingStepBarBottomInsetNoTabBar(safeAreaBottom: number): number {
  return safeAreaBottom + BOOKING_STEP_BAR_GAP_ABOVE_TAB;
}

/**
 * Scroll `paddingBottom` for the time-slot list on book-appointment.
 * The step row (`BOOKING_TABS_HEIGHT`) is omitted there when `advanceNext` is not passed, so using
 * `getBookingStepBarTopFromBottomNoTabBar + …` left a large empty band above the summary sheet.
 * This value matches the collapsed summary peek + handle overlap with the time step viewport.
 */
export function getBookingTimeSelectionScrollBottomPadding(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom + 44, 56);
}

export default function BookingStepTabs({
  safeAreaBottom,
  bottomInsetOverride,
  labels,
  advanceNext,
}: Props) {
  const bottomInset =
    bottomInsetOverride !== undefined
      ? bottomInsetOverride
      : getClientTabBarBottomInset(safeAreaBottom) +
        CLIENT_FLOATING_TAB_BAR_HEIGHT +
        BOOKING_STEP_BAR_GAP_ABOVE_TAB;
  const { primary } = useColors();

  const enabled = !!advanceNext?.enabled;
  const isLoading = !!advanceNext?.loading;
  const isConfirm = advanceNext?.variant === 'confirm';
  const isWaitlist = advanceNext?.variant === 'waitlist';
  const continueLabel = advanceNext?.label ?? (isWaitlist ? 'הצטרפות לרשימת המתנה' : (labels.continue ?? 'המשך'));

  const handleAdvance = () => {
    if (!enabled || isLoading || !advanceNext) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    advanceNext.onPress();
  };

  const showAdvance = !!advanceNext;

  if (!showAdvance) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.screenAnchor, { bottom: bottomInset }]}
    >
      <View style={[styles.root, styles.barDirection]} pointerEvents="box-none">

        {/* Waitlist / confirm — steps 3–4 when applicable */}
        {showAdvance && (
          <View style={[styles.pill, styles.center, styles.border, styles.pillBooking, styles.shadow]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !enabled || isLoading }}
              disabled={isLoading}
              onPress={handleAdvance}
              style={({ pressed }) => [styles.advancePressable, { opacity: pressed ? 0.82 : 1 }]}
            >
              <View style={styles.advanceFill}>
                {isLoading ? (
                  <ActivityIndicator color={primary} />
                ) : isConfirm ? (
                  <>
                    <Text style={[styles.advanceText, { color: enabled ? primary : DISABLED }]}>
                      {continueLabel}
                    </Text>
                    <Check size={20} color={enabled ? primary : DISABLED} strokeWidth={2.6} />
                  </>
                ) : isWaitlist ? (
                  <>
                    <Text style={[styles.advanceText, styles.advanceTextSmall, { color: primary }]}>
                      {continueLabel}
                    </Text>
                    <Clock size={18} color={primary} strokeWidth={2.4} />
                  </>
                ) : (
                  <>
                    <ChevronLeft size={20} color={enabled ? primary : DISABLED} strokeWidth={2.5} />
                    <Text style={[styles.advanceText, { color: enabled ? primary : DISABLED }]}>
                      {continueLabel}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenAnchor: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 100,
    justifyContent: 'center',
  },
  barDirection: {
    direction: 'ltr',
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    padding: 2,
  },
  pillBooking: {
    backgroundColor: '#ffffff',
    borderColor: '#F1F1F1',
  },
  single: {},
  center: {
    flex: 1,
    minWidth: 0,
  },
  border: {
    borderWidth: 1,
    borderColor: '#F1F1F1',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  advancePressable: {
    borderRadius: 999,
    overflow: 'hidden',
    flex: 1,
  },
  advanceFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  advanceText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  advanceTextSmall: {
    fontSize: 14,
  },
});
