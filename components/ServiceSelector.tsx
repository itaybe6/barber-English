import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Service } from '@/lib/supabase';

const AVATAR_SIZE = 68;
const ITEM_SPACING = 16;
const SERVICE_ITEM = AVATAR_SIZE + ITEM_SPACING; // match barber item size
const SCREEN = Dimensions.get('window');
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);
const HEADER_HEIGHT = 600; // increase header image height for better prominence

export type ServiceSelectorProps = {
  services: Service[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  bottomOffset?: number;
};

const ServiceSelector: React.FC<ServiceSelectorProps> = ({ services, activeIndex, onIndexChange, styles, bottomOffset }) => {
  const { t } = useTranslation();
  const scrollX = useSharedValue(Math.max(0, activeIndex) * SERVICE_ITEM);
  const listRef = React.useRef<FlatList>(null);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));

  const getCurrentImageUrl = (idx: number) => {
    const service = services[idx];
    return (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || null;
  };

  const [bgCurrent, setBgCurrent] = React.useState<string | null>(getCurrentImageUrl(activeIndex));
  const bgOpacity = useSharedValue(1);

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

  React.useEffect(() => {
    try {
      if (listRef.current && Number.isFinite(activeIndex)) {
        // Avoid fighting user when momentum is in progress by animating only if index drifted
        const target = Math.max(0, activeIndex) * SERVICE_ITEM;
        listRef.current.scrollToOffset({ offset: target, animated: true });
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

  const CarouselItem: React.FC<{ item: Service; index: number }> = ({ item, index }) => {
    const cardStyle = (useAnimatedStyle(() => {
      const pos = scrollX.value / SERVICE_ITEM;
      const scale = interpolate(pos, [index - 1, index, index + 1], [0.94, 1.08, 0.94], Extrapolate.CLAMP);
      const opacity = interpolate(pos, [index - 1, index, index + 1], [0.6, 1, 0.6], Extrapolate.CLAMP);
      return { transform: [{ scale: scale as any }] as any, opacity } as any;
    }) as any);

    const imageUrl = (item as any)?.image_url || (item as any)?.cover_url || (item as any)?.image || null;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          try {
            listRef.current?.scrollToOffset({ offset: index * SERVICE_ITEM, animated: true });
          } catch {}
          onIndexChange(index);
        }}
      >
        <Animated.View style={[styles.carouselItem, cardStyle]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.carouselItemImage} />
          ) : (
            <View style={[styles.carouselItemImage, styles.carouselItemPlaceholder]}>
              <Ionicons name="cut" size={28} color="#8E8E93" />
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 240 }}>
      <View style={{ height: HEADER_HEIGHT, marginTop: 12, marginHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: '#F2F2F7' }}>
        {bgCurrent ? (
          <>
            <Animated.Image
              source={{ uri: bgCurrent }}
              style={[{ width: '100%', height: '100%' }, bgStyle]}
              resizeMode="cover"
              fadeDuration={0 as any}
            />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
            {/* Glass overlay with service name + price */}
            <View style={{ position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'center' }}>
              <BlurView intensity={28} tint="light" style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(255,255,255,0.16)'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Text numberOfLines={1} style={{
                    flexShrink: 1,
                    color: '#111827',
                    fontWeight: '800',
                    fontSize: 16,
                    textShadowColor: 'rgba(255,255,255,0.6)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2
                  }}>
                    {services[activeIndex]?.name || ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.08)' }}>
                    <Ionicons name="pricetag-outline" size={14} color="#111827" />
                    <Text style={{ color: '#111827', fontWeight: '800', fontSize: 14 }}>
                      {`${t('booking.price', '$')} ${services[activeIndex]?.price ?? 0}`}
                    </Text>
                  </View>
                </View>
              </BlurView>
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.carouselBottomArea, { bottom: (bottomOffset ?? 28) }]}>
        <AnimatedFlatList
          ref={listRef as any}
          horizontal
          data={services}
          keyExtractor={(it: Service) => String(it.id)}
          renderItem={({ item, index }) => <CarouselItem item={item} index={index} />}
          showsHorizontalScrollIndicator={false}
          snapToInterval={SERVICE_ITEM}
          snapToAlignment="center"
          disableIntervalMomentum={true}
          decelerationRate="fast"
          bounces={false}
          nestedScrollEnabled={false}
          style={styles.carouselList}
          contentContainerStyle={{ paddingHorizontal: (SCREEN.width - SERVICE_ITEM) / 2 }}
          onScroll={scrollHandler}
          onScrollEndDrag={(e: any) => {
            const raw = e.nativeEvent.contentOffset.x / SERVICE_ITEM;
            const idx = Math.round(raw);
            const clamped = Math.max(0, Math.min(services.length - 1, idx));
            if (clamped !== lastIndex.current) {
              lastIndex.current = clamped;
              onIndexChange(clamped);
            }
          }}
          onMomentumScrollEnd={(e: any) => {
            const raw = e.nativeEvent.contentOffset.x / SERVICE_ITEM;
            const idx = Math.round(raw);
            const clamped = Math.max(0, Math.min(services.length - 1, idx));
            if (clamped !== lastIndex.current) {
              lastIndex.current = clamped;
              onIndexChange(clamped);
            }
          }}
          scrollEventThrottle={16}
        />
        {null}
      </View>
    </View>
  );
};

export default ServiceSelector;
