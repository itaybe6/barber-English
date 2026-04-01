import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { BOOKING_TABS_HEIGHT } from '@/components/book-appointment/BookingStepTabs';
import { getClientTabBarBottomInset } from '@/constants/clientTabBarInsets';

const _spacing = 18;
const _borderRadius = 12;

type BarberSlideProps = {
  barber: User;
  index: number;
  scrollX: SharedValue<number>;
  slideWidth: number;
  slideHeight: number;
  primaryColor: string;
  onPress: () => void;
};

function BarberSlide({
  barber,
  index,
  scrollX,
  slideWidth,
  slideHeight,
  primaryColor,
  onPress,
}: BarberSlideProps) {
  const [imgError, setImgError] = useState(false);
  const uri = (barber?.image_url as string | undefined) || '';
  const showImage = !!uri && !imgError;

  const containerStylez = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [40, 0, 40],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const imageStylez = useAnimatedStyle(() => ({
    transform: [
      {
        rotateZ: `${interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [15, 0, -15],
          Extrapolation.CLAMP
        )}deg`,
      },
      {
        scale: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [1.6, 1, 1.6],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <Animated.View
        style={[
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 20,
            elevation: 7,
            borderRadius: _borderRadius,
          },
          containerStylez,
        ]}
      >
        <View
          style={{
            width: slideWidth,
            height: slideHeight,
            borderRadius: _borderRadius,
            overflow: 'hidden',
            padding: 2,
            backgroundColor: 'rgba(0,0,0,0.1)',
          }}
        >
          {showImage ? (
            <Animated.Image
              source={{ uri }}
              style={[{ flex: 1, borderRadius: _borderRadius }, imageStylez]}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <Animated.View
              style={[
                {
                  flex: 1,
                  borderRadius: _borderRadius,
                  backgroundColor: primaryColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                imageStylez,
              ]}
            >
              <Ionicons name="person" size={56} color="rgba(255,255,255,0.55)" />
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

type BarberBackdropProps = {
  barber: User;
  index: number;
  scrollX: SharedValue<number>;
};

function BarberBackdropImage({ barber, index, scrollX }: BarberBackdropProps) {
  const [imgError, setImgError] = useState(false);
  const uri = (barber?.image_url as string | undefined) || '';
  const showImage = !!uri && !imgError;

  const stylez = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [index - 1, index, index + 1], [0, 0.85, 0]),
  }));

  if (!showImage) {
    return null;
  }

  return (
    <Animated.Image
      source={{ uri }}
      style={[StyleSheet.absoluteFillObject, stylez]}
      resizeMode="cover"
      blurRadius={50}
      onError={() => setImgError(true)}
    />
  );
}

type BarberDetailsOverlayProps = {
  barber: User;
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  t: (key: string, defaultValue?: string) => string;
};

function BarberDetailsOverlay({ barber, index, scrollX, width, t }: BarberDetailsOverlayProps) {
  const role = ((barber as any)?.role as string | undefined)?.trim?.() || '';

  const stylez = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [width / 2, 0, -width / 2]
        ),
      },
    ],
    opacity: interpolate(scrollX.value, [index - 0.5, index, index + 0.5], [0, 1, 0]),
  }));

  return (
    <Animated.View
      style={[
        {
          gap: 4,
          position: 'absolute',
          height: '30%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: width * 0.1,
        },
        stylez,
      ]}
    >
      <Text
        style={{
          fontSize: 18,
          color: '#1C1C1E',
          fontWeight: '700',
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {barber.name || ''}
      </Text>
      <Text style={{ color: '#6B7280', opacity: 0.95, textAlign: 'center' }} numberOfLines={2}>
        {role || t('booking.selectBarberHint', 'Who would you like to book with?')}
      </Text>
    </Animated.View>
  );
}

type Props = {
  visible: boolean;
  styles: any;
  introFadeStyle: any;
  topOffset: number;
  safeAreaBottom: number;
  isLoading: boolean;
  barbers: User[];
  selectedBarberId?: string | number | null;
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectBarber: (barber: User) => void;
};

export default function BarberSelection({
  visible,
  styles: parentStyles,
  introFadeStyle,
  topOffset = 0,
  safeAreaBottom,
  isLoading,
  barbers,
  selectedBarberId,
  externalScrollX,
  t,
  onSelectBarber,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors } = useBusinessColors();
  const internalScrollX = useSharedValue(0);
  const scrollX = externalScrollX ?? internalScrollX;
  const listRef = useRef<Animated.FlatList<User>>(null);
  const skipNextMomentumRef = useRef(false);

  const SCROLL_TOP_EXTRA = 12;
  const tabBarBottomOffset = getClientTabBarBottomInset(safeAreaBottom);
  const bottomChrome = tabBarBottomOffset + BOOKING_TABS_HEIGHT + 10;

  const slideWidth = windowWidth * 0.75;
  const slideHeight = slideWidth * 1.5;
  const itemStride = slideWidth + _spacing;
  /** Compact band for name/role — keeps carousel higher, away from bottom tabs */
  const topSpacing = Math.max(72, Math.min(100, Math.round(windowHeight * 0.1)));
  const listViewportHeight = Math.min(
    windowHeight * 0.96,
    Math.max(slideHeight + topSpacing + 20, windowHeight - topOffset - SCROLL_TOP_EXTRA - bottomChrome)
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x / itemStride;
    },
  });

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      const clamped = Math.max(0, Math.min(index, Math.max(0, barbers.length - 1)));
      const offset = clamped * itemStride;
      try {
        listRef.current?.scrollToOffset({ offset, animated });
      } catch {
        /* noop */
      }
    },
    [barbers.length, itemStride]
  );

  const prevVisibleRef = useRef(false);
  const prevBarbersLenRef = useRef(0);
  const barbersKey = barbers.map((b) => String(b.id ?? '')).join('|');

  useEffect(() => {
    if (!visible) {
      prevVisibleRef.current = false;
      return;
    }
    if (barbers.length === 0) return;

    const enteredStep = !prevVisibleRef.current;
    const barbersArrived = prevBarbersLenRef.current === 0 && barbers.length > 0;

    if (enteredStep || barbersArrived) {
      const id = String(selectedBarberId ?? '');
      const idx = barbers.findIndex((b) => String(b.id ?? '') === id);
      const i = idx >= 0 ? idx : 0;
      skipNextMomentumRef.current = true;
      requestAnimationFrame(() => scrollToIndex(i, false));
    }

    prevVisibleRef.current = true;
    prevBarbersLenRef.current = barbers.length;
  }, [visible, barbers, barbers.length, barbersKey, selectedBarberId, scrollToIndex]);

  const onMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (skipNextMomentumRef.current) {
        skipNextMomentumRef.current = false;
        return;
      }
      const x = Math.max(0, e.nativeEvent.contentOffset.x);
      const idx = Math.round(x / itemStride);
      const clamped = Math.max(0, Math.min(idx, barbers.length - 1));
      const target = clamped * itemStride;
      if (Math.abs(target - x) > 1.5) {
        scrollToIndex(clamped, true);
      }
      const b = barbers[clamped];
      if (b && String(b.id) !== String(selectedBarberId ?? '')) {
        onSelectBarber(b);
      }
    },
    [barbers, itemStride, onSelectBarber, scrollToIndex, selectedBarberId]
  );

  if (!visible) return null;

  const footerPad = Math.max(safeAreaBottom, 20) + 56;
  const sidePad = (windowWidth - slideWidth) / 2;

  return (
    <Animated.View
      style={[
        parentStyles.section,
        parentStyles.sectionFullBleed,
        introFadeStyle,
        {
          backgroundColor: 'transparent',
          alignSelf: 'stretch',
          minHeight: listViewportHeight,
        },
      ]}
    >
      {isLoading ? (
        <View style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', marginTop: 12 }]}>
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : barbers.length > 0 ? (
        <View
          style={{
            height: listViewportHeight,
            overflow: 'hidden',
            paddingBottom: 20,
          }}
        >
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#E8E9EE' }]} />

          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {barbers.map((barber, index) => (
              <BarberBackdropImage
                key={`barber-bg-${String(barber.id ?? index)}`}
                barber={barber}
                index={index}
                scrollX={scrollX}
              />
            ))}
          </View>

          <View
            style={{
              height: topSpacing,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {barbers.map((barber, index) => (
              <BarberDetailsOverlay
                key={`barber-details-${String(barber.id ?? index)}`}
                barber={barber}
                index={index}
                scrollX={scrollX}
                width={windowWidth}
                t={t}
              />
            ))}
          </View>

          <View style={{ direction: 'ltr' } as any}>
            <Animated.FlatList
              ref={listRef}
              data={barbers}
              keyExtractor={(item, index) => String(item.id ?? `barber-${index}`)}
              style={{ marginTop: -topSpacing, opacity: 1 }}
              contentContainerStyle={{
                gap: _spacing,
                paddingHorizontal: sidePad,
                alignItems: 'center',
                paddingTop: topSpacing,
                paddingBottom: footerPad,
              }}
              renderItem={({ item, index }) => (
                <BarberSlide
                  barber={item}
                  index={index}
                  scrollX={scrollX}
                  slideWidth={slideWidth}
                  slideHeight={slideHeight}
                  primaryColor={colors.primary}
                  onPress={() => {
                    onSelectBarber(item);
                    scrollToIndex(index, true);
                  }}
                />
              )}
              snapToInterval={itemStride}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              horizontal
              onScroll={onScroll}
              scrollEventThrottle={1000 / 60}
              onMomentumScrollEnd={onMomentumScrollEnd}
              nestedScrollEnabled
              removeClippedSubviews={false}
            />
          </View>
        </View>
      ) : (
        <View
          style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
        >
          <Ionicons name="people-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', fontSize: 17 }]}>
            {t('booking.noBarbers', 'No specialists available')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
