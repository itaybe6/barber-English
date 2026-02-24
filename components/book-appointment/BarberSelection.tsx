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

import type { User } from '@/lib/supabase';

const SCREEN = Dimensions.get('window');
const SLIDE_WIDTH = SCREEN.width * 0.65;
const SLIDE_HEIGHT = SLIDE_WIDTH * 1.5;
const SLIDE_SPACING = 16;
const INTERVAL = SLIDE_WIDTH + SLIDE_SPACING;
const TOP_SPACING = SCREEN.height - SLIDE_HEIGHT;

type BarberSlideProps = {
  barber: User;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
};

function BarberSlide({ barber, index, scrollX, onPress }: BarberSlideProps) {
  const imageUri = barber?.image_url || '';

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
            <Animated.Image
              source={{ uri: imageUri }}
              style={[{ flex: 1, borderRadius: 26 }, stylez]}
              resizeMode="cover"
            />
          ) : (
            <Animated.View
              style={[
                {
                  flex: 1,
                  borderRadius: 26,
                  backgroundColor: '#667eea',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                stylez,
              ]}
            >
              <Ionicons name="person" size={80} color="rgba(255,255,255,0.5)" />
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function BarberBackdrop({
  barber,
  index,
  scrollX,
}: {
  barber: User;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const imageUri = barber?.image_url || '';

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

function BarberDetailsOverlay({
  barber,
  index,
  scrollX,
}: {
  barber: User;
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
          fontSize: 26,
          color: 'white',
          fontWeight: '800',
          textTransform: 'capitalize',
          textAlign: 'center',
          letterSpacing: -0.5,
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        }}
      >
        {barber?.name || ''}
      </Text>
      {(barber as any)?.role && (
        <Text
          style={{
            color: '#fff',
            opacity: 0.7,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '500',
          }}
        >
          {(barber as any)?.role || 'Professional Barber'}
        </Text>
      )}
    </Animated.View>
  );
}

type Props = {
  visible: boolean;
  styles: any;
  introFadeStyle: any;
  heroDynamicHeight: number;
  safeAreaBottom: number;
  isLoading: boolean;
  barbers: User[];
  selectedBarberId?: string | number | null;
  t: any;
  onSelectBarber: (barber: User) => void;
};

export default function BarberSelection({
  visible,
  styles,
  introFadeStyle,
  heroDynamicHeight,
  safeAreaBottom,
  isLoading,
  barbers,
  selectedBarberId,
  t,
  onSelectBarber,
}: Props) {
  // scrollX: integer index of the centered card (0 = first barber, 1 = second, etc.)
  const scrollX = useSharedValue(0);
  const flatListRef = React.useRef<any>(null);

  // Simple, reliable: contentOffset.x / INTERVAL = card index centered.
  // Force LTR on the FlatList so this formula is always correct regardless of app locale.
  const onScroll = useAnimatedScrollHandler((e) => {
    const raw = e.contentOffset?.x ?? 0;
    scrollX.value = raw / INTERVAL;
  });

  const handleSelectIndex = React.useCallback(
    (index: number) => {
      const barber = barbers[index];
      if (!barber) return;
      // Scroll to center the tapped card
      try {
        flatListRef.current?.scrollToOffset?.({
          offset: index * INTERVAL,
          animated: true,
        });
      } catch {}
      onSelectBarber(barber);
    },
    [barbers, onSelectBarber]
  );

  if (!visible) return null;

  const padding = (SCREEN.width - SLIDE_WIDTH) / 2;

  return (
    <Animated.View style={[styles.section, styles.sectionFullBleed, introFadeStyle, { flex: 1, minHeight: SCREEN.height * 0.7 }]}>
      {isLoading ? (
        <View style={[styles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[styles.loadingText, { color: '#FFFFFF' }]}>{t('booking.loadingEmployees', 'Loading Employees...')}</Text>
        </View>
      ) : (
        // direction: 'ltr' fixes RTL (Hebrew) apps where FlatList horizontal offset goes negative/reversed
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'transparent', direction: 'ltr' } as any}>
          <View style={StyleSheet.absoluteFillObject}>
            {barbers.map((barber, index) => (
              <BarberBackdrop key={`bg-barber-${barber.id}`} index={index} barber={barber} scrollX={scrollX} />
            ))}
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' }} />
          </View>

          <View style={{ height: TOP_SPACING * 0.35, justifyContent: 'flex-end', alignItems: 'center', marginTop: heroDynamicHeight - 160, paddingBottom: 40 }}>
            {barbers.map((barber, index) => (
              <BarberDetailsOverlay key={`details-${barber.id}`} index={index} barber={barber} scrollX={scrollX} />
            ))}
          </View>

          <Animated.FlatList
            ref={flatListRef}
            data={barbers}
            keyExtractor={(item) => String(item.id)}
            style={{ flexGrow: 0, marginTop: -40 }}
            contentContainerStyle={{
              paddingHorizontal: padding,
              alignItems: 'center',
              paddingBottom: Math.max(safeAreaBottom, 20) + 140,
            }}
            renderItem={({ item, index }) => (
              <BarberSlide
                index={index}
                barber={item}
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
              // After scroll settles, pick the centered index and notify parent
              const idx = Math.round((e.nativeEvent.contentOffset?.x ?? 0) / INTERVAL);
              const safeIdx = Math.max(0, Math.min(idx, barbers.length - 1));
              const barber = barbers[safeIdx];
              if (barber && String(barber.id) !== String(selectedBarberId ?? '')) {
                onSelectBarber(barber);
              }
            }}
          />
        </View>
      )}
    </Animated.View>
  );
}
