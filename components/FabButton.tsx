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
  /**
   * Open panel placement. `bottom` — anchored above `bottom` (default). `center` — vertically centered
   * in the area above `bottom` (keyboard lift still shrinks that area). Ignored when closed or `inline`.
   */
  panelVerticalAlign?: 'bottom' | 'center';
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
  panelVerticalAlign = 'bottom',
}: FabButtonProps) {
  const colors = useColors();
  const { width: screenW, height: screenH } = useWindowDimensions();
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

  const useCenteredOpen = !isInline && isOpen && panelVerticalAlign === 'center';

  const openShadow = isOpen
    ? Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
        },
        android: {
          elevation: isInline ? 6 : 28,
        },
      })
    : undefined;

  const closedShadow = !isOpen
    ? Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        },
        android: {
          elevation: isInline ? 4 : 8,
        },
      })
    : undefined;

  const openChrome = (
    <>
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
    </>
  );

  const openSheetPadding = {
    paddingTop: spacing * 1.2,
    paddingHorizontal: openPaddingH,
    paddingBottom: spacing * 1.2,
  };

  const openCardStyle = {
    width: openWidth,
    borderRadius: 22,
    backgroundColor: openBg,
    ...openSheetPadding,
    ...openShadow,
    maxHeight: Math.min(screenH * 0.92, screenH - 32),
    overflow: 'hidden' as const,
  };

  const closedFabStyle = {
    width: panelWidth,
    minHeight: closedSize,
    borderRadius: closedSize / 2,
    backgroundColor: closedBg,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    ...closedShadow,
  };

  const openBottomSheetStyle = {
    width: panelWidth,
    borderRadius: 22,
    backgroundColor: openBg,
    ...openSheetPadding,
    ...openShadow,
  };

  return (
    <Animated.View
      layout={enablePanelLayoutAnimation ? LinearTransition.duration(duration) : undefined}
      style={[
        isInline ? styles.panelInline : styles.panel,
        useCenteredOpen ? styles.panelCenterWrap : null,
        !useCenteredOpen ? horizontalStyle : null,
        useCenteredOpen
          ? styles.panelCenterFill
          : isOpen
            ? openBottomSheetStyle
            : closedFabStyle,
        !useCenteredOpen ? panelStyle : null,
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
      ) : useCenteredOpen ? (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={[openCardStyle, panelStyle]}
        >
          <View style={styles.openInner}>{openChrome}</View>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={styles.openInner}
        >
          {openChrome}
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
  /** Lets the centered inner card’s shadow render outside the hit box wrapper. */
  panelCenterWrap: {
    overflow: 'visible',
  },
  /** Full screen above `bottom`; centers the sheet; touches pass through to backdrop outside the card. */
  panelCenterFill: {
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
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
