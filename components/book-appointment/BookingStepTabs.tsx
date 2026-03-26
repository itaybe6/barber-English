import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ChevronLeft, Home } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import AnimatedTabs, { TabsPropsData } from '@/components/book-appointment/AnimatedTabs';
import { TabButton } from '@/components/shopify-tab-bar/tab-button';
import { getClientTabBarBottomInset } from '@/constants/clientTabBarInsets';

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
  /** Next-step control (replaces inline Continue buttons on steps 1–3). Hidden on step 4. */
  advanceNext?: { enabled: boolean; onPress: () => void };
};

const INACTIVE = '#6b7280';

/** Moss / forest greens — distinct from the old emerald→teal arrow. */
const BOOKING_TAB_SELECTED = '#15803d';
const BOOKING_TAB_SELECTED_DEEP = '#14532d';
const INACTIVE_TAB_BG = 'rgba(236, 253, 245, 0.98)';
/** Active “continue” — mint → grass → deep forest */
const ADVANCE_GRADIENT = ['#86efac', '#22c55e', BOOKING_TAB_SELECTED_DEEP] as const;
const ADVANCE_GRADIENT_LOCATIONS = [0, 0.45, 1] as const;

// Side pills (~50) and center AnimatedTabs stacked (~54+) — keep in sync with layout
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

  /** Visual order (LTR): time → day → service → barber */
  const data = React.useMemo<TabsPropsData[]>(
    () => [
      { icon: 'Clock', label: labels.time },
      { icon: 'Calendar', label: labels.day },
      { icon: 'Briefcase', label: labels.service },
      { icon: 'User', label: labels.barber },
    ],
    [labels]
  );

  const selectedIndex = Math.max(0, Math.min(3, 4 - Number(currentStep)));

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
              advanceNext.enabled ? styles.advancePillActive : styles.shadow,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !advanceNext.enabled }}
              disabled={!advanceNext.enabled}
              onPress={() => {
                if (!advanceNext.enabled) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
                advanceNext.onPress();
              }}
              style={({ pressed }) => [
                styles.advancePressable,
                { opacity: !advanceNext.enabled ? 0.5 : pressed ? 0.9 : 1 },
              ]}
            >
              {advanceNext.enabled ? (
                <LinearGradient
                  colors={[...ADVANCE_GRADIENT]}
                  locations={[...ADVANCE_GRADIENT_LOCATIONS]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.advanceGradientFill}
                >
                  <ChevronLeft size={22} color="#ecfdf5" strokeWidth={2.5} />
                </LinearGradient>
              ) : (
                <View style={[styles.advanceInner, styles.advanceDisabledFill]}>
                  <ChevronLeft size={22} color={INACTIVE} strokeWidth={2.4} />
                </View>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.pill, styles.center, styles.border, styles.pillBooking, styles.shadow]}>
          <View style={styles.tabsInner}>
            <AnimatedTabs
              data={data}
              selectedIndex={selectedIndex}
              stacked
              rtlMirror={false}
              onChange={(idx) => {
                const step = (4 - idx) as Step;
                if (step === 1) return onChangeStep(1);
                if (step === 2 && canGoService) return onChangeStep(2);
                if (step === 3 && canGoDay) return onChangeStep(3);
                if (step === 4 && canGoTime) return onChangeStep(4);
              }}
              activeColor="#ffffff"
              inactiveColor="#4b5563"
              activeBackgroundColor={BOOKING_TAB_SELECTED}
              inactiveBackgroundColor={INACTIVE_TAB_BG}
            />
          </View>
        </View>

        <View style={[styles.pill, styles.single, styles.border, styles.pillBooking, styles.shadow]}>
          <TabButton focused={false} activeColor={BOOKING_TAB_SELECTED} onPress={onHome}>
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
    backgroundColor: '#f5fbf7',
    borderColor: 'rgba(21, 128, 61, 0.14)',
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
  center: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  tabsInner: {
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
