import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { LinearGradient } from 'expo-linear-gradient';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { BOOKING_TABS_HEIGHT } from '@/components/book-appointment/BookingStepTabs';
import { getClientTabBarBottomInset } from '@/constants/clientTabBarInsets';

const _spacing = 8;
const _borderRadius = 14;
const _headerFadeHeight = 118;

type BarberCarouselCardProps = {
  barber: User;
  index: number;
  scrollY: SharedValue<number>;
  isSelected: boolean;
  primaryColor: string;
  itemSize: number;
  t: any;
  onPress: () => void;
};

function BarberCarouselCard({
  barber,
  index,
  scrollY,
  isSelected,
  primaryColor,
  itemSize,
  t,
  onPress,
}: BarberCarouselCardProps) {
  const [imgError, setImgError] = useState(false);
  const uri = (barber?.image_url as string | undefined) || '';
  const showImage = !!uri && !imgError;
  const role = ((barber as any)?.role as string | undefined)?.trim?.() || '';

  const stylez = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [index - 1, index, index + 1],
      [0.62, 1, 0.62],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          scrollY.value,
          [index - 1, index, index + 1],
          [0.96, 1, 0.96],
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
            height: itemSize,
            padding: _spacing * 2,
            borderRadius: _borderRadius,
            gap: _spacing * 1.5,
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
            borderWidth: isSelected ? 3 : 1,
            borderColor: isSelected ? primaryColor : '#E8E8ED',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 20,
            elevation: 4,
          },
          stylez,
        ]}
      >
        {isSelected && (
          <View
            style={[styles.checkFloating, { backgroundColor: primaryColor, borderColor: '#FFFFFF' }]}
          >
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          </View>
        )}

        {showImage ? (
          <>
            <Image
              source={{ uri }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: _borderRadius, opacity: 0.12 }]}
              blurRadius={40}
            />
            <Image
              source={{ uri }}
              style={{
                borderRadius: _borderRadius - _spacing / 2,
                flex: 1,
                height: itemSize * 0.38,
                margin: -_spacing,
              }}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <View
            style={{
              borderRadius: _borderRadius - _spacing / 2,
              flex: 1,
              minHeight: itemSize * 0.34,
              margin: -_spacing,
              backgroundColor: primaryColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={44} color="rgba(255,255,255,0.5)" />
          </View>
        )}

        <View style={{ gap: _spacing * 0.75 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {barber.name || ''}
          </Text>
          {role ? (
            <Text style={styles.cardDescription} numberOfLines={3}>
              {role}
            </Text>
          ) : (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {t('booking.selectBarberHint', 'Who would you like to book with?')}
            </Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="person-outline" size={14} color="#6B7280" />
            <Text style={styles.metaChipText}>
              {t('booking.barberSpecialist', 'Specialist')}
            </Text>
          </View>
          {role ? (
            <View style={styles.metaChip}>
              <Ionicons name="briefcase-outline" size={14} color="#6B7280" />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {role}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </TouchableOpacity>
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
  t,
  onSelectBarber,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const { colors } = useBusinessColors();
  const scrollY = useSharedValue(0);
  const scrollRef = React.useRef<Animated.ScrollView>(null);

  const SCROLL_TOP_EXTRA = 12;
  const tabBarBottomOffset = getClientTabBarBottomInset(safeAreaBottom);
  const bottomChrome = tabBarBottomOffset + BOOKING_TABS_HEIGHT + 10;

  const _itemSize = windowHeight * 0.4;
  const _itemGap = _spacing * 2;
  const _itemFullSize = _itemSize + _itemGap;
  const _peekInset = Math.max(52, Math.round(windowHeight * 0.076));
  const _viewportBleed = 44;

  const baseMinViewport = _itemSize + _peekInset * 2 + _itemGap + _viewportBleed;
  const usableListHeight = windowHeight - topOffset - SCROLL_TOP_EXTRA - bottomChrome;
  const listViewportHeight = Math.min(
    windowHeight * 0.96,
    Math.max(baseMinViewport, usableListHeight)
  );
  const verticalPad = Math.max(24, (listViewportHeight - _itemSize) / 2);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y / _itemFullSize;
    },
  });

  const onMomentumScrollEnd = React.useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const idx = Math.round(y / _itemFullSize);
      const clamped = Math.max(0, Math.min(idx, Math.max(0, barbers.length - 1)));
      const target = clamped * _itemFullSize;
      if (Math.abs(target - y) > 1.5 && scrollRef.current) {
        try {
          scrollRef.current.scrollTo({ y: target, animated: true });
        } catch {
          /* noop */
        }
      }
    },
    [barbers.length, _itemFullSize]
  );

  if (!visible) return null;

  const footerPad = Math.max(safeAreaBottom, 20) + 72;

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
        <View style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF' }]}>
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : barbers.length > 0 ? (
        <View>
          <View
            style={{
              width: '100%',
              height: listViewportHeight,
              overflow: 'visible',
              position: 'relative',
            }}
          >
            <Animated.ScrollView
              ref={scrollRef}
              nestedScrollEnabled
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={StyleSheet.absoluteFillObject}
              contentContainerStyle={{
                gap: _itemGap,
                paddingHorizontal: _spacing * 2,
                paddingTop: verticalPad,
                paddingBottom: verticalPad + footerPad,
              }}
              onScroll={onScroll}
              scrollEventThrottle={1000 / 60}
              snapToInterval={_itemFullSize}
              snapToAlignment="start"
              decelerationRate="fast"
              onMomentumScrollEnd={onMomentumScrollEnd}
            >
              {barbers.map((barber, index) => {
                const id = String(barber.id ?? '');
                const isSelected = id === String(selectedBarberId ?? '');
                return (
                  <BarberCarouselCard
                    key={id || `barber-${index}`}
                    barber={barber}
                    index={index}
                    scrollY={scrollY}
                    isSelected={isSelected}
                    primaryColor={colors.primary}
                    itemSize={_itemSize}
                    t={t}
                    onPress={() => onSelectBarber(barber)}
                  />
                );
              })}
              <View style={{ height: 8 }} />
            </Animated.ScrollView>

            <View
              pointerEvents="none"
              style={[styles.headerOverlay, { height: _headerFadeHeight }]}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.98)',
                  'rgba(255,255,255,0.88)',
                  'rgba(255,255,255,0.45)',
                  'rgba(255,255,255,0)',
                ]}
                locations={[0, 0.35, 0.65, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <Animated.View
                entering={FadeInDown.delay(80).duration(400)}
                style={styles.headerOverlayContent}
              >
                <Text style={styles.headerTitle}>
                  {t('booking.selectBarber', 'Choose your specialist')}
                </Text>
                <Text style={styles.headerSub}>
                  {t('booking.selectBarberCarouselHint', 'Swipe to browse — tap to choose')}
                </Text>
              </Animated.View>
            </View>
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

const styles = StyleSheet.create({
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerOverlayContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerTitle: {
    color: '#1C1C1E',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  headerSub: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  checkFloating: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  cardDescription: {
    fontWeight: '400',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: _spacing,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: '100%',
  },
  metaChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
});
