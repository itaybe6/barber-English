import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/src/theme/ThemeProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const COPY_MAX_WIDTH = 340;

const OPEN_SPRING = { damping: 22, stiffness: 280, mass: 0.9 };
const CLOSE_DURATION = 260;

/** Drag strip (pill + padding) — used to cap ScrollView so the handle stays fixed at bottom. */
function bottomHandleSectionHeight(insetsBottom: number) {
  return 12 + 5 + 12 + Math.max(insetsBottom, 12);
}

export interface HomeFixedMessageSheetProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}

/**
 * Client home: fixed salon message — slides down from the top edge (under status bar),
 * full-width sheet with top safe-area padding for content; drag the bottom handle upward to close.
 */
export default function HomeFixedMessageSheet({
  visible,
  message,
  onDismiss,
}: HomeFixedMessageSheetProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colors = useColors();
  const isRTL = I18nManager.isRTL;
  const reduceMotion = useReducedMotion();

  const sheetHeightRef = useRef(320);
  const sheetHeightSV = useSharedValue(320);
  const translateY = useSharedValue(-SCREEN_H);
  const [portalMounted, setPortalMounted] = useState(false);
  const openedOnceRef = useRef(false);
  const closingRef = useRef(false);

  const bottomChrome = useMemo(() => bottomHandleSectionHeight(insets.bottom), [insets.bottom]);

  const maxSheetHeight = useMemo(() => Math.round(SCREEN_H * 0.9), []);

  const scrollMaxHeight = useMemo(
    () => Math.max(120, maxSheetHeight - bottomChrome),
    [maxSheetHeight, bottomChrome],
  );

  const openSheet = useCallback(
    (contentHeight: number) => {
      closingRef.current = false;
      sheetHeightRef.current = contentHeight;
      sheetHeightSV.value = contentHeight;
      const hiddenY = -contentHeight - 8;
      translateY.value = hiddenY;
      if (reduceMotion) {
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      } else {
        translateY.value = withSpring(0, OPEN_SPRING);
      }
    },
    [reduceMotion, sheetHeightSV, translateY],
  );

  const finishClose = useCallback(() => {
    closingRef.current = false;
    onDismiss();
    setPortalMounted(false);
    openedOnceRef.current = false;
  }, [onDismiss]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const h = sheetHeightRef.current;
    const hiddenY = -h - 12;
    translateY.value = withTiming(
      hiddenY,
      { duration: CLOSE_DURATION, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      },
    );
  }, [finishClose, translateY]);

  useEffect(() => {
    if (visible && message.length > 0) {
      setPortalMounted(true);
    }
  }, [visible, message]);

  useEffect(() => {
    if (visible || message.length === 0) return;
    if (!portalMounted) return;
    if (closingRef.current) return;
    if (!openedOnceRef.current) {
      setPortalMounted(false);
      return;
    }
    closeSheet();
  }, [visible, message, portalMounted, closeSheet]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      sheetHeightRef.current = h;
      sheetHeightSV.value = h;
      if (!openedOnceRef.current && visible && message.length > 0) {
        openedOnceRef.current = true;
        requestAnimationFrame(() => {
          openSheet(h);
        });
      }
    },
    [openSheet, sheetHeightSV, visible, message],
  );

  const panStartY = useSharedValue(0);

  /** Drag up (negative translationY) to pull sheet off the top and close. */
  const handlePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(-12)
        .failOffsetX([-24, 24])
        .onStart(() => {
          panStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          const next = panStartY.value + e.translationY;
          const minY = -sheetHeightSV.value - 24;
          translateY.value = Math.min(Math.max(next, minY), 0);
        })
        .onEnd((e) => {
          const shouldClose = e.translationY < -48 || e.velocityY < -580;
          if (shouldClose) {
            runOnJS(closeSheet)();
          } else if (reduceMotion) {
            translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
          } else {
            translateY.value = withSpring(0, OPEN_SPRING);
          }
        }),
    [closeSheet, panStartY, reduceMotion, sheetHeightSV, translateY],
  );

  if (!portalMounted || message.length === 0) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Pressable
          style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          onPress={closeSheet}
          accessibilityRole="button"
          accessibilityLabel={t('close', 'Close')}
        />

        <Animated.View
          style={[styles.sheetOuter, { top: 0, maxHeight: maxSheetHeight }, sheetAnimatedStyle]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheetInner,
              {
                backgroundColor: colors.surface,
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                borderCurve: 'continuous',
              },
            ]}
            onLayout={onSheetLayout}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ maxHeight: scrollMaxHeight }}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: insets.top + 10,
                  paddingBottom: 16,
                },
              ]}
            >
              <View style={styles.sheetColumn}>
                <View
                  style={[
                    styles.headerBand,
                    { borderBottomColor: `${colors.text}12` },
                  ]}
                >
                  <View style={styles.headerRow}>
                    <View
                      style={[styles.iconWrap, { backgroundColor: `${colors.primary}1F` }]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Ionicons name="megaphone-outline" size={19} color={colors.primary} />
                    </View>
                    <Text
                      style={[styles.headerTitle, { color: colors.text }]}
                      accessibilityRole="header"
                    >
                      {t('home.fixedMessage.title', 'Important message')}
                    </Text>
                  </View>
                </View>

                <View style={styles.bodyBlock}>
                  <Text
                    style={[
                      styles.body,
                      {
                        color: colors.text,
                        writingDirection: isRTL ? 'rtl' : 'ltr',
                      },
                    ]}
                  >
                    {message}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <GestureDetector gesture={handlePan}>
              <View
                style={[
                  styles.handleStrip,
                  { paddingBottom: Math.max(insets.bottom, 12) },
                ]}
                accessibilityRole="adjustable"
                accessibilityLabel={t('home.fixedMessage.dragToClose', 'Drag up to close')}
              >
                <View style={[styles.handlePill, { backgroundColor: `${colors.text}28` }]} />
              </View>
            </GestureDetector>
          </View>
        </Animated.View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  sheetInner: {
    width: '100%',
    overflow: 'hidden',
  },
  handleStrip: {
    paddingTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handlePill: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  scrollContent: {
    alignItems: 'stretch',
  },
  sheetColumn: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
  },
  headerBand: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'nowrap',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexShrink: 1,
    maxWidth: '78%',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.35,
    textAlign: 'center',
    lineHeight: 22,
  },
  bodyBlock: {
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  body: {
    width: '100%',
    maxWidth: COPY_MAX_WIDTH,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
    letterSpacing: -0.12,
    textAlign: 'center',
  },
});
