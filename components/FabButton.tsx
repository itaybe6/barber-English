import React, { useEffect } from 'react';
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
import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
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
  /**
   * When false, skips Reanimated layout transition on the panel. Use when `bottom` is driven by
   * the keyboard — otherwise `bottom` animates slowly and the sheet stays under the keyboard.
   */
  enablePanelLayoutAnimation?: boolean;
  /** When set, replaces the centered “+” in the closed state (e.g. waitlist pill). */
  closedChildren?: React.ReactNode;
  /** Width when closed and `closedChildren` is set; capped to screen. */
  closedWidth?: number;
  closedAccessibilityLabel?: string;
  /**
   * `floating` — absolute over the screen (default). `inline` — in document flow (e.g. inside ScrollView).
   */
  layoutMode?: 'floating' | 'inline';
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
  enablePanelLayoutAnimation = true,
  closedChildren,
  closedWidth: closedWidthProp,
  closedAccessibilityLabel,
  layoutMode = 'floating',
}: FabButtonProps) {
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const isInline = layoutMode === 'inline';
  const openedSize = openedSizeProp ?? screenW * 0.92;
  const spacing = closedSize * 0.18;
  const closeIconSize = Math.round(closedSize * 0.32);
  const openIconSize = Math.round(closedSize * 0.48);

  const openBg = colors.surface;
  const closedBg = colors.primary;
  const iconOnClosed = '#FFFFFF';
  const iconOnOpen = colors.text;

  const openWidth = Math.min(openedSize, screenW - horizontalInset * 2);
  const closedPanelWidth =
    closedChildren != null
      ? Math.min(closedWidthProp ?? screenW - horizontalInset * 2, screenW - horizontalInset * 2)
      : closedSize;

  /**
   * Drive `bottom` via a SharedValue so Reanimated 4 propagates the change to the UI thread
   * synchronously — plain { bottom } in a style array is picked up only on the next React commit
   * and arrives too late when the keyboard fires keyboardWillShow.
   */
  const bottomSV = useSharedValue(bottom);
  useEffect(() => {
    bottomSV.value = bottom;
  }, [bottom, bottomSV]);
  const panelBottomStyle = useAnimatedStyle(() => ({ bottom: bottomSV.value }));
  /** סגור: פינה; פתוח: ממורכז אופקית כדי שלא תהיה סטייה — או inline במרכז / רוחב מלא */
  const horizontalStyle = isInline
    ? isOpen
      ? { alignSelf: 'stretch' as const }
      : { alignSelf: 'center' as const }
    : isOpen
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

  const panelWidth = isInline
    ? isOpen
      ? ('100%' as const)
      : closedPanelWidth
    : isOpen
      ? openWidth
      : closedPanelWidth;

  return (
    <Animated.View
      layout={enablePanelLayoutAnimation ? LinearTransition.duration(duration) : undefined}
      style={[
        isInline ? styles.panelInline : styles.panel,
        horizontalStyle,
        {
          width: panelWidth,
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
            android: {
              elevation: isInline ? (isOpen ? 6 : 4) : isOpen ? 28 : 8,
            },
          }),
        },
        panelStyle,
        !isInline ? panelBottomStyle : null,
      ]}
    >
      {!isOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={
              closedAccessibilityLabel ?? (closedChildren ? undefined : 'פתיחה')
            }
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              closedChildren ? styles.closedChildrenWrap : styles.center,
            ]}
          >
            {closedChildren ?? (
              <Entypo name="plus" size={openIconSize} color={iconOnClosed} />
            )}
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
              style={[
                styles.closeBtn,
                { top: closeBtnTop },
                I18nManager.isRTL
                  ? { left: closeBtnEndInset }
                  : { right: closeBtnEndInset },
              ]}
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
  panelInline: {
    position: 'relative',
    overflow: 'hidden',
    zIndex: 2,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedChildrenWrap: {
    justifyContent: 'center',
    paddingHorizontal: 14,
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
