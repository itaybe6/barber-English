import { Entypo } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutDown,
  KeyboardState,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';

const AnimatedEntypo = Animated.createAnimatedComponent(Entypo);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_DURATION = 500;

export type CalendarReminderFabPanelProps = {
  isOpen: boolean;
  onFabPress: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** צבע כפתור ה־FAB כשהפאנל סגור */
  backgroundColor: string;
  isRtl: boolean;
  panelStyle?: ViewStyle;
  duration?: number;
  openedWidth?: number;
  closedSize?: number;
  fabAccessibilityLabel?: string;
  /** כפתור הפלוס מחוץ לפאנל (למשל בסרגל הטאבים); האנימציה נשארת עם LinearTransition */
  externalTriggerOnly?: boolean;
  /** גודל כפתור הפלוס במסך — כיווץ סגור מתאים לכפתור כדי שההתרחבות תתחיל ממנו */
  externalAnchorSize?: { width: number; height: number } | null;
};

export function CalendarReminderFabPanel({
  isOpen,
  onFabPress,
  title,
  subtitle,
  children,
  backgroundColor,
  isRtl,
  panelStyle,
  duration = DEFAULT_DURATION,
  openedWidth = SCREEN_WIDTH * 0.88,
  closedSize = 56,
  fabAccessibilityLabel,
  externalTriggerOnly = false,
  externalAnchorSize = null,
}: CalendarReminderFabPanelProps) {
  const spacing = closedSize * 0.2;
  const closeIconSize = closedSize * 0.32;
  const openIconSize = closedSize * 0.5;
  /** מניעת מעבר מיידי לבן→צבע כהה בזמן ש-Layout עדיין מכווץ את הפאנל */
  const [holdWhiteUntilShrinkDone, setHoldWhiteUntilShrinkDone] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (externalTriggerOnly) {
      wasOpenRef.current = isOpen;
      setHoldWhiteUntilShrinkDone(false);
      return;
    }
    if (isOpen) {
      wasOpenRef.current = true;
      setHoldWhiteUntilShrinkDone(false);
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setHoldWhiteUntilShrinkDone(true);
      const t = setTimeout(() => setHoldWhiteUntilShrinkDone(false), duration);
      return () => clearTimeout(t);
    }
  }, [isOpen, duration, externalTriggerOnly]);

  const whiteSurface =
    isOpen || (!externalTriggerOnly && holdWhiteUntilShrinkDone);
  const fabFullyCollapsed = !isOpen && !holdWhiteUntilShrinkDone;
  const collapsedExternal = externalTriggerOnly && !isOpen;
  const anchorW = externalAnchorSize?.width ?? 0;
  const anchorH = externalAnchorSize?.height ?? 0;
  const hasAnchorDims = anchorW > 0 && anchorH > 0;
  const collapsedW =
    collapsedExternal && hasAnchorDims ? anchorW : collapsedExternal ? 0 : closedSize;
  const collapsedH =
    collapsedExternal && hasAnchorDims ? anchorH : collapsedExternal ? 0 : closedSize;

  const { height: keyboardHeight, state } = useAnimatedKeyboard();

  const keyboardHeightStyle = useAnimatedStyle(() => {
    return {
      marginBottom:
        state.value === KeyboardState.OPEN ? Math.max(0, keyboardHeight.value - 72 + spacing) : 0,
    };
  });

  /** טריגר חיצוני משמאל — עוגן שמאלי; בלי זה ב־RTL הרוחב עלול להתרחב מימין */
  const iconAnchor = externalTriggerOnly
    ? ({ left: 0 as const } as const)
    : isRtl
      ? { left: 0 as const }
      : { right: 0 as const };

  return (
    <Animated.View
      style={[
        styles.panel,
        panelStyle,
        externalTriggerOnly && ({ direction: 'ltr' } as ViewStyle),
        {
          width: isOpen ? openedWidth : collapsedW,
          minHeight: collapsedExternal ? collapsedH : closedSize,
          maxHeight: isOpen ? SCREEN_HEIGHT * 0.88 : collapsedH,
          borderRadius: collapsedExternal
            ? hasAnchorDims
              ? anchorH / 2
              : 0
            : closedSize / 2,
          padding: collapsedExternal ? 0 : spacing,
          opacity: collapsedExternal ? 0 : 1,
          backgroundColor: whiteSurface ? '#FFFFFF' : backgroundColor,
          borderWidth: whiteSurface ? StyleSheet.hairlineWidth : 0,
          borderColor: whiteSurface ? '#E8EAED' : 'transparent',
        },
        keyboardHeightStyle,
      ]}
      layout={LinearTransition.duration(duration)}
      pointerEvents={collapsedExternal ? 'none' : 'auto'}
    >
      {(!externalTriggerOnly || isOpen) ? (
        <TouchableWithoutFeedback
          onPress={onFabPress}
          accessibilityRole="button"
          accessibilityLabel={fabAccessibilityLabel}
          accessibilityState={{ expanded: isOpen }}
        >
          <Animated.View
            style={[
              {
                justifyContent: 'center',
                alignItems: 'center',
                position: 'absolute',
                top: 0,
                width: closedSize,
                height: closedSize,
                zIndex: 2,
              },
              iconAnchor,
            ]}
            layout={LinearTransition.duration(duration)}
          >
            {isOpen ? (
              <AnimatedEntypo
                key="close"
                name="cross"
                size={closeIconSize}
                color="#3C4043"
                entering={FadeIn.duration(duration)}
                exiting={FadeOut.duration(duration)}
              />
            ) : !externalTriggerOnly ? (
              <AnimatedEntypo
                key="open"
                name="plus"
                size={openIconSize}
                color={fabFullyCollapsed ? '#FFFFFF' : '#3C4043'}
                entering={FadeIn.duration(duration)}
                exiting={FadeOut.duration(duration)}
              />
            ) : null}
          </Animated.View>
        </TouchableWithoutFeedback>
      ) : null}

      {isOpen ? (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={[styles.openBody, { paddingTop: closedSize * 0.15, gap: spacing * 1.25 }]}
        >
          <View style={styles.header}>
            <Text style={styles.heading} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={4}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.innerCard}>{children}</View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
  },
  openBody: {
    width: '100%',
  },
  header: {
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  heading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    textAlign: 'center',
    lineHeight: 17,
    writingDirection: 'rtl',
  },
  innerCard: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: SCREEN_HEIGHT * 0.58,
  },
});
