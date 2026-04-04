import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { CalendarDays, Check, ChevronLeft, Clock3, Home, Scissors, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { TabButton } from '@/components/shopify-tab-bar/tab-button';
import { getClientTabBarBottomInset } from '@/constants/clientTabBarInsets';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';

type Step = 1 | 2 | 3 | 4;

type Props = {
  currentStep: Step;
  onChangeStep: (step: Step) => void;
  onHome: () => void;
  safeAreaBottom: number;
  labels: { barber: string; service: string; day: string; time: string };
  canGoService: boolean;
  canGoDay: boolean;
  canGoTime: boolean;
  /**
   * Steps 1–3: chevron advances to next step.
   * Step 4: confirm variant = checkmark; gray until a time is chosen, then green = book.
   */
  advanceNext?: {
    enabled: boolean;
    onPress: () => void;
    variant?: 'chevron' | 'confirm';
    loading?: boolean;
  };
};

const INACTIVE = '#6b7280';
const DISABLED = '#c4c7cf';

/** Moss / forest greens — distinct from the old emerald→teal arrow. */
const BOOKING_TAB_SELECTED = '#15803d';
const BOOKING_TAB_SELECTED_DEEP = '#14532d';
/** Active “continue” — mint → grass → deep forest */
const ADVANCE_GRADIENT = ['#86efac', '#22c55e', BOOKING_TAB_SELECTED_DEEP] as const;
const ADVANCE_GRADIENT_LOCATIONS = [0, 0.45, 1] as const;

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
  canGoService,
  canGoDay,
  canGoTime,
  advanceNext,
}: Props) {
  const bottomInset = getClientTabBarBottomInset(safeAreaBottom);
  const { primary } = useColors();
  const { onPrimary } = usePrimaryContrast();

  const steps = React.useMemo(
    () => [
      {
        step: 4 as Step,
        enabled: canGoTime,
        label: labels.time,
        icon: Clock3,
      },
      {
        step: 3 as Step,
        enabled: canGoDay,
        label: labels.day,
        icon: CalendarDays,
      },
      {
        step: 2 as Step,
        enabled: canGoService,
        label: labels.service,
        icon: Scissors,
      },
      {
        step: 1 as Step,
        enabled: true,
        label: labels.barber,
        icon: User,
      },
    ],
    [canGoDay, canGoService, canGoTime, labels]
  );

  const getStepIconColor = (step: Step, enabled: boolean) => {
    if (currentStep === step) return onPrimary;
    return enabled ? INACTIVE : DISABLED;
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.screenAnchor, { bottom: bottomInset }]}
    >
      {/* LTR: advance visual-left, home visual-right (independent of app RTL) */}
      <View style={[styles.root, styles.barDirection]} pointerEvents="box-none">
        {advanceNext ? (
          <View
            style={[
              styles.pill,
              styles.single,
              styles.border,
              styles.pillBooking,
              advanceNext.enabled && !advanceNext.loading ? styles.advancePillActive : styles.shadow,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !advanceNext.enabled || !!advanceNext.loading,
              }}
              disabled={!advanceNext.enabled || !!advanceNext.loading}
              onPress={() => {
                if (!advanceNext.enabled || advanceNext.loading) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
                advanceNext.onPress();
              }}
              style={({ pressed }) => [
                styles.advancePressable,
                {
                  opacity:
                    advanceNext.loading
                      ? 0.65
                      : !advanceNext.enabled
                        ? 0.5
                        : pressed
                          ? 0.9
                          : 1,
                },
              ]}
            >
              {advanceNext.loading ? (
                <View style={[styles.advanceInner, styles.advanceLoadingFill]}>
                  <ActivityIndicator color={BOOKING_TAB_SELECTED} />
                </View>
              ) : advanceNext.enabled ? (
                <LinearGradient
                  colors={[...ADVANCE_GRADIENT]}
                  locations={[...ADVANCE_GRADIENT_LOCATIONS]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.advanceGradientFill}
                >
                  {advanceNext.variant === 'confirm' ? (
                    <Check size={22} color="#ecfdf5" strokeWidth={2.8} />
                  ) : (
                    <ChevronLeft size={22} color="#ecfdf5" strokeWidth={2.5} />
                  )}
                </LinearGradient>
              ) : (
                <View style={[styles.advanceInner, styles.advanceDisabledFill]}>
                  {advanceNext.variant === 'confirm' ? (
                    <Check size={22} color={INACTIVE} strokeWidth={2.6} />
                  ) : (
                    <ChevronLeft size={22} color={INACTIVE} strokeWidth={2.4} />
                  )}
                </View>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.pill, styles.center, styles.border, styles.pillBooking, styles.shadow]}>
          <View style={styles.tabsInner}>
            {steps.map(({ step, enabled, label, icon: Icon }) => (
              <TabButton
                key={step}
                focused={currentStep === step}
                activeColor={primary}
                onPress={() => {
                  if (!enabled) return;
                  onChangeStep(step);
                }}
                accessibilityLabel={label}
                accessibilityRole="tab"
                buttonPadding={12}
              >
                <Icon size={20} color={getStepIconColor(step, enabled)} />
              </TabButton>
            ))}
          </View>
        </View>

        <View style={[styles.pill, styles.single, styles.border, styles.pillBooking, styles.shadow]}>
          <TabButton focused={false} activeColor={primary} onPress={onHome}>
            <Home size={22} color={INACTIVE} />
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
  advancePillActive: {
    borderColor: 'rgba(20, 83, 45, 0.38)',
    shadowColor: BOOKING_TAB_SELECTED_DEEP,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 11,
    elevation: 7,
  },
  advancePressable: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  advanceInner: {
    padding: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanceGradientFill: {
    padding: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  advanceDisabledFill: {
    backgroundColor: '#ffffff',
  },
  advanceLoadingFill: {
    backgroundColor: '#f0fdf4',
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  tabsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
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
});
