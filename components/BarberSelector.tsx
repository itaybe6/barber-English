import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList, I18nManager } from 'react-native';
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
const HEADER_HEIGHT = 320; // compact card height
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

  // Background cross-fade between current and next barber image
  const [bgCurrent, setBgCurrent] = React.useState<string | null>(barbers[activeIndex]?.image_url || null);
  const bgOpacity = useSharedValue(1);

  React.useEffect(() => {
    const nextUrl = barbers[activeIndex]?.image_url || null;
    if (nextUrl && nextUrl !== bgCurrent) {
      // Fade out current, swap instantly when invisible, fade in new
      bgOpacity.value = withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(setBgCurrent)(nextUrl);
          bgOpacity.value = 0;
          bgOpacity.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, barbers.length]);

  React.useEffect(() => {
    // Skip first render to avoid overriding our forced first index = 0
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    try {
      if (listRef.current && Number.isFinite(activeIndex)) {
        (listRef.current as any).scrollToIndex?.({ index: Math.max(0, activeIndex), animated: true, viewPosition: 0.5 });
      }
    } catch {}
  }, [activeIndex]);

  // Force default to visually leftmost item on initial mount (last index in RTL, first in LTR)
  React.useEffect(() => {
    if (!didInit.current && barbers && barbers.length > 0) {
      didInit.current = true;
      try { listRef.current?.scrollToIndex?.({ index: defaultIndex, animated: false, viewPosition: 0.5 }); } catch {}
      lastIndex.current = defaultIndex;
      try { onIndexChange(defaultIndex); } catch {}
      // Guard against late prop updates selecting a different index
      setTimeout(() => {
        try { listRef.current?.scrollToIndex?.({ index: defaultIndex, animated: false, viewPosition: 0.5 }); } catch {}
      }, 50);
    }
  }, [barbers?.length, defaultIndex]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollX.value = e.contentOffset.x;
    },
  });

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  const CarouselItem: React.FC<{ item: User; index: number }> = ({ item, index }) => {
    const cardStyle = (useAnimatedStyle(() => {
      const pos = scrollX.value / ITEM_SIZE;
      const scale = interpolate(pos, [index - 1, index, index + 1], [0.94, 1.08, 0.94], Extrapolate.CLAMP);
      const opacity = interpolate(pos, [index - 1, index, index + 1], [0.6, 1, 0.6], Extrapolate.CLAMP);
      return { transform: [{ scale: scale as any }] as any, opacity } as any;
    }) as any);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          try {
            (listRef.current as any)?.scrollToIndex?.({ index, animated: true, viewPosition: 0.5 });
          } catch {}
          onIndexChange(index);
        }}
      >
        <Animated.View style={[styles.carouselItem, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }, cardStyle]}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%', borderRadius: AVATAR_SIZE / 2 }} />
          ) : (
            <View style={[styles.carouselItemPlaceholder, { width: '100%', height: '100%', borderRadius: AVATAR_SIZE / 2 }]}>
              <Ionicons name="person" size={28} color="#8E8E93" />
            </View>
          )}
          {null}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const goPrev = React.useCallback(() => {
    try {
      if (!barbers || barbers.length === 0) return;
      const length = barbers.length;
      const next = ((activeIndex || 0) - 1 + length) % length;
      if (next !== activeIndex) onIndexChange(next);
    } catch {}
  }, [activeIndex, barbers.length]);

  const goNext = React.useCallback(() => {
    try {
      if (!barbers || barbers.length === 0) return;
      const length = barbers.length;
      const next = ((activeIndex || 0) + 1) % length;
      if (next !== activeIndex) onIndexChange(next);
    } catch {}
  }, [activeIndex, barbers.length]);

  const prevIdx = barbers.length > 0 ? (((activeIndex || 0) - 1 + barbers.length) % barbers.length) : 0;
  const nextIdx = barbers.length > 0 ? (((activeIndex || 0) + 1) % barbers.length) : 0;
  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const cardHorizontalMargin = (SCREEN.width - cardWidth) / 2;
  const sidePeekShift = Math.min(36, cardHorizontalMargin + 12);
  const canGoPrev = barbers.length > 1;
  const canGoNext = barbers.length > 1;

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 220, marginTop: 72, marginBottom: 148 }}>
      {/* Services/top overlay sits ABOVE the image, not on it */}
      {typeof renderTopOverlay === 'function' ? (
        <View style={{ marginTop: 44, marginHorizontal: 16 }}>
          {renderTopOverlay()}
        </View>
      ) : null}

      {/* Side preview cards (peeking) with elegant tilt */}
      {barbers.length > 1 && prevIdx !== activeIndex && (
        <View style={{ position: 'absolute', left: -sidePeekShift - 8, top: 128, width: cardWidth * 0.74, height: HEADER_HEIGHT - 40, borderRadius: 20, overflow: 'hidden', transform: [{ rotateZ: '-2deg' }, { scale: 0.92 }], opacity: 0.65 }}>
          {barbers[prevIdx]?.image_url ? (
            <Image source={{ uri: barbers[prevIdx].image_url as any }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: '#E5E5EA' }} />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
      )}
      {barbers.length > 1 && nextIdx !== activeIndex && (
        <View style={{ position: 'absolute', right: -sidePeekShift - 8, top: 128, width: cardWidth * 0.74, height: HEADER_HEIGHT - 40, borderRadius: 20, overflow: 'hidden', transform: [{ rotateZ: '2deg' }, { scale: 0.92 }], opacity: 0.65 }}>
          {barbers[nextIdx]?.image_url ? (
            <Image source={{ uri: barbers[nextIdx].image_url as any }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: '#E5E5EA' }} />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
      )}

      <View style={{ height: HEADER_HEIGHT, marginTop: 56, marginHorizontal: cardHorizontalMargin, width: cardWidth, borderRadius: 20, overflow: 'hidden', backgroundColor: '#F2F2F7', zIndex: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 10 }}>
        {!!bgCurrent && (
          <Animated.Image source={{ uri: bgCurrent }} style={[{ width: '100%', height: '100%' }, bgStyle]} resizeMode="cover" fadeDuration={0 as any} />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        {/* Bottom glass name pill with action icon (call) */}
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' }}>
          <BlurView intensity={28} tint="light" style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.35)',
            backgroundColor: 'rgba(255,255,255,0.16)'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text numberOfLines={1} style={{
                color: '#FFFFFF',
                fontWeight: '800',
                fontSize: 16,
                textShadowColor: 'rgba(255,255,255,0.6)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
                flexShrink: 1,
              }}>
                {barbers[activeIndex]?.name || ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2E7CF6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call-outline" size={18} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </BlurView>
        </View>

        {/* Glassmorphic arrow buttons with beautiful styling */}
        <View style={{ position: 'absolute', top: '50%', left: 12, transform: [{ translateY: -28 }], zIndex: 10, opacity: canGoPrev ? 1 : 0.4 }}>
          <TouchableOpacity
            onPress={() => { if (canGoPrev) goPrev(); }}
            activeOpacity={0.75}
            style={{ 
              width: 56, 
              height: 56, 
              borderRadius: 28, 
              alignItems: 'center', 
              justifyContent: 'center', 
              overflow: 'hidden', 
              borderWidth: 1.5, 
              borderColor: 'rgba(255,255,255,0.5)', 
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 6 }, 
              shadowOpacity: 0.2, 
              shadowRadius: 16, 
              elevation: 8,
              backgroundColor: 'transparent'
            }}
            disabled={!canGoPrev}
          >
            <BlurView intensity={36} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <Ionicons name="chevron-back-outline" size={28} color="#1C1C1E" style={{ fontWeight: '800' } as any} />
          </TouchableOpacity>
        </View>
        <View style={{ position: 'absolute', top: '50%', right: 12, transform: [{ translateY: -28 }], zIndex: 10, opacity: canGoNext ? 1 : 0.4 }}>
          <TouchableOpacity
            onPress={() => { if (canGoNext) goNext(); }}
            activeOpacity={0.75}
            style={{ 
              width: 56, 
              height: 56, 
              borderRadius: 28, 
              alignItems: 'center', 
              justifyContent: 'center', 
              overflow: 'hidden', 
              borderWidth: 1.5, 
              borderColor: 'rgba(255,255,255,0.5)', 
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 6 }, 
              shadowOpacity: 0.2, 
              shadowRadius: 16, 
              elevation: 8,
              backgroundColor: 'transparent'
            }}
            disabled={!canGoNext}
          >
            <BlurView intensity={36} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <Ionicons name="chevron-forward-outline" size={28} color="#1C1C1E" style={{ fontWeight: '800' } as any} />
          </TouchableOpacity>
        </View>
      </View>
      {/* keep extra spacing below */}
      <View style={{ height: 18 }} />
    </View>
  );
};

export default BarberSelector;
