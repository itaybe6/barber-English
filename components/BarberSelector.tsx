import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList, I18nManager } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@/lib/supabase';

// Local constants (keep consistent with the booking screen)
const AVATAR_SIZE = 112; // larger avatar for better visibility
const ITEM_SPACING = 16;
const ITEM_SIZE = AVATAR_SIZE + ITEM_SPACING;
const SCREEN = Dimensions.get('window');
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);
const HEADER_HEIGHT = 700; // header image height with rounded top corners

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

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 200 }}>
      <View style={{ height: HEADER_HEIGHT, marginTop: 12, marginHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: '#F2F2F7' }}>
        {!!bgCurrent && (
          <Animated.Image source={{ uri: bgCurrent }} style={[{ width: '100%', height: '100%' }, bgStyle]} resizeMode="cover" fadeDuration={0 as any} />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        {/* Top name glass overlay (outside carousel items) */}
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'center' }}>
          <BlurView intensity={28} tint="light" style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.35)',
            backgroundColor: 'rgba(255,255,255,0.18)'
          }}>
            <Text numberOfLines={1} style={{
              color: '#111827',
              fontWeight: '800',
              fontSize: 16,
              textShadowColor: 'rgba(255,255,255,0.6)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2
            }}>
              {barbers[activeIndex]?.name || ''}
            </Text>
          </BlurView>
        </View>
      </View>

      <View style={[styles.carouselBottomArea, { bottom: (bottomOffset ?? 28) }]}>
        <AnimatedFlatList
          ref={listRef as any}
          horizontal
          data={barbers}
          keyExtractor={(it: User) => String(it.id)}
          renderItem={({ item, index }) => <CarouselItem item={item} index={index} />}
          initialScrollIndex={defaultIndex}
          getItemLayout={(_, index) => ({ length: ITEM_SIZE, offset: ITEM_SIZE * index, index })}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_SIZE}
          snapToAlignment="center"
          disableIntervalMomentum={true}
          decelerationRate="fast"
          bounces={false}
          nestedScrollEnabled={false}
          style={styles.carouselList}
          contentContainerStyle={contentPadding}
          onScroll={scrollHandler}
          onScrollToIndexFailed={(info: any) => {
            try {
              const wait = new Promise((resolve) => setTimeout(resolve, 60));
              wait.then(() => (listRef.current as any)?.scrollToIndex?.({ index: info.index, animated: false, viewPosition: 0.5 }));
            } catch {}
          }}
          onMomentumScrollEnd={(e: any) => {
            const padAdjust = (contentPadding as any).paddingLeft || 0; // base for index calc
            const x = e.nativeEvent.contentOffset.x + padAdjust;
            const raw = x / ITEM_SIZE;
            const idx = Math.round(raw);
            const clamped = Math.max(0, Math.min(barbers.length - 1, idx));
            if (clamped !== lastIndex.current) {
              lastIndex.current = clamped;
              onIndexChange(clamped);
            }
          }}
          scrollEventThrottle={16}
        />
        {Number.isFinite(activeIndex) && barbers[activeIndex] && (
          <Text style={styles.carouselActiveName} numberOfLines={1}>
            {barbers[activeIndex]?.name || ''}
          </Text>
        )}
      </View>
    </View>
  );
};

export default BarberSelector;
