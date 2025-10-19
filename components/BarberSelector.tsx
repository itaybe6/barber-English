import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList } from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@/lib/supabase';

// Local constants (keep consistent with the booking screen)
const AVATAR_SIZE = 68;
const ITEM_SPACING = 16;
const ITEM_SIZE = AVATAR_SIZE + ITEM_SPACING;
const SCREEN = Dimensions.get('window');
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);

export type BarberSelectorProps = {
  barbers: User[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  renderTopOverlay?: () => React.ReactNode;
  bottomOffset?: number;
};

const BarberSelector: React.FC<BarberSelectorProps> = ({ barbers, activeIndex, onIndexChange, styles, renderTopOverlay, bottomOffset }) => {
  const scrollX = useSharedValue(Math.max(0, activeIndex) * ITEM_SIZE);
  const listRef = React.useRef<FlatList>(null);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));

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
    try {
      if (listRef.current && Number.isFinite(activeIndex)) {
        listRef.current.scrollToOffset({ offset: Math.max(0, activeIndex) * ITEM_SIZE, animated: true });
      }
    } catch {}
  }, [activeIndex]);

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
            listRef.current?.scrollToOffset({ offset: index * ITEM_SIZE, animated: true });
          } catch {}
          onIndexChange(index);
        }}
      >
        <Animated.View style={[styles.carouselItem, cardStyle]}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.carouselItemImage} />
          ) : (
            <View style={[styles.carouselItemImage, styles.carouselItemPlaceholder]}>
              <Ionicons name="person" size={28} color="#8E8E93" />
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.carouselContainer}>
      {!!bgCurrent && (
        <Animated.Image source={{ uri: bgCurrent }} style={[styles.bgImage, bgStyle]} resizeMode="cover" fadeDuration={0 as any} />
      )}
      <View style={styles.bgDimOverlay} />
      {typeof renderTopOverlay === 'function' ? (
        <View style={styles.carouselTopOverlay}>{renderTopOverlay()}</View>
      ) : null}

      <View style={[styles.carouselBottomArea, { bottom: (bottomOffset ?? 28) }]}>
        <AnimatedFlatList
          ref={listRef as any}
          horizontal
          data={barbers}
          keyExtractor={(it: User) => String(it.id)}
          renderItem={({ item, index }) => <CarouselItem item={item} index={index} />}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_SIZE}
          decelerationRate="fast"
          bounces={false}
          style={styles.carouselList}
          contentContainerStyle={{ paddingHorizontal: (SCREEN.width - ITEM_SIZE) / 2 }}
          onScroll={scrollHandler}
          onMomentumScrollEnd={(e: any) => {
            const raw = e.nativeEvent.contentOffset.x / ITEM_SIZE;
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
