import React from 'react';
import { View } from 'react-native';
import { BlurView } from 'expo-blur';

import AnimatedTabs, { TabsPropsData } from '@/components/book-appointment/AnimatedTabs';

type Step = 1 | 2 | 3 | 4;

type Props = {
  currentStep: Step;
  onChangeStep: (step: Step) => void;
  safeAreaTop: number;
  labels: { barber: string; service: string; day: string; time: string };
  canGoService: boolean;
  canGoDay: boolean;
  canGoTime: boolean;
};

// Height of the floating tab bar (used by parent to compute TOP_OFFSET)
export const BOOKING_TABS_HEIGHT = 64;

export default function BookingStepTabs({
  currentStep,
  onChangeStep,
  safeAreaTop,
  labels,
  canGoService,
  canGoDay,
  canGoTime,
}: Props) {
  const data = React.useMemo<TabsPropsData[]>(
    () => [
      { icon: 'User' as any,      label: labels.barber  },
      { icon: 'Briefcase' as any, label: labels.service },
      { icon: 'Calendar' as any,  label: labels.day     },
      { icon: 'Clock' as any,     label: labels.time    },
    ],
    [labels]
  );

  const selectedIndex = Math.max(0, Math.min(3, Number(currentStep) - 1));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: safeAreaTop + 8,
        left: 0,
        right: 0,
        height: BOOKING_TABS_HEIGHT,
        paddingHorizontal: 12,
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      {/* Glass pill container */}
      <View
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.28)',
        }}
      >
        {/* Blur layer */}
        <BlurView
          intensity={20}
          tint="dark"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: 20,
          }}
        />
        {/* Semi-transparent dark tint */}
        <View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10,10,20,0.38)',
            borderRadius: 20,
          }}
        />

        {/* Tabs */}
        <View style={{ padding: 6 }}>
          <AnimatedTabs
            data={data}
            selectedIndex={selectedIndex}
            onChange={(idx) => {
              const step = (idx + 1) as Step;
              if (step === 1) return onChangeStep(1);
              if (step === 2 && canGoService) return onChangeStep(2);
              if (step === 3 && canGoDay) return onChangeStep(3);
              if (step === 4 && canGoTime) return onChangeStep(4);
            }}
            activeColor="#111827"
            inactiveColor="rgba(255,255,255,0.75)"
            activeBackgroundColor="rgba(255,255,255,0.97)"
            inactiveBackgroundColor="rgba(255,255,255,0.06)"
          />
        </View>
      </View>
    </View>
  );
}
