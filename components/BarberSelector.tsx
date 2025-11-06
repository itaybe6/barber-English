import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@/lib/supabase';

// Local constants (keep consistent with the booking screen)
const AVATAR_SIZE = 100; // slightly smaller to open up more breathing room
const ITEM_SPACING = 16;
const ITEM_SIZE = AVATAR_SIZE + ITEM_SPACING;
const SCREEN = Dimensions.get('window');
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);
const HEADER_HEIGHT = 320; // reduce card height so the background window feels taller
const CARD_WIDTH_PERCENT = 0.64; // shrink main card a bit to create more space between images

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


  // Infinite hero carousel configuration
  const LOOP_COUNT = 200;
  const baseCount = Math.max(1, barbers.length);

  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const HERO_ITEM_GAP = 14;
  const HERO_ITEM_LENGTH = cardWidth + HERO_ITEM_GAP;
  const sidePadding = Math.max(0, (SCREEN.width - HERO_ITEM_LENGTH) / 2);

  const centerToPhysicalIndex = React.useCallback(
    (physicalIndex: number, animated: boolean) => {
      try {
        const offset = HERO_ITEM_LENGTH * physicalIndex;
        (listRef.current as any)?.scrollToOffset?.({ offset, animated });
      } catch {}
    },
    [HERO_ITEM_LENGTH]
  );

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
      const pos = scrollX.value / HERO_ITEM_LENGTH;
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
            // Smoothly center the tapped item (this physical index), eliminating micro-misalignment
            centerToPhysicalIndex(index, true);
          } catch {}
        }}
        style={{ width: HERO_ITEM_LENGTH, alignItems: 'center', paddingHorizontal: 4 }}
      >
        <Animated.View
          style={[
            {
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
            },
            cardStyle,
          ]}
        >
          {/* Soft outline to keep the carousel window airy without hiding the background */}
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
              borderColor: 'rgba(255, 255, 255, 0)',
            }}
          />

          {/* Main card container stays fully transparent so the background hero image remains visible */}
          <View
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 34,
              overflow: 'hidden',
              backgroundColor: 'transparent',
            }}
          >
            {barber?.image_url ? (
              <Image
                source={{ uri: barber.image_url as any }}
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
            {/* Gentle gradient only on the lower portion to keep labels readable */}
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

          {/* Bottom glass name pill */}
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
                backgroundColor: 'transparent',
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
                  backgroundColor: 'transparent',
                  opacity: 0.4,
                  transform: [{ rotate: '-12deg' }],
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '900',
                    fontSize: 17,
                    textShadowColor: 'rgba(0,0,0,0.4)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 4,
                    flexShrink: 1,
                  }}
                >
                  {barber?.name || ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    delayPressIn={0}
                    onPressIn={() => {
                      if (telUrl) Linking.openURL(telUrl).catch(() => {});
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#2E7CF6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#2E7CF6',
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.35,
                      shadowRadius: 6,
                      elevation: 4,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="call-outline" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Initial scroll to the middle of the loop for seamless bi-directional scrolling
  const totalItems = baseCount * LOOP_COUNT;
  const middleBase = Math.floor(totalItems / 2) - (Math.floor(totalItems / 2) % baseCount);
  const initialIndex = middleBase + (Math.max(0, activeIndex) % baseCount);
  // Use interval snapping with center alignment; we'll correct any sub-pixel drift on momentum end

  React.useEffect(() => {
    if (!didInit.current && barbers && barbers.length > 0) {
      didInit.current = true;
      try {
        centerToPhysicalIndex(initialIndex, false);
      } catch {}
      lastIndex.current = 0;
      try { onIndexChange(0); } catch {}
    }
  }, [barbers?.length, centerToPhysicalIndex, initialIndex, onIndexChange]);

  // When external activeIndex changes (not from our own tap/scroll), center that item near middle band
  React.useEffect(() => {
    if (!barbers || barbers.length === 0) return;
    // If this is the same item we already centered on, don't jump to another duplicate
    if (activeIndex === lastIndex.current) return;
    try {
      const targetIndex = middleBase + (Math.max(0, activeIndex) % baseCount);
      centerToPhysicalIndex(targetIndex, true);
    } catch {}
  }, [activeIndex, baseCount, centerToPhysicalIndex, middleBase]);

  return (
    <View
      style={{
        position: 'relative',
        height: HEADER_HEIGHT + 320,
        marginTop: 0,
        marginBottom: 140,
        paddingTop: 60,
        paddingBottom: 56,
        backgroundColor: 'transparent',
      }}
    >
      {/* Services/top overlay sits ABOVE the image, not on it */}
      {typeof renderTopOverlay === 'function' ? (
        <View style={{ marginTop: 32, marginHorizontal: 16 }}>
          {renderTopOverlay()}
        </View>
      ) : null}

      {/* Infinite, snap-to-center hero carousel */}
      {barbers.length > 0 && (
        <View style={{ flex: 1, justifyContent: 'center', direction: 'ltr' as any, paddingVertical: 12 }}>
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
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({ length: HERO_ITEM_LENGTH, offset: HERO_ITEM_LENGTH * index, index })}
            contentContainerStyle={{ paddingLeft: sidePadding, paddingRight: sidePadding, paddingVertical: 24 }}
            onScroll={scrollHandler as any}
            scrollEventThrottle={16}
            renderItem={({ index }) => <HeroItem index={index} />}
            onMomentumScrollEnd={(e: any) => {
              try {
                const x = Math.max(0, Number(e?.nativeEvent?.contentOffset?.x || 0));
                const idx = Math.round(x / HERO_ITEM_LENGTH);
                // Ensure pixel-perfect centering by aligning to the exact offset
                const expected = idx * HERO_ITEM_LENGTH;
                if (Math.abs(expected - x) > 0.5) {
                  centerToPhysicalIndex(idx, true);
                }
                const baseIdx = baseCount > 0 ? ((idx % baseCount) + baseCount) % baseCount : 0;
                if (baseIdx !== lastIndex.current) {
                  lastIndex.current = baseIdx;
                  onIndexChange(baseIdx);
                }

                // Re-center to the middle band to simulate endless loop without hitting ends
                const guard = baseCount * 2;
                if (idx < guard || idx > (totalItems - guard)) {
                  const centerIndex = middleBase + baseIdx;
                  try {
                    centerToPhysicalIndex(centerIndex, false);
                  } catch {}
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
      {/* keep extra spacing below */}
      <View style={{ height: 28 }} />
    </View>
  );
};

export default BarberSelector;
