import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const { height: WIN_HEIGHT } = Dimensions.get('window');

const _spacing = 8;
const _borderRadius = 12;
/** Card height — Perplexity-style focal item */
const _itemSize = WIN_HEIGHT * 0.58;
const _itemFullSize = _itemSize + _spacing * 2;

type ServiceAnimatedCardProps = {
  service: Service;
  index: number;
  scrollY: SharedValue<number>;
  onPress: () => void;
  primaryFallback: string;
  t: TFunction;
};

function ServiceAnimatedCard({
  service,
  index,
  scrollY,
  onPress,
  primaryFallback,
  t,
}: ServiceAnimatedCardProps) {
  const description = ((service as any)?.description as string | undefined)?.trim?.() || '';
  const duration = service?.duration_minutes ?? 60;

  const stylez = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [index - 1, index, index + 1],
      [0.4, 1, 0.4],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          scrollY.value,
          [index - 1, index, index + 1],
          [0.92, 1, 0.92],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const tintBg = `${primaryFallback}22`;

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <Animated.View
        style={[
          {
            height: _itemSize,
            padding: _spacing * 2,
            borderRadius: _borderRadius,
            gap: _spacing * 2,
            backgroundColor: tintBg,
          },
          stylez,
        ]}
      >
        <View
          style={{
            borderRadius: _borderRadius - _spacing / 2,
            flex: 1,
            minHeight: _itemSize * 0.36,
            margin: -_spacing,
            backgroundColor: primaryFallback,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="cut" size={48} color="rgba(255,255,255,0.45)" />
        </View>

        <View style={{ gap: _spacing }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {service?.name || ''}
          </Text>
          {description ? (
            <Text style={styles.cardDescription} numberOfLines={3}>
              {description}
            </Text>
          ) : (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {`${duration} ${t('booking.min', 'min')} · ${t('booking.price', '$')} ${service?.price ?? 0}`}
            </Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={14} color="#e5e5e5" />
            <Text style={styles.metaChipText}>
              {duration} {t('booking.min', 'min')}
            </Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="pricetag-outline" size={14} color="#e5e5e5" />
            <Text style={styles.metaChipText}>
              {t('booking.price', '$')} {service?.price ?? 0}
            </Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export type ServiceSelectorProps = {
  services: Service[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  bottomOffset?: number;
};

const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  services,
  activeIndex,
  onIndexChange,
  styles: _parentStyles,
  bottomOffset = 0,
}) => {
  const { t } = useTranslation();
  const { colors } = useBusinessColors();

  const scrollY = useSharedValue(0);
  const listRef = React.useRef<Animated.FlatList<Service>>(null);
  /** -1 until first sync so initial activeIndex scrolls correctly */
  const lastIndex = React.useRef<number>(-1);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y / _itemFullSize;
    },
  });

  const scrollToIndex = React.useCallback(
    (idx: number, animated: boolean) => {
      const clamped = Math.max(0, Math.min(idx, services.length - 1));
      const offset = clamped * _itemFullSize;
      try {
        listRef.current?.scrollToOffset({ offset, animated });
      } catch {
        /* noop */
      }
    },
    [services.length]
  );

  React.useEffect(() => {
    if (services.length === 0) return;
    const clamped = Math.max(0, Math.min(activeIndex, services.length - 1));
    if (clamped !== lastIndex.current) {
      const animate = lastIndex.current >= 0;
      lastIndex.current = clamped;
      scrollToIndex(clamped, animate);
    }
  }, [activeIndex, services.length, scrollToIndex]);

  const onMomentumScrollEnd = React.useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const idx = Math.round(y / _itemFullSize);
      const clamped = Math.max(0, Math.min(idx, services.length - 1));
      const target = clamped * _itemFullSize;
      if (Math.abs(target - y) > 1) {
        scrollToIndex(clamped, true);
      }
      if (clamped !== lastIndex.current) {
        lastIndex.current = clamped;
        onIndexChange(clamped);
      }
    },
    [onIndexChange, scrollToIndex, services.length]
  );

  const verticalPad = (WIN_HEIGHT - _itemSize) / 2;

  if (services.length === 0) {
    return null;
  }

  /** Explicit height so FlatList lays out correctly inside ScrollView or flex parents */
  const listViewportHeight = Math.min(WIN_HEIGHT * 0.72, _itemFullSize * 4.2);

  return (
    <View
      style={{
        width: '100%',
        height: listViewportHeight,
        backgroundColor: 'transparent',
      }}
    >
      <Animated.FlatList
        ref={listRef}
        data={services}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: _spacing * 2,
          paddingHorizontal: _spacing * 2,
          paddingTop: verticalPad,
          paddingBottom: verticalPad + bottomOffset,
        }}
        onScroll={onScroll}
        scrollEventThrottle={1000 / 60}
        snapToInterval={_itemFullSize}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: _itemFullSize,
          offset: _itemFullSize * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <ServiceAnimatedCard
            service={item}
            index={index}
            scrollY={scrollY}
            primaryFallback={colors.primary}
            t={t}
            onPress={() => {
              lastIndex.current = index;
              onIndexChange(index);
              scrollToIndex(index, true);
            }}
          />
        )}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  cardTitle: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cardDescription: {
    fontWeight: '400',
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  metaChipText: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ServiceSelector;
