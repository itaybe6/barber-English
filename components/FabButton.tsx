import React from 'react';
import {
  I18nManager,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Entypo } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { useColors } from '@/src/theme/ThemeProvider';

const DEFAULT_DURATION = 500;

export interface FabButtonProps {
  onPress: () => void;
  isOpen: boolean;
  children: React.ReactNode;
  panelStyle?: ViewStyle;
  duration?: number;
  openedSize?: number;
  closedSize?: number;
  bottom?: number;
  horizontalInset?: number;
  grabberColor?: string;
  /** When true, no floating X — put close in your own header to avoid extra top padding. */
  hideCloseButton?: boolean;
}

export function FabButton({
  onPress,
  isOpen,
  children,
  panelStyle,
  duration = DEFAULT_DURATION,
  openedSize: openedSizeProp,
  closedSize = 60,
  bottom = 80,
  horizontalInset = 16,
  grabberColor,
  hideCloseButton = false,
}: FabButtonProps) {
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const openedSize = openedSizeProp ?? screenW * 0.92;
  const spacing = closedSize * 0.18;
  const closeIconSize = Math.round(closedSize * 0.32);
  const openIconSize = Math.round(closedSize * 0.48);

  const openBg = colors.surface;
  const closedBg = colors.primary;
  const iconOnClosed = '#FFFFFF';
  const iconOnOpen = colors.text;

  const openWidth = Math.min(openedSize, screenW - horizontalInset * 2);
  /** סגור: פינה; פתוח: ממורכז אופקית כדי שלא תהיה סטייה */
  const horizontalStyle = isOpen
    ? { left: Math.max(horizontalInset, (screenW - openWidth) / 2) }
    : I18nManager.isRTL
      ? { left: horizontalInset }
      : { right: horizontalInset };

  /** Icon + Pressable padding (6 each side) — keep text from sitting under the hit target */
  const closeBtnOuterH = closeIconSize + 12;
  /**
   * Close sits in the physical top-end corner; content uses symmetric horizontal padding.
   * (Asymmetric reserve for LTR+Hebrew text caused a large empty band on the leading edge.)
   */
  const openPaddingH = 18;
  const closeBtnEndInset = openPaddingH - 2;

  /**
   * Close is absolutely positioned (top: closeBtnTop) and does not reserve flow space.
   * Flow starts after grabber; without extra top padding the first line of children overlaps the X.
   */
  const closeBtnTop = 20;
  const grabberFlowEnd = 4 + 4 + 10;
  const closeBottom = closeBtnTop + closeBtnOuterH;
  const rtlContentPaddingTop = hideCloseButton
    ? 4
    : Math.max(2, closeBottom - grabberFlowEnd + 10);

  return (
    <Animated.View
      layout={LinearTransition.duration(duration)}
      style={[
        styles.panel,
        horizontalStyle,
        { bottom },
        {
          width: isOpen ? openWidth : closedSize,
          minHeight: isOpen ? undefined : closedSize,
          borderRadius: isOpen ? 22 : closedSize / 2,
          backgroundColor: isOpen ? openBg : closedBg,
          paddingTop: isOpen ? spacing * 1.2 : 0,
          paddingHorizontal: isOpen ? openPaddingH : 0,
          paddingBottom: isOpen ? spacing * 1.2 : 0,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: isOpen ? 10 : 6 },
              shadowOpacity: isOpen ? 0.12 : 0.25,
              shadowRadius: isOpen ? 20 : 12,
            },
            android: { elevation: isOpen ? 10 : 8 },
          }),
        },
        panelStyle,
      ]}
    >
      {!isOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="פתיחה"
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Entypo name="plus" size={openIconSize} color={iconOnClosed} />
          </View>
        </>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={styles.openInner}
        >
          <View
            style={[
              styles.grabber,
              { backgroundColor: grabberColor ?? colors.primary },
              hideCloseButton ? { marginBottom: 6 } : null,
            ]}
          />
          {!hideCloseButton ? (
            <Pressable
              onPress={onPress}
              hitSlop={12}
              style={[styles.closeBtn, { top: closeBtnTop, right: closeBtnEndInset }]}
              accessibilityRole="button"
              accessibilityLabel="סגירה"
            >
              <Entypo name="cross" size={closeIconSize} color={iconOnOpen} />
            </Pressable>
          ) : null}
          <View
            style={[
              styles.rtlContent,
              { direction: I18nManager.isRTL ? 'rtl' : 'ltr', paddingTop: rtlContentPaddingTop },
            ]}
          >
            {children}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 10001,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  openInner: {
    width: '100%',
    paddingTop: 4,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
    opacity: 0.85,
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 10,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rtlContent: {
    width: '100%',
    alignItems: 'stretch',
  },
});
