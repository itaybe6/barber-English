import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Service } from '@/lib/supabase';

const SCREEN = Dimensions.get('window');
const HEADER_HEIGHT = 360; // expanded a bit to avoid top/bottom clipping while keeping within window
const CENTER_NUDGE = 8; // pixels to nudge right so the selected card appears visually centered
const CARD_WIDTH_PERCENT = 0.68;
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

  const [bgCurrent, setBgCurrent] = React.useState<string | null>(getCurrentImageUrl(activeIndex));
  const bgOpacity = useSharedValue(1);
  const scrollX = useSharedValue(0);
  const listRef = React.useRef<FlatList>(null);
  const didInit = React.useRef(false);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));

  React.useEffect(() => {
    const nextUrl = getCurrentImageUrl(activeIndex);
    if (nextUrl && nextUrl !== bgCurrent) {
      bgOpacity.value = withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(setBgCurrent)(nextUrl);
          bgOpacity.value = 0;
          bgOpacity.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, services.length]);

  React.useEffect(() => {}, [activeIndex]);

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const ITEM_GAP = 14;
  const ITEM_LENGTH = cardWidth + ITEM_GAP;
  const sidePadding = Math.max(0, (SCREEN.width - ITEM_LENGTH) / 2 - CENTER_NUDGE);
  const baseCount = Math.max(1, services.length);
  const LOOP_COUNT = 200;
  const totalItems = baseCount * LOOP_COUNT;
  const middleBase = Math.floor(totalItems / 2) - (Math.floor(totalItems / 2) % baseCount);
  const initialIndex = middleBase + (Math.max(0, activeIndex) % baseCount);
  // Use interval snapping with center alignment; correct drift on momentum end

  React.useEffect(() => {
    if (!didInit.current && services && services.length > 0) {
      didInit.current = true;
      try { (listRef.current as any)?.scrollToIndex?.({ index: initialIndex, animated: false, viewPosition: 0.5 }); } catch {}
      lastIndex.current = 0;
      try { onIndexChange(0); } catch {}
    }
  }, [services?.length]);

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
      const pos = (scrollX.value - sidePadding) / ITEM_LENGTH;
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
          try { (listRef.current as any)?.scrollToIndex?.({ index, animated: true, viewPosition: 0.5 }); } catch {}
        } catch {}
      }} style={{ width: ITEM_LENGTH, alignItems: 'center', paddingHorizontal: 4 }}>
        <Animated.View style={[{ width: cardWidth, height: HEADER_HEIGHT, borderRadius: 38, overflow: 'visible', backgroundColor: 'transparent', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 }, cardStyle]}>
          {/* Outer glow ring */}
          <View style={{ position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 41, borderWidth: 3, borderColor: 'rgba(255,255,255,0.15)' }} />
          
          {/* Main card container */}
          <View style={{ width: '100%', height: '100%', borderRadius: 38, overflow: 'hidden' }}>
            {/* Liquid glass effect layers */}
            <BlurView intensity={22} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            
            {/* Multiple glass shine overlays */}
            <View style={{ position: 'absolute', top: -25, left: -15, width: '75%', height: 110, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.28)', opacity: 0.65, transform: [{ rotate: '-18deg' }] }} />
            <View style={{ position: 'absolute', bottom: -20, right: -10, width: '60%', height: 80, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.18)', opacity: 0.5, transform: [{ rotate: '12deg' }] }} />
            
            {/* Triple border for depth */}
            <View style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 35, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }} />
            <View style={{ position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 38, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.2)' }} />
          
            {uri ? (
              <Image source={{ uri: uri as any }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
            ) : (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#E5E5EA' }} />
            )}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          {/* Duration badge */}
          <View style={{ position: 'absolute', top: 12, left: 12 }}>
            <BlurView intensity={30} tint="light" style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.18)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={14} color="#111827" />
                <Text style={{ color: '#111827', fontWeight: '800', fontSize: 13 }}>
                  {(service?.duration_minutes ?? 60) + 'm'}
                </Text>
              </View>
            </BlurView>
          </View>
          {/* Name + price */}
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14, alignItems: 'center' }}>
            <BlurView intensity={32} tint="light" style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 24, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.2)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}>
              <View style={{ position: 'absolute', top: -8, left: -6, width: '60%', height: 32, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', opacity: 0.5, transform: [{ rotate: '-12deg' }] }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 17, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4, flexShrink: 1 }}>
                  {service?.name || ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                  <Ionicons name="pricetag-outline" size={14} color="#111827" />
                  <Text style={{ color: '#111827', fontWeight: '800', fontSize: 14 }}>
                    {`${t('booking.price', '$')} ${service?.price ?? 0}`}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 240, marginTop: -10, marginBottom: -30 }}>
      {services.length > 0 && (
        <View style={{ direction: 'ltr' as any, marginTop: 40 }}>
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
          getItemLayout={(_, index) => ({ length: ITEM_LENGTH, offset: sidePadding + ITEM_LENGTH * index, index })}
          contentContainerStyle={{ paddingLeft: sidePadding, paddingRight: sidePadding, marginTop: 24 }}
          onScroll={onScrollHandler as any}
          scrollEventThrottle={16}
          renderItem={({ index }) => <HeroItem index={index} />}
          onMomentumScrollEnd={(e: any) => {
            try {
              const x = Math.max(0, Number(e?.nativeEvent?.contentOffset?.x || 0));
              const idx = Math.round((x - sidePadding) / ITEM_LENGTH);
              const expected = sidePadding + idx * ITEM_LENGTH;
              if (Math.abs(expected - x) > 0.5) {
                try { (listRef.current as any)?.scrollToOffset?.({ offset: expected, animated: true }); } catch {}
              }
              const baseIdx = baseCount > 0 ? ((idx % baseCount) + baseCount) % baseCount : 0;
              if (baseIdx !== lastIndex.current) {
                lastIndex.current = baseIdx;
                onIndexChange(baseIdx);
              }
              const guard = baseCount * 2;
              if (idx < guard || idx > (totalItems - guard)) {
                const target = middleBase + baseIdx;
                try { (listRef.current as any)?.scrollToIndex?.({ index: target, animated: false, viewPosition: 0.5 }); } catch {}
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
