import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Home, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { TabButton } from '@/components/shopify-tab-bar/tab-button';
import { getClientTabBarBottomInset } from '@/constants/clientTabBarInsets';
import { useColors } from '@/src/theme/ThemeProvider';

type Step = 1 | 2 | 3 | 4;

type Props = {
  currentStep: Step;
  onChangeStep: (step: Step) => void;
  onHome: () => void;
  safeAreaBottom: number;
  labels: { barber: string; service: string; day: string; time: string; continue?: string };
  canGoService: boolean;
  canGoDay: boolean;
  canGoTime: boolean;
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

/** Distance from screen bottom to top edge of booking bar (matches ClientFloatingTabBar inset). */
export function getBookingStepBarTopFromBottom(safeAreaBottom: number): number {
  return getClientTabBarBottomInset(safeAreaBottom) + BOOKING_TABS_HEIGHT;
}

export default function BookingStepTabs({
  currentStep,
  onChangeStep,
  onHome,
  safeAreaBottom,
  labels,
  advanceNext,
}: Props) {
  const bottomInset = getClientTabBarBottomInset(safeAreaBottom);
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

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep === 1) {
      onHome();
    } else {
      onChangeStep((currentStep - 1) as Step);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.screenAnchor, { bottom: bottomInset }]}
    >
      <View style={[styles.root, styles.barDirection]} pointerEvents="box-none">

        {/* Wide action button — waitlist / confirm only (steps 1-3 use scroll to advance) */}
        {advanceNext && (
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

        {/* Right pill — Home on step 1, back arrow on steps 2-4 */}
        <View style={[styles.pill, styles.single, styles.border, styles.pillBooking, styles.shadow]}>
          <TabButton focused={false} activeColor={primary} onPress={handleBack}>
            {currentStep === 1 ? (
              <Home size={22} color="#6b7280" />
            ) : (
              <ChevronRight size={22} color="#6b7280" strokeWidth={2.2} />
            )}
          </TabButton>
        </View>

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
