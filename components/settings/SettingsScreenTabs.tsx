import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  I18nManager,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

export interface SettingsTabItem {
  id: string;
  label: string;
}

interface SettingsScreenTabsProps {
  tabs: SettingsTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  accentColor: string;
  /** When true, row is centered horizontally (e.g. only 2 tabs). */
  centerRow?: boolean;
}

/** Physics for sliding the underline between tabs */
const UNDERLINE_SPRING = {
  damping: 20,
  stiffness: 340,
  mass: 0.48,
  restSpeedThreshold: 0.02,
  restDisplacementThreshold: 0.02,
};

const UNDERLINE_INSET = 6;

/**
 * Full-width horizontal tabs, no grey track.
 * Active tab: bold text + primary-color underline that slides smoothly between items.
 */
export function SettingsScreenTabs({
  tabs,
  activeId,
  onSelect,
  accentColor,
  centerRow = false,
}: SettingsScreenTabsProps) {
  /**
   * RTL: `row-reverse` makes visual order correct but `onLayout.x` no longer matches the same
   * coordinate space as `position:absolute; left:0` + translateX for the indicator (RN/Yoga quirk).
   * Reverse tab *order* in the tree and lay out with explicit LTR row so x/width align with the line.
   */
  const orderedTabs = useMemo(
    () => (I18nManager.isRTL ? [...tabs].reverse() : tabs),
    [tabs],
  );

  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  /** Subtle “squash” while moving, then spring open — feels more alive than a linear slide */
  const indicatorScaleY = useSharedValue(1);

  const moveIndicator = useCallback((id: string) => {
    const m = layouts.current[id];
    if (!m || m.width <= 0) return;
    const w = Math.max(m.width - UNDERLINE_INSET * 2, 12);
    const x = m.x + UNDERLINE_INSET;
    indicatorX.value = withSpring(x, UNDERLINE_SPRING);
    indicatorW.value = withSpring(w, UNDERLINE_SPRING);
    indicatorScaleY.value = withSequence(
      withTiming(0.55, { duration: 55, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 14, stiffness: 420, mass: 0.35 }),
    );
  }, []);

  useLayoutEffect(() => {
    moveIndicator(activeId);
  }, [activeId, orderedTabs, moveIndicator]);

  const onTabLayout = (id: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts.current[id] = { x, width };
    if (id === activeId && width > 0) {
      const w = Math.max(width - UNDERLINE_INSET * 2, 12);
      indicatorX.value = x + UNDERLINE_INSET;
      indicatorW.value = w;
    }
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }, { scaleY: indicatorScaleY.value }],
    width: indicatorW.value,
  }));

  return (
    <View style={styles.outer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        bounces={false}
        alwaysBounceHorizontal={false}
        removeClippedSubviews={false}
        contentContainerStyle={centerRow ? styles.scrollContentCentered : undefined}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' as const } : {})}
      >
        <View style={styles.row}>
          {orderedTabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <Pressable
                key={tab.id}
                onLayout={onTabLayout(tab.id)}
                onPress={() => onSelect(tab.id)}
                style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    active ? styles.tabLabelActive : styles.tabLabelIdle,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { backgroundColor: accentColor },
              indicatorStyle,
            ]}
            collapsable={false}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    /** Keeps tab `onLayout.x` consistent with absolute indicator (see orderedTabs for RTL order). */
    direction: 'ltr',
    alignItems: 'flex-end',
    minHeight: 44,
    paddingBottom: 3,
  },
  tab: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: 'flex-end',
  },
  tabPressed: {
    opacity: 0.75,
  },
  tabLabel: {
    fontSize: 15,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  tabLabelIdle: {
    color: '#8E8E93',
    fontWeight: '500',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 1.5,
    zIndex: 4,
    ...Platform.select({
      android: { elevation: 2 },
    }),
  },
});
