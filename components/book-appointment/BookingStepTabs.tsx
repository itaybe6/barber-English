import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ChevronLeft, Home } from 'lucide-react-native';

import AnimatedTabs, { TabsPropsData } from '@/components/book-appointment/AnimatedTabs';
import { TabButton } from '@/components/shopify-tab-bar/tab-button';
import { useColors } from '@/src/theme/ThemeProvider';

type Step = 1 | 2 | 3 | 4;

type Props = {
  currentStep: Step;
  onChangeStep: (step: Step) => void;
  onBack: () => void;
  onHome: () => void;
  safeAreaBottom: number;
  labels: { barber: string; service: string; day: string; time: string };
  canGoService: boolean;
  canGoDay: boolean;
  canGoTime: boolean;
};

const INACTIVE = '#8a8a8a';

// Side pills (~50) and center AnimatedTabs stacked (~54+) — keep in sync with layout
export const BOOKING_TABS_HEIGHT = 62;

/** Distance from screen bottom to top edge of booking bar (matches ClientFloatingTabBar inset). */
export function getBookingStepBarTopFromBottom(safeAreaBottom: number): number {
  const bottomInset = safeAreaBottom > 0 ? safeAreaBottom + 2 : 8;
  return bottomInset + BOOKING_TABS_HEIGHT;
}

export default function BookingStepTabs({
  currentStep,
  onChangeStep,
  onBack,
  onHome,
  safeAreaBottom,
  labels,
  canGoService,
  canGoDay,
  canGoTime,
}: Props) {
  const { primary } = useColors();

  const bottomInset = safeAreaBottom > 0 ? safeAreaBottom + 2 : 8;

  const data = React.useMemo<TabsPropsData[]>(
    () => [
      { icon: 'User', label: labels.barber },
      { icon: 'Briefcase', label: labels.service },
      { icon: 'Calendar', label: labels.day },
      { icon: 'Clock', label: labels.time },
    ],
    [labels]
  );

  const selectedIndex = Math.max(0, Math.min(3, Number(currentStep) - 1));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.screenAnchor, { bottom: bottomInset }]}
    >
      {/* LTR: back always visual-left, home visual-right (independent of app RTL) */}
      <View style={[styles.root, styles.barDirection]} pointerEvents="box-none">
        <View style={[styles.pill, styles.single, styles.border, styles.shadow]}>
          <TabButton focused={false} activeColor={primary} onPress={onBack}>
            <ChevronLeft size={22} color={INACTIVE} />
          </TabButton>
        </View>

        <View style={[styles.pill, styles.center, styles.border, styles.shadow]}>
          <View style={styles.tabsInner}>
            <AnimatedTabs
              data={data}
              selectedIndex={selectedIndex}
              stacked
              onChange={(idx) => {
                const step = (idx + 1) as Step;
                if (step === 1) return onChangeStep(1);
                if (step === 2 && canGoService) return onChangeStep(2);
                if (step === 3 && canGoDay) return onChangeStep(3);
                if (step === 4 && canGoTime) return onChangeStep(4);
              }}
              activeColor="#ffffff"
              inactiveColor="#6b7280"
              activeBackgroundColor={primary}
              inactiveBackgroundColor="rgba(245,245,245,0.95)"
            />
          </View>
        </View>

        <View style={[styles.pill, styles.single, styles.border, styles.shadow]}>
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
  single: {},
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
