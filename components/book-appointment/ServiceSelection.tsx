import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { Service } from '@/lib/supabase';

const SCREEN = Dimensions.get('window');
const SLIDE_WIDTH = SCREEN.width * 0.65;
const SLIDE_HEIGHT = SLIDE_WIDTH * 1.5;
const SLIDE_SPACING = 16;
const INTERVAL = SLIDE_WIDTH + SLIDE_SPACING;
const TOP_SPACING = SCREEN.height - SLIDE_HEIGHT;

type ServiceSlideProps = {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
};

function ServiceSlide({ service, index, scrollX, onPress }: ServiceSlideProps) {
  const imageUri = (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || '';

  const containerStylez = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [40, 0, 40],
          Extrapolation.CLAMP
        ),
      },
    ],
  }) as any);

  const stylez = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [0.92, 1, 0.92],
          Extrapolation.CLAMP
        ),
      },
    ],
  }) as any);

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress}>
      <Animated.View
        style={[
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 20,
            elevation: 7,
            borderRadius: 28,
          },
          containerStylez,
        ]}
      >
        <View
          style={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            borderRadius: 28,
            overflow: 'hidden',
            padding: 2,
            backgroundColor: 'rgba(0,0,0,0.1)',
          }}
        >
          {imageUri ? (
            <Animated.Image source={{ uri: imageUri }} style={[{ flex: 1, borderRadius: 26 }, stylez]} resizeMode="cover" />
          ) : (
            <Animated.View
              style={[
                {
                  flex: 1,
                  borderRadius: 26,
                  backgroundColor: '#8B5CF6',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                stylez,
              ]}
            >
              <Ionicons name="cut" size={80} color="rgba(255,255,255,0.5)" />
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function ServiceBackdrop({
  service,
  index,
  scrollX,
}: {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const imageUri = (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || '';

  const stylez = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [index - 1, index, index + 1], [0, 0.8, 0]),
  }) as any);

  if (!imageUri) {
    return (
      <Animated.View
        style={[StyleSheet.absoluteFillObject as any, { backgroundColor: '#1a1a2e' }, stylez]}
      />
    );
  }

  return (
    <Animated.Image
      source={{ uri: imageUri }}
      style={[StyleSheet.absoluteFillObject as any, stylez]}
      blurRadius={50}
      resizeMode="cover"
    />
  );
}

function ServiceDetailsOverlay({
  service,
  index,
  scrollX,
}: {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const stylez = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          [index - 1, index, index + 1],
          [SCREEN.width / 2, 0, -SCREEN.width / 2]
        ),
      },
    ],
    opacity: interpolate(scrollX.value, [index - 0.5, index, index + 0.5], [0, 1, 0]),
  }) as any);

  return (
    <Animated.View
      style={[
        {
          gap: 6,
          position: 'absolute',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SCREEN.width * 0.1,
        },
        stylez,
      ]}
    >
      <Text
        style={{
          fontSize: 24,
          color: 'white',
          fontWeight: '800',
          textAlign: 'center',
          letterSpacing: -0.5,
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        }}
      >
        {service?.name || ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
        {typeof (service as any)?.price === 'number' && (
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: '700',
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
          >
            ₪{(service as any).price}
          </Text>
        )}
        {typeof (service as any)?.duration_minutes === 'number' && (
          <Text
            style={{
              color: '#fff',
              opacity: 0.8,
              fontSize: 15,
              fontWeight: '500',
            }}
          >
            {(service as any).duration_minutes} min
          </Text>
        )}
      </View>
    </Animated.View>
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
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectService: (service: Service, index: number) => void;
};

export default function ServiceSelection({
  visible,
  styles,
  step2FadeStyle,
  topOffset,
  safeAreaBottom,
  isLoading,
  services,
  selectedServiceId,
  externalScrollX,
  t,
  onSelectService,
}: Props) {
  const scrollX = useSharedValue(0);
  const flatListRef = React.useRef<any>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    const raw = e.contentOffset?.x ?? 0;
    const v = raw / INTERVAL;
    scrollX.value = v;
    if (externalScrollX) externalScrollX.value = v;
  });

  const handleSelectIndex = React.useCallback(
    (index: number) => {
      const service = services[index];
      if (!service) return;
      try {
        flatListRef.current?.scrollToOffset?.({
          offset: index * INTERVAL,
          animated: true,
        });
      } catch {}
      onSelectService(service, index);
    },
    [services, onSelectService]
  );

  if (!visible) return null;

  const padding = (SCREEN.width - SLIDE_WIDTH) / 2;

  return (
    <Animated.View style={[styles.section, styles.sectionFullBleed, step2FadeStyle, { flex: 1, minHeight: SCREEN.height * 0.7 }]}>
      {isLoading ? (
        <View style={[styles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[styles.loadingText, { color: '#FFFFFF' }]}>{t('booking.loadingServices', 'Loading services...')}</Text>
        </View>
      ) : services.length > 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'transparent', direction: 'ltr' } as any}>
          {/* No local backdrop — the parent screen renders a full-screen backdrop based on scrollX */}

          <View style={{ height: TOP_SPACING * 0.35, justifyContent: 'flex-end', alignItems: 'center', marginTop: Math.max(0, topOffset - 12), paddingBottom: 40 }}>
            {services.map((service, index) => (
              <ServiceDetailsOverlay
                key={`details-${(service as any).id ?? index}`}
                index={index}
                service={service}
                scrollX={scrollX}
              />
            ))}
          </View>

          <Animated.FlatList
            ref={flatListRef}
            data={services}
            keyExtractor={(item: any, index) => String(item?.id ?? index)}
            style={{ flexGrow: 0, marginTop: -40 }}
            contentContainerStyle={{
              paddingHorizontal: padding,
              alignItems: 'center',
              paddingBottom: Math.max(safeAreaBottom, 20) + 140,
            }}
            renderItem={({ item, index }) => (
              <ServiceSlide
                index={index}
                service={item}
                scrollX={scrollX}
                onPress={() => handleSelectIndex(index)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ width: SLIDE_SPACING }} />}
            snapToInterval={INTERVAL}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            horizontal
            onScroll={onScroll}
            scrollEventThrottle={1}
            getItemLayout={(_, index) => ({
              length: INTERVAL,
              offset: INTERVAL * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round((e.nativeEvent.contentOffset?.x ?? 0) / INTERVAL);
              const safeIdx = Math.max(0, Math.min(idx, services.length - 1));
              const service = services[safeIdx];
              if (service && String((service as any).id ?? '') !== String(selectedServiceId ?? '')) {
                onSelectService(service, safeIdx);
              }
            }}
          />
        </View>
      ) : (
        <View style={[styles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[styles.loadingText, { color: '#FFFFFF' }]}>{t('booking.noServices', 'No services available')}</Text>
        </View>
      )}
    </Animated.View>
  );
}
