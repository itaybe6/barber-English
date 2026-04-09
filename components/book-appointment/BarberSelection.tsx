import React, { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  useWindowDimensions,
  Animated as RNAnimated,
  I18nManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const CARD_CORNER = 56;
const CARD_BG_PLACEHOLDER = 'rgba(255,255,255,0.08)';
/** Carousel: portrait card like Nike-style paging strip */
const ITEM_WIDTH_RATIO = 0.72;
const ITEM_HEIGHT_RATIO = 1.52;
const NAME_STRIP_SPACING = 16;
const NAME_STRIP_HEIGHT = 40;
const DOT_SIZE = 7;
const DOT_GAP = 10;
const DOT_ACTIVE_SCALE = 1.35;

type Props = {
  visible: boolean;
  styles: any;
  introFadeStyle: any;
  topOffset: number;
  safeAreaBottom?: number;
  isLoading: boolean;
  barbers: User[];
  selectedBarberId?: string | number | null;
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectBarber: (barber: User) => void;
  /** Keeps parent in sync for “continue” (measureInWindow after layout / scroll). */
  onSelectedFaceWindowFrame?: (
    rect: { x: number; y: number; width: number; height: number } | null
  ) => void;
};

export interface BarberSelectionHandle {
  /** Reports window coordinates of the selected barber card face (photo area), or null if unavailable. */
  measureSelectedFaceInWindow: (
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void
  ) => void;
  /** Re-measure after scroll so “continue” uses the current on-screen position. */
  syncSelectedFaceFrame: () => void;
}

function primaryWithAlpha(hex: string, alpha: string): string {
  const h = hex.replace('#', '');
  if (h.length === 6) return `#${h}${alpha}`;
  return hex;
}

const BarberSelection = forwardRef<BarberSelectionHandle, Props>(function BarberSelection(
  {
    visible,
    styles: parentStyles,
    introFadeStyle,
    topOffset = 0,
    isLoading,
    barbers,
    selectedBarberId,
    t,
    onSelectBarber,
    onSelectedFaceWindowFrame,
  },
  ref
) {
  const { colors } = useBusinessColors();
  const { width: winW } = useWindowDimensions();
  const selectedFaceRef = useRef<View>(null);
  const flatListRef = useRef<InstanceType<typeof RNAnimated.FlatList<User>> | null>(null);
  const scrollX = useRef(new RNAnimated.Value(0)).current;

  const pageWidth = winW;
  const itemW = Math.round(pageWidth * ITEM_WIDTH_RATIO);
  const itemH = Math.round(itemW * ITEM_HEIGHT_RATIO);

  const reportFaceFrame = useCallback(() => {
    const node = selectedFaceRef.current;
    if (!node) {
      onSelectedFaceWindowFrame?.(null);
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      if (typeof w !== 'number' || typeof h !== 'number' || w < 12 || h < 12) {
        onSelectedFaceWindowFrame?.(null);
        return;
      }
      onSelectedFaceWindowFrame?.({ x, y, width: w, height: h });
    });
  }, [onSelectedFaceWindowFrame]);

  useImperativeHandle(
    ref,
    () => ({
    measureSelectedFaceInWindow(callback) {
      requestAnimationFrame(() => {
        const node = selectedFaceRef.current;
        if (!node) {
          callback(null);
          return;
        }
        node.measureInWindow((x, y, w, h) => {
          if (typeof w !== 'number' || typeof h !== 'number' || w < 12 || h < 12) {
            callback(null);
            return;
          }
          const r = { x, y, width: w, height: h };
          onSelectedFaceWindowFrame?.(r);
          callback(r);
        });
      });
    },
    syncSelectedFaceFrame() {
      requestAnimationFrame(reportFaceFrame);
    },
    }),
    [onSelectedFaceWindowFrame, reportFaceFrame]
  );

  useEffect(() => {
    if (!visible || barbers.length === 0) return;
    const idx = barbers.findIndex((b) => String(b.id ?? '') === String(selectedBarberId ?? ''));
    if (idx < 0) return;
    const id = requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [visible, barbers, selectedBarberId]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  const syncSelectionFromOffset = useCallback(
    (x: number) => {
      const index = Math.round(x / pageWidth);
      const barber = barbers[index];
      if (!barber) return;
      if (String(barber.id ?? '') !== String(selectedBarberId ?? '')) {
        onSelectBarber(barber);
      }
      requestAnimationFrame(reportFaceFrame);
    },
    [barbers, onSelectBarber, pageWidth, reportFaceFrame, selectedBarberId]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncSelectionFromOffset(e.nativeEvent.contentOffset.x);
    },
    [syncSelectionFromOffset]
  );

  if (!visible) return null;

  return (
    <Reanimated.View
      style={[
        parentStyles.section,
        introFadeStyle,
        {
          marginTop: Math.max(topOffset - 20, 2),
          marginBottom: 0,
          marginHorizontal: 0,
          backgroundColor: 'transparent',
        },
      ]}
    >
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              parentStyles.loadingText,
              { color: 'rgba(255,255,255,0.7)', marginTop: 14, fontSize: 15, fontWeight: '600' },
            ]}
          >
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : barbers.length > 0 ? (
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('booking.selectStaffTitle', 'Choose your stylist')}
            </Text>
            <Text style={styles.subtitle}>
              {t(
                'booking.selectStaffSubtitle',
                'Swipe or tap a team member to continue'
              )}
            </Text>
          </View>

          <Reanimated.View entering={bookingStepRowEntering(0)} style={styles.carouselShell}>
            <View style={styles.dotsRow} accessibilityLabel={t('booking.staffCarouselDots', 'Staff carousel pagination')}>
              {barbers.map((_, index) => {
                const pageProgress = RNAnimated.divide(scrollX, pageWidth);
                const opacity = pageProgress.interpolate({
                  inputRange: [index - 0.6, index, index + 0.6],
                  outputRange: [0.35, 1, 0.35],
                  extrapolate: 'clamp',
                });
                const scale = pageProgress.interpolate({
                  inputRange: [index - 0.55, index, index + 0.55],
                  outputRange: [1, DOT_ACTIVE_SCALE, 1],
                  extrapolate: 'clamp',
                });
                return (
                  <RNAnimated.View
                    key={`dot-${index}`}
                    style={[
                      styles.dotWrap,
                      {
                        marginHorizontal: DOT_GAP / 2,
                        opacity,
                        transform: [{ scale }],
                      },
                    ]}
                  >
                    <View style={styles.dot} />
                  </RNAnimated.View>
                );
              })}
            </View>

            {/* LTR scroll so swipe direction and scrollX math match the Nike-style strip */}
            <View style={styles.carouselLtr}>
              <RNAnimated.FlatList
                ref={flatListRef}
                data={barbers}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item, index) => String(item.id ?? `barber-${index}`)}
                getItemLayout={getItemLayout}
                onScroll={RNAnimated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: true }
                )}
                onMomentumScrollEnd={onMomentumScrollEnd}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index, animated: false });
                  }, 80);
                }}
                renderItem={({ item: barber, index }) => {
                  const isSelected = String(barber.id ?? '') === String(selectedBarberId ?? '');
                  const uri = (barber?.image_url as string | undefined) || '';

                  return (
                    <RNAnimated.View
                      style={[
                        styles.carouselPage,
                        {
                          width: pageWidth,
                          shadowColor: 'transparent',
                          shadowOpacity: 0,
                          elevation: 0,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => {
                          flatListRef.current?.scrollToIndex({ index, animated: true });
                          onSelectBarber(barber);
                          requestAnimationFrame(reportFaceFrame);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={barber.name || t('booking.step.barber', 'Barber')}
                        android_ripple={{ color: primaryWithAlpha(colors.primary, '28') }}
                        style={({ pressed }) => [
                          styles.carouselPressable,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                      >
                        <View
                          ref={isSelected ? selectedFaceRef : undefined}
                          collapsable={false}
                          onLayout={
                            isSelected
                              ? () => {
                                  requestAnimationFrame(reportFaceFrame);
                                }
                              : undefined
                          }
                          style={[
                            styles.cardFace,
                            {
                              width: itemW,
                              height: itemH,
                              backgroundColor: 'transparent',
                              borderWidth: 0,
                              shadowOpacity: 0,
                              elevation: 0,
                            },
                          ]}
                        >
                          {uri ? (
                            <Image source={{ uri }} style={styles.imageFill} resizeMode="cover" />
                          ) : (
                            <View style={[styles.imagePlaceholder, { backgroundColor: CARD_BG_PLACEHOLDER }]}>
                              <Ionicons
                                name="person"
                                size={Math.round(itemH * 0.22)}
                                color="rgba(255,255,255,0.35)"
                              />
                            </View>
                          )}
                        </View>
                      </Pressable>
                    </RNAnimated.View>
                  );
                }}
              />
            </View>

            <View
              style={[
                styles.nameStrip,
                {
                  height: NAME_STRIP_HEIGHT,
                  marginHorizontal: NAME_STRIP_SPACING,
                  marginTop: NAME_STRIP_SPACING,
                  width: itemW,
                  alignSelf: 'center',
                },
              ]}
            >
              {barbers.map((barber, index) => {
                const opacity = RNAnimated.divide(scrollX, pageWidth).interpolate({
                  inputRange: [index - 0.8, index, index + 1],
                  outputRange: [0, 1, 0],
                  extrapolate: 'clamp',
                });
                return (
                  <RNAnimated.Text
                    key={String(barber.id ?? `name-${index}`)}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[
                      styles.nameStripText,
                      {
                        opacity,
                        writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
                      },
                    ]}
                  >
                    {barber.name || ''}
                  </RNAnimated.Text>
                );
              })}
            </View>
          </Reanimated.View>
        </View>
      ) : (
        <View style={styles.loadingState}>
          <Ionicons
            name="people-outline"
            size={52}
            color="rgba(255,255,255,0.3)"
            style={{ marginBottom: 14 }}
          />
          <Text
            style={[
              parentStyles.loadingText,
              { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
            ]}
          >
            {t('booking.noBarbers', 'No specialists available')}
          </Text>
        </View>
      )}
    </Reanimated.View>
  );
});

export default BarberSelection;

const styles = StyleSheet.create({
  shell: {
    gap: 14,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    lineHeight: 20,
  },
  carouselShell: {
    width: '100%',
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: 'transparent',
  },
  dotWrap: {
    width: DOT_SIZE + 4,
    height: DOT_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#FFFFFF',
  },
  carouselLtr: {
    width: '100%',
    direction: 'ltr',
  },
  carouselPage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameStrip: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  nameStripText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 28,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  cardFace: {
    borderRadius: CARD_CORNER,
    overflow: 'hidden',
  },
  imageFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

