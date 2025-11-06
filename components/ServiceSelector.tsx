import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Service } from '@/lib/supabase';

const SCREEN = Dimensions.get('window');
const HEADER_HEIGHT = 320; // match barber carousel proportions for consistent framing
const CARD_WIDTH_PERCENT = 0.64;
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);

export type ServiceSelectorProps = {
  services: Service[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  bottomOffset?: number;
};

const ServiceSelector: React.FC<ServiceSelectorProps> = ({ services, activeIndex, onIndexChange, styles, bottomOffset }) => {
  const { t } = useTranslation();

  const getCurrentImageUrl = (idx: number) => {
    const service = services[idx];
    return (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || null;
  };

  const scrollX = useSharedValue(0);
  const listRef = React.useRef<FlatList>(null);
  const didInit = React.useRef(false);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));

  React.useEffect(() => {}, [activeIndex]);

  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const ITEM_GAP = 14;
  const ITEM_LENGTH = cardWidth + ITEM_GAP;
  const sidePadding = Math.max(0, (SCREEN.width - ITEM_LENGTH) / 2);
  const baseCount = Math.max(1, services.length);
  const LOOP_COUNT = 200;
  const totalItems = baseCount * LOOP_COUNT;
  const middleBase = Math.floor(totalItems / 2) - (Math.floor(totalItems / 2) % baseCount);
  const initialIndex = middleBase + (Math.max(0, activeIndex) % baseCount);
  // Use interval snapping with center alignment; correct drift on momentum end

  const centerToPhysicalIndex = React.useCallback(
    (physicalIndex: number, animated: boolean) => {
      try {
        const offset = ITEM_LENGTH * physicalIndex;
        (listRef.current as any)?.scrollToOffset?.({ offset, animated });
      } catch {}
    },
    [ITEM_LENGTH]
  );

  React.useEffect(() => {
    if (!didInit.current && services && services.length > 0) {
      didInit.current = true;
      try { centerToPhysicalIndex(initialIndex, false); } catch {}
      lastIndex.current = 0;
      try { onIndexChange(0); } catch {}
    }
  }, [services?.length, centerToPhysicalIndex, initialIndex, onIndexChange]);

  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollX.value = e.contentOffset.x;
    },
  });

  const HeroItem: React.FC<{ index: number }> = ({ index }) => {
    const baseIdx = baseCount > 0 ? ((index % baseCount) + baseCount) % baseCount : 0;
    const service = services[baseIdx];
    const uri = getCurrentImageUrl(baseIdx);
    const cardStyle = (useAnimatedStyle(() => {
      const pos = scrollX.value / ITEM_LENGTH;
      const scale = interpolate(pos, [index - 1, index, index + 1], [0.95, 1.05, 0.95], Extrapolate.CLAMP);
      const opacity = interpolate(pos, [index - 1, index, index + 1], [0.9, 1, 0.9], Extrapolate.CLAMP);
      return { transform: [{ scale: scale as any }] as any, opacity } as any;
    }) as any);

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => {
        try {
          const baseIdx = baseCount > 0 ? ((index % baseCount) + baseCount) % baseCount : 0;
          if (baseIdx !== lastIndex.current) {
            lastIndex.current = baseIdx;
            runOnJS(onIndexChange)(baseIdx);
          }
          // Smoothly center the tapped item by scrolling to its exact physical index
          centerToPhysicalIndex(index, true);
        } catch {}
      }} style={{ width: ITEM_LENGTH, alignItems: 'center', paddingHorizontal: 4 }}>
        <Animated.View
          style={[{
            width: cardWidth,
            height: HEADER_HEIGHT,
            borderRadius: 34,
            overflow: 'visible',
            backgroundColor: 'transparent',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.26,
            shadowRadius: 26,
            elevation: 14,
          }, cardStyle]}
        >
          {/* Subtle border so the carousel window stays airy and lets the dynamic background shine through */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -2,
              left: -2,
              right: -2,
              bottom: -2,
              borderRadius: 36,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.18)',
            }}
          />

          <View
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 34,
              overflow: 'hidden',
              backgroundColor: 'transparent',
            }}
          >
            {uri ? (
              <Image
                source={{ uri: uri as any }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: '#E5E5EA',
                }}
              />
            )}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '45%',
                backgroundColor: 'transparent',
              }}
            />
          </View>

          {/* Duration badge */}
          <View style={{ position: 'absolute', top: 16, left: 16 }}>
            <BlurView
              intensity={20}
              tint="light"
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.28)',
                backgroundColor: 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={14} color="#111827" />
                <Text style={{ color: '#111827', fontWeight: '800', fontSize: 13 }}>
                  {(service?.duration_minutes ?? 60) + 'm'}
                </Text>
              </View>
            </BlurView>
          </View>

          {/* Name + price */}
          <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, alignItems: 'center' }}>
            <BlurView
              intensity={20}
              tint="light"
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 24,
                overflow: 'hidden',
                borderWidth: 1.25,
                borderColor: 'rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(17,24,39,0.28)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
                elevation: 5,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -8,
                  left: -6,
                  width: '60%',
                  height: 28,
                  borderRadius: 18,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  opacity: 0.4,
                  transform: [{ rotate: '-12deg' }],
                }}
              />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '900',
                    fontSize: 17,
                    textShadowColor: 'rgba(0, 0, 0, 0.4)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 4,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    maxWidth: '68%',
                    marginRight: 12,
                  }}
                >
                  {service?.name || ''}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    borderWidth: 1,
                    borderColor: 'rgba(17,24,39,0.08)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={14}
                    color="#111827"
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ color: '#111827', fontWeight: '800', fontSize: 14 }}
                  >
                    {`${t('booking.price', '$')} ${service?.price ?? 0}`}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        position: 'relative',
        height: HEADER_HEIGHT + 200,
        marginBottom: 140,
        paddingTop: 60,
        paddingBottom: 56,
        backgroundColor: 'transparent',
      }}
    >
      {services.length > 0 && (
        <View style={{ flex: 1, justifyContent: 'center', direction: 'ltr' as any, paddingVertical: 12 }}>
        <AnimatedFlatList
          ref={listRef as any}
          data={Array.from({ length: totalItems })}
          keyExtractor={(_, idx: number) => `s-${idx}`}
          horizontal
          inverted={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          snapToInterval={ITEM_LENGTH}
          snapToAlignment="center"
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: ITEM_LENGTH, offset: ITEM_LENGTH * index, index })}
          contentContainerStyle={{ paddingLeft: sidePadding, paddingRight: sidePadding, paddingVertical: 24 }}
          onScroll={onScrollHandler as any}
          scrollEventThrottle={16}
          renderItem={({ index }) => <HeroItem index={index} />}
          onMomentumScrollEnd={(e: any) => {
            try {
              const x = Math.max(0, Number(e?.nativeEvent?.contentOffset?.x || 0));
              const idx = Math.round(x / ITEM_LENGTH);
              const expected = idx * ITEM_LENGTH;
              if (Math.abs(expected - x) > 0.5) {
                centerToPhysicalIndex(idx, true);
              }
              const baseIdx = baseCount > 0 ? ((idx % baseCount) + baseCount) % baseCount : 0;
              if (baseIdx !== lastIndex.current) {
                lastIndex.current = baseIdx;
                onIndexChange(baseIdx);
              }
              const guard = baseCount * 2;
              if (idx < guard || idx > (totalItems - guard)) {
                const target = middleBase + baseIdx;
                try { centerToPhysicalIndex(target, false); } catch {}
              }
            } catch {}
          }}
          removeClippedSubviews
          windowSize={7}
          maxToRenderPerBatch={7}
          updateCellsBatchingPeriod={40}
        />
        </View>
      )}
    </View>
  );
};

export default ServiceSelector;
