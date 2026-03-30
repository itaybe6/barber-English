import React, { useEffect, useMemo } from 'react';
import {
  I18nManager,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r + g + b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

const shadowStyle = Platform.select({
  ios: {
    shadowColor: '#1a2744',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
});

export interface SettingsCategoryAccordionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** First block under the sticky profile header — extra top spacing */
  isFirst?: boolean;
  accentColor?: string;
  /** Category icon (e.g. Lucide); shown in a soft tinted pill */
  icon?: React.ReactNode;
}

/**
 * Collapsible settings category: tap header to expand/collapse body with height animation.
 * RTL: row order follows reading direction so title and chevron stay adjacent (no huge gap).
 */
export function SettingsCategoryAccordion({
  title,
  expanded,
  onToggle,
  children,
  isFirst,
  accentColor = Colors.primary,
  icon,
}: SettingsCategoryAccordionProps) {
  const contentH = useSharedValue(0);
  const animH = useSharedValue(0);
  const rotation = useSharedValue(0);

  const iconBg = useMemo(() => hexToRgba(accentColor, 0.12), [accentColor]);
  const headerTint = useMemo(() => hexToRgba(accentColor, expanded ? 0.09 : 0.03), [accentColor, expanded]);
  const stripeColor = useMemo(() => hexToRgba(accentColor, 0.55), [accentColor]);

  const onInnerLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - contentH.value) > 0.5) {
      contentH.value = h;
      if (expanded) {
        animH.value = withTiming(h, { duration: 280, easing: Easing.out(Easing.cubic) });
      }
    }
  };

  useEffect(() => {
    if (expanded) {
      const target = contentH.value;
      if (target > 0) {
        animH.value = withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) });
      }
    } else {
      animH.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.cubic) });
    }
  }, [expanded]);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [expanded]);

  const collapsibleStyle = useAnimatedStyle(() => ({
    height: animH.value,
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggle();
  };

  /**
   * Outer: LTR [inner | chevron], RTL row-reverse → chevron on visual left, block on right.
   * Inner: row (RN mirrors in RTL) so icon + title stay adjacent without a huge empty band.
   */
  const headerMainDir = I18nManager.isRTL ? 'row-reverse' : 'row';

  const edgeAccent = I18nManager.isRTL
    ? { borderRightWidth: 3, borderRightColor: stripeColor, borderLeftWidth: StyleSheet.hairlineWidth }
    : { borderLeftWidth: 3, borderLeftColor: stripeColor, borderRightWidth: StyleSheet.hairlineWidth };

  return (
    <View style={[styles.card, isFirst && styles.cardFirst, shadowStyle, edgeAccent]}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.header,
          { flexDirection: headerMainDir, backgroundColor: headerTint },
          pressed && styles.headerPressed,
          expanded && styles.headerExpanded,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerTextBlock}>
          {icon ? (
            <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>{icon}</View>
          ) : null}
          <Text
            style={[
              styles.title,
              I18nManager.isRTL ? styles.titleRtl : styles.titleLtr,
              !icon && styles.titleNoIcon,
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
        <Reanimated.View style={[styles.chevronWrap, chevronStyle]}>
          <View style={[styles.chevronCircle, { borderColor: hexToRgba(accentColor, 0.22) }]}>
            <ChevronDown size={18} color={accentColor} strokeWidth={2.4} />
          </View>
        </Reanimated.View>
      </Pressable>
      <Reanimated.View style={[collapsibleStyle, expanded && styles.bodyShell]}>
        <View
          style={styles.measureWrap}
          onLayout={onInnerLayout}
          pointerEvents={expanded ? 'auto' : 'none'}
          collapsable={false}
        >
          <View style={styles.body}>{children}</View>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.1)',
  },
  cardFirst: {
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingStart: 14,
    paddingEnd: 12,
    gap: 10,
    minHeight: 56,
  },
  headerTextBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerPressed: {
    opacity: 0.92,
  },
  headerExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.1)',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.25,
    lineHeight: 22,
  },
  titleNoIcon: {
    paddingStart: 2,
  },
  titleLtr: {
    textAlign: 'left',
  },
  titleRtl: {
    textAlign: 'right',
  },
  chevronWrap: {
    flexShrink: 0,
  },
  chevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  bodyShell: {
    backgroundColor: 'rgba(246, 247, 249, 0.96)',
  },
  measureWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  /** Nested sheet: reads as “content inside the category” */
  body: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
    paddingBottom: 4,
    paddingTop: 2,
    backgroundColor: Colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.07)',
  },
});
