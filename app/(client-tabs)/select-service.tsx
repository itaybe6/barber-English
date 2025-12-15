import React, { useState, useEffect } from 'react';
import { Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { servicesApi } from '@/lib/api/services';
import { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { getCurrentClientLogo } from '@/src/theme/assets';

// Constants
const { width, height } = Dimensions.get('window');
const _slideWidth = width * 0.65;
const _slideHeight = _slideWidth * 1.5;
const _spacing = 16;
const _topSpacing = height - _slideHeight;

// Slide Props Type
type SlideProps = {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
};

// Slide Component
function Slide({ service, index, scrollX, onPress }: SlideProps) {
  const imageUri = (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || '';

  const containerStylez = useAnimatedStyle(() => {
    return {
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
    } as any;
  });

  const stylez = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotateZ: `${interpolate(
            scrollX.value,
            [index - 1, index, index + 1],
            [15, 0, -15],
            Extrapolation.CLAMP
          )}deg`,
        },
        {
          scale: interpolate(
            scrollX.value,
            [index - 1, index, index + 1],
            [1.6, 1, 1.6],
            Extrapolation.CLAMP
          ),
        },
      ],
    } as any;
  });

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
            width: _slideWidth,
            height: _slideHeight,
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

// Backdrop Image Component
function BackdropImage({
  service,
  index,
  scrollX,
}: {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const imageUri = (service as any)?.image_url || (service as any)?.cover_url || (service as any)?.image || '';

  const stylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        scrollX.value,
        [index - 1, index, index + 1],
        [0, 0.8, 0]
      ),
    } as any;
  });

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

// Service Details Component
function ServiceDetails({
  service,
  index,
  scrollX,
  colors,
}: {
  service: Service;
  index: number;
  scrollX: SharedValue<number>;
  colors: any;
}) {
  const stylez = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            [index - 1, index, index + 1],
            [width / 2, 0, -width / 2]
          ),
        },
      ],
      opacity: interpolate(
        scrollX.value,
        [index - 0.5, index, index + 0.5],
        [0, 1, 0]
      ),
    } as any;
  });

  return (
    <Animated.View
      style={[
        {
          gap: 12,
          position: 'absolute',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: width * 0.1,
        },
        stylez,
      ]}
    >
      <Text
        style={{
          fontSize: 26,
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
      
      {/* Price and Duration */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 4 }}>
        {typeof service?.price === 'number' && (
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.3)',
          }}>
            <Text
              style={{
                color: '#fff',
                fontSize: 22,
                fontWeight: '800',
                textShadowColor: 'rgba(0,0,0,0.3)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              ₪{service.price}
            </Text>
          </View>
        )}
        {typeof service?.duration_minutes === 'number' && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.3)',
          }}>
            <Ionicons name="time-outline" size={18} color="#fff" />
            <Text
              style={{
                color: '#fff',
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              {service.duration_minutes} min
            </Text>
          </View>
        )}
      </View>

      {/* Description if available */}
      {(service as any)?.description && (
        <Text
          style={{
            color: '#fff',
            opacity: 0.8,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: '500',
            marginTop: 8,
            maxWidth: '90%',
          }}
          numberOfLines={2}
        >
          {(service as any)?.description}
        </Text>
      )}
    </Animated.View>
  );
}

export default function SelectServiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useBusinessColors();

  const barberId = params.barberId as string;
  const barberName = params.barberName as string;

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollX = useSharedValue(0);

  // Load services filtered by barber
  useEffect(() => {
    const loadServices = async () => {
      setIsLoading(true);
      try {
        const list = await servicesApi.getAllServices();
        // Filter services by worker_id (barber)
        const filtered = barberId 
          ? list.filter((s: any) => String(s?.worker_id || '') === String(barberId))
          : list;
        setServices(filtered);
      } catch (e) {
        setServices([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadServices();
  }, [barberId]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x / (_slideWidth + _spacing);
  });

  const handleSelectService = () => {
    if (services.length === 0) return;
    const selectedService = services[activeIndex];
    router.push({
      pathname: '/(client-tabs)/book-appointment' as any,
      params: {
        barberId,
        barberName,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: String(selectedService.price || ''),
        serviceDuration: String(selectedService.duration_minutes || ''),
        fromServiceSelect: 'true',
      } as any,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {t('booking.loadingServices', 'Loading Services...')}
        </Text>
      </View>
    );
  }

  if (services.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="cut-outline" size={60} color="rgba(255,255,255,0.5)" />
        <Text style={[styles.loadingText, { marginTop: 16 }]}>
          {t('booking.noServices', 'No services available')}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary, marginTop: 24 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          <Text style={styles.backButtonText}>{t('common.goBack', 'Go Back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Backdrop Images */}
      <View style={StyleSheet.absoluteFillObject}>
        {services.map((service, index) => (
          <BackdropImage
            key={`bg-service-${service.id}`}
            index={index}
            service={service}
            scrollX={scrollX}
          />
        ))}
        {/* Dark overlay */}
        <View style={styles.overlay} />
      </View>

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: 8 }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrapper}>
            <Image
              source={getCurrentClientLogo()}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(client-tabs)/notifications' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Barber indicator */}
        {barberName && (
          <View style={styles.barberIndicator}>
            <Ionicons name="person" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.barberIndicatorText}>{barberName}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Service Details in Top Area */}
      <View style={[styles.detailsContainer, { height: _topSpacing * 0.45, marginTop: height * 0.12 }]}>
        {services.map((service, index) => (
          <ServiceDetails
            key={`details-${service.id}`}
            index={index}
            service={service}
            scrollX={scrollX}
            colors={colors}
          />
        ))}
      </View>

      {/* Carousel */}
      <Animated.FlatList
        data={services}
        keyExtractor={(item) => String(item.id)}
        style={{ opacity: 1, marginTop: -_topSpacing * 0.3 }}
        contentContainerStyle={{
          gap: _spacing,
          paddingHorizontal: (width - _slideWidth) / 2,
          alignItems: 'center',
          paddingBottom: Math.max(insets.bottom, 20) + 140,
        }}
        renderItem={({ item, index }) => (
          <Slide
            index={index}
            service={item}
            scrollX={scrollX}
            onPress={() => {
              setActiveIndex(index);
            }}
          />
        )}
        snapToInterval={_slideWidth + _spacing}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={1000 / 60}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(
            e.nativeEvent.contentOffset.x / (_slideWidth + _spacing)
          );
          if (newIndex >= 0 && newIndex < services.length) {
            setActiveIndex(newIndex);
          }
        }}
      />

      {/* Continue Button */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 20) + 80 },
        ]}
      >
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: colors.primary }]}
          onPress={handleSelectService}
          activeOpacity={0.9}
          disabled={services.length === 0}
        >
          <Text style={styles.continueButtonText}>
            {t('booking.continue', 'Continue')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerTitleWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 140,
    height: 50,
    tintColor: '#FFFFFF',
  },
  barberIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  barberIndicatorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 28,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});



