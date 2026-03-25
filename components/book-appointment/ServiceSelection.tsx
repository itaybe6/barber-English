import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
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

import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const SCREEN = Dimensions.get('window');
const WIN_H = SCREEN.height;

const _spacing = 8;
const _borderRadius = 14;
/** Shorter card so prev/next services peek above & below (carousel feel) */
const _itemSize = WIN_H * 0.4;
const _itemGap = _spacing * 2;
const _itemFullSize = _itemSize + _itemGap;
/** Room above/below focused card so neighbors + borders/shadows aren’t clipped */
const _peekInset = Math.max(52, Math.round(WIN_H * 0.076));
/** Extra viewport height beyond card+peek (shadows, 3px selection border, scale) */
const _viewportBleed = 44;
/** Floating title zone — gradient so cards scroll underneath instead of a hard cut */
const _headerFadeHeight = 118;

function serviceImageUri(service: Service): string {
  return (
    (service as any)?.image_url ||
    (service as any)?.cover_url ||
    (service as any)?.image ||
    ''
  );
}

type PerplexityServiceCardProps = {
  service: Service;
  index: number;
  scrollY: SharedValue<number>;
  isSelected: boolean;
  primaryColor: string;
  t: any;
  onPress: () => void;
};

function PerplexityServiceCard({
  service,
  index,
  scrollY,
  isSelected,
  primaryColor,
  t,
  onPress,
}: PerplexityServiceCardProps) {
  const [imgError, setImgError] = useState(false);
  const uri = serviceImageUri(service);
  const showImage = !!uri && !imgError;
  const description = ((service as any)?.description as string | undefined)?.trim?.() || '';
  const duration = (service as any)?.duration_minutes ?? 60;
  const price = (service as any)?.price ?? 0;

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
            height: _itemSize,
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
                height: _itemSize * 0.38,
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
              minHeight: _itemSize * 0.34,
              margin: -_spacing,
              backgroundColor: primaryColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="cut" size={44} color="rgba(255,255,255,0.5)" />
          </View>
        )}

        <View style={{ gap: _spacing * 0.75 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {(service as any)?.name || ''}
          </Text>
          {description ? (
            <Text style={styles.cardDescription} numberOfLines={3}>
              {description}
            </Text>
          ) : (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {`${duration} ${t('booking.min', 'min')} · ₪${price}`}
            </Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={14} color="#6B7280" />
            <Text style={styles.metaChipText}>
              {duration} {t('booking.min', 'min')}
            </Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="pricetag-outline" size={14} color="#6B7280" />
            <Text style={styles.metaChipText}>₪{price}</Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

type Props = {
  visible: boolean;
  styles: any;
  step2FadeStyle: any;
  topOffset: number;
  safeAreaBottom: number;
  isLoading: boolean;
  services: Service[];
  selectedServiceId?: string | number | null;
  selectedServiceIds?: string[];
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectService: (service: Service, index: number) => void;
  onContinue?: () => void;
};

export default function ServiceSelection({
  visible,
  styles: parentStyles,
  step2FadeStyle,
  topOffset = 0,
  safeAreaBottom,
  isLoading,
  services,
  selectedServiceId,
  selectedServiceIds,
  t,
  onSelectService,
  onContinue,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const { colors } = useBusinessColors();
  const scrollY = useSharedValue(0);
  /** ScrollView (not FlatList) — parent screen uses ScrollView; nesting VirtualizedList caused blank area + RN warning */
  const scrollRef = React.useRef<Animated.ScrollView>(null);

  /** Matches book-appointment spacer below step tabs: `TOP_OFFSET + 12` */
  const SCROLL_TOP_EXTRA = 12;
  /** Same inset as booking step bar / client floating tab bar */
  const tabBarBottomOffset = safeAreaBottom > 0 ? safeAreaBottom + 2 : 8;
  /** Keep aligned with `BOOKING_TABS_HEIGHT` in BookingStepTabs */
  const TAB_ROW_HEIGHT = 62;
  const LIST_GAP_ABOVE_TAB = 10;
  const bottomChrome = tabBarBottomOffset + TAB_ROW_HEIGHT + LIST_GAP_ABOVE_TAB;

  const baseMinViewport = _itemSize + _peekInset * 2 + _itemGap + _viewportBleed;
  const usableListHeight =
    windowHeight - topOffset - SCROLL_TOP_EXTRA - bottomChrome;

  /** Fill space to bottom nav; old Math.min(0.66*H, …) left a large empty band on web / short viewports */
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
      const clamped = Math.max(0, Math.min(idx, Math.max(0, services.length - 1)));
      const target = clamped * _itemFullSize;
      if (Math.abs(target - y) > 1.5 && scrollRef.current) {
        try {
          scrollRef.current.scrollTo({ y: target, animated: true });
        } catch {
          /* noop */
        }
      }
    },
    [services.length]
  );

  if (!visible) return null;

  const footerPad = Math.max(safeAreaBottom, 20) + 120;

  return (
    <Animated.View
      style={[
        parentStyles.section,
        parentStyles.sectionFullBleed,
        step2FadeStyle,
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
            {t('booking.loadingServices', 'Loading services...')}
          </Text>
        </View>
      ) : services.length > 0 ? (
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
              {services.map((item, index) => {
                const svcId = String((item as any).id ?? '');
                const isSelected = selectedServiceIds
                  ? selectedServiceIds.includes(svcId)
                  : svcId === String(selectedServiceId ?? '');
                return (
                  <PerplexityServiceCard
                    key={svcId || `svc-${index}`}
                    service={item}
                    index={index}
                    scrollY={scrollY}
                    isSelected={isSelected}
                    primaryColor={colors.primary}
                    t={t}
                    onPress={() => onSelectService(item, index)}
                  />
                );
              })}
              {onContinue && (selectedServiceIds?.length ?? 0) > 0 ? (
                <Animated.View entering={FadeInDown.delay(120).duration(380)} style={styles.continueBtnWrap}>
                  <TouchableOpacity
                    onPress={onContinue}
                    activeOpacity={0.88}
                    style={[styles.continueBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                  >
                    <Text style={styles.continueBtnText}>
                      {t('booking.continue', 'Continue')}
                      {(selectedServiceIds?.length ?? 0) > 1 ? ` (${selectedServiceIds!.length})` : ''}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <View style={{ height: 8 }} />
              )}
            </Animated.ScrollView>

            {/* Title floats above scroll; gradient hides hard edge so carousel runs underneath */}
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
                <Text style={styles.headerTitle}>{t('booking.selectServices', 'Select Services')}</Text>
                <Text style={styles.headerSub}>
                  {t('booking.selectMultipleHint', 'Tap to select one or more services')}
                </Text>
              </Animated.View>
            </View>
          </View>
        </View>
      ) : (
        <View
          style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
        >
          <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', fontSize: 17 }]}>
            {t('booking.noServices', 'No services available')}
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
  },
  metaChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  continueBtnWrap: {
    marginTop: 28,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    width: '100%',
    maxWidth: 400,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
