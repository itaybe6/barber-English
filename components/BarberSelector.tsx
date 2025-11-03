import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList, I18nManager, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@/lib/supabase';

// Local constants (keep consistent with the booking screen)
const AVATAR_SIZE = 112; // larger avatar for better visibility
const ITEM_SPACING = 16;
const ITEM_SIZE = AVATAR_SIZE + ITEM_SPACING;
const SCREEN = Dimensions.get('window');
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);
const HEADER_HEIGHT = 380; // taller for better presence
const CARD_WIDTH_PERCENT = 0.68; // shrink main card a bit to create more space between images

export type BarberSelectorProps = {
  barbers: User[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  renderTopOverlay?: () => React.ReactNode;
  bottomOffset?: number;
};

const BarberSelector: React.FC<BarberSelectorProps> = ({ barbers, activeIndex, onIndexChange, styles, renderTopOverlay, bottomOffset }) => {
  const scrollX = useSharedValue(0);
  const listRef = React.useRef<FlatList>(null);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));
  const didInit = React.useRef(false);
  const didMount = React.useRef(false);

  const isRTL = I18nManager?.isRTL ?? false;
  const defaultIndex = React.useMemo(() => {
    return isRTL && barbers && barbers.length > 0 ? barbers.length - 1 : 0;
  }, [isRTL, barbers?.length]);

  const centerPad = Math.max(0, (SCREEN.width - ITEM_SIZE) / 2);
  const contentPadding = React.useMemo(() => {
    const left = Math.max(0, centerPad - 36);
    const right = Math.max(0, centerPad - 140);
    // Mirror for RTL so visually leftmost item can be centered and scroll remains valid
    return isRTL ? { paddingLeft: right, paddingRight: left } : { paddingLeft: left, paddingRight: right };
  }, [isRTL, centerPad]);

  // Infinite hero carousel configuration
  const LOOP_COUNT = 200;
  const baseCount = Math.max(1, barbers.length);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollX.value = e.contentOffset.x;
    },
  });

  // Hero card item renderer (wheel-like)
  const HeroItem: React.FC<{ index: number }> = ({ index }) => {
    const baseIndexReal = baseCount > 0 ? (index % baseCount + baseCount) % baseCount : 0;
    const barber = barbers[baseIndexReal];
    const telUrl = React.useMemo(() => {
      try {
        const raw = (barber as any)?.phone || (barber as any)?.phone_number || '';
        const cleaned = String(raw || '').replace(/\s+/g, '');
        return cleaned ? `tel:${cleaned}` : '';
      } catch { return ''; }
    }, [barber?.id, (barber as any)?.phone, (barber as any)?.phone_number]);

    const cardStyle = (useAnimatedStyle(() => {
      const pos = (scrollX.value - sidePadding) / HERO_ITEM_LENGTH;
      const scale = interpolate(pos, [index - 1, index, index + 1], [0.95, 1.05, 0.95], Extrapolate.CLAMP);
      const opacity = interpolate(pos, [index - 1, index, index + 1], [0.9, 1, 0.9], Extrapolate.CLAMP);
      return { transform: [{ scale: scale as any }] as any, opacity } as any;
    }) as any);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          try {
            const baseIdx = baseCount > 0 ? ((index % baseCount) + baseCount) % baseCount : 0;
            if (baseIdx !== lastIndex.current) {
              lastIndex.current = baseIdx;
              runOnJS(onIndexChange)(baseIdx);
            }
          } catch {}
        }}
        style={{ width: HERO_ITEM_LENGTH, alignItems: 'center', paddingHorizontal: 4 }}
      >
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
          
            {barber?.image_url ? (
              <Image source={{ uri: barber.image_url as any }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
            ) : (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#E5E5EA' }} />
            )}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          {/* Bottom glass name pill */}
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14, alignItems: 'center' }}>
            <BlurView intensity={32} tint="light" style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 24,
              overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.45)',
              backgroundColor: 'rgba(255,255,255,0.2)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 5
            }}>
              <View style={{ position: 'absolute', top: -8, left: -6, width: '60%', height: 32, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', opacity: 0.5, transform: [{ rotate: '-12deg' }] }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text numberOfLines={1} style={{
                  color: '#FFFFFF',
                  fontWeight: '900',
                  fontSize: 17,
                  textShadowColor: 'rgba(0,0,0,0.4)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 4,
                  flexShrink: 1,
                }}>
                  {barber?.name || ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    delayPressIn={0}
                    onPressIn={() => { if (telUrl) Linking.openURL(telUrl).catch(() => {}); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E7CF6', alignItems: 'center', justifyContent: 'center', shadowColor: '#2E7CF6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="call-outline" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const cardHorizontalMargin = (SCREEN.width - cardWidth) / 2;
  const HERO_ITEM_GAP = 14;
  const HERO_ITEM_LENGTH = cardWidth + HERO_ITEM_GAP;
  const sidePadding = Math.max(0, (SCREEN.width - HERO_ITEM_LENGTH) / 2);

  // Initial scroll to the middle of the loop for seamless bi-directional scrolling
  const totalItems = baseCount * LOOP_COUNT;
  const middleBase = Math.floor(totalItems / 2) - (Math.floor(totalItems / 2) % baseCount);
  const initialIndex = middleBase + (Math.max(0, activeIndex) % baseCount);

  React.useEffect(() => {
    if (!didInit.current && barbers && barbers.length > 0) {
      didInit.current = true;
      try {
        (listRef.current as any)?.scrollToIndex?.({ index: initialIndex, animated: false, viewPosition: 0.5 });
      } catch {}
      lastIndex.current = 0;
      try { onIndexChange(0); } catch {}
    }
  }, [barbers?.length]);

  // When external activeIndex changes, keep user near the middle to avoid reaching edges
  React.useEffect(() => {
    if (!barbers || barbers.length === 0) return;
    try {
      const visibleCenter = initialIndex; // keep around middle
      (listRef.current as any)?.scrollToIndex?.({ index: visibleCenter - (visibleCenter % baseCount) + (activeIndex % baseCount), animated: true, viewPosition: 0.5 });
    } catch {}
  }, [activeIndex, baseCount]);

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 220, marginTop: 20, marginBottom: 148 }}>
      {/* Services/top overlay sits ABOVE the image, not on it */}
      {typeof renderTopOverlay === 'function' ? (
        <View style={{ marginTop: 32, marginHorizontal: 16 }}>
          {renderTopOverlay()}
        </View>
      ) : null}

      {/* Infinite, snap-to-center hero carousel */}
      {barbers.length > 0 && (
        <View style={{ marginTop: 40, direction: 'ltr' as any }}>
          <AnimatedFlatList
            ref={listRef as any}
            data={Array.from({ length: totalItems })}
            keyExtractor={(_, idx: number) => `b-${idx}`}
            horizontal
            inverted={false}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
            snapToInterval={HERO_ITEM_LENGTH}
            snapToAlignment="center"
            disableIntervalMomentum
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({ length: HERO_ITEM_LENGTH, offset: sidePadding + HERO_ITEM_LENGTH * index, index })}
            contentContainerStyle={{ paddingLeft: sidePadding, paddingRight: sidePadding }}
            onScroll={useAnimatedScrollHandler({
              onScroll: (e) => {
                'worklet';
                scrollX.value = e.contentOffset.x;
              },
            }) as any}
            scrollEventThrottle={16}
            renderItem={({ index }) => <HeroItem index={index} />}
            onScrollEndDrag={(e: any) => {
              try {
                const x = Math.max(0, Number(e?.nativeEvent?.contentOffset?.x || 0));
                const idx = Math.round((x - sidePadding) / HERO_ITEM_LENGTH);
                const exact = sidePadding + Math.max(0, Math.min(totalItems - 1, idx)) * HERO_ITEM_LENGTH;
                if (Math.abs(x - exact) > 0.5) {
                  (listRef.current as any)?.scrollToOffset?.({ offset: exact, animated: true });
                }
              } catch {}
            }}
            onMomentumScrollEnd={(e: any) => {
              try {
                const x = Math.max(0, Number(e?.nativeEvent?.contentOffset?.x || 0));
                const idx = Math.round((x - sidePadding) / HERO_ITEM_LENGTH);
                const baseIdx = baseCount > 0 ? ((idx % baseCount) + baseCount) % baseCount : 0;
                if (baseIdx !== lastIndex.current) {
                  lastIndex.current = baseIdx;
                  onIndexChange(baseIdx);
                }

                // Programmatic settle to exact center
                const exact = sidePadding + Math.max(0, Math.min(totalItems - 1, idx)) * HERO_ITEM_LENGTH;
                if (Math.abs(x - exact) > 0.5) {
                  (listRef.current as any)?.sc