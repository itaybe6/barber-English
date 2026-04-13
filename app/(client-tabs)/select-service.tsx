import React, { useState, useEffect } from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
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

import { servicesApi, filterServicesForBookingBarber } from '@/lib/api/services';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { getHomeLogoSourceFromUrl } from '@/src/theme/assets';
import BookingSummarySheet from '@/components/book-appointment/BookingSummarySheet';
import { CLIENT_FLOATING_TAB_BAR_HEIGHT } from '@/constants/clientTabBarInsets';

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
  isSelected: boolean;
  primaryColor: string;
  textColor: string;
  textMuted: string;
  durationLabel: string;
};

// Slide Component — white product card + price pill (aligned with staff-picker polish)
function Slide({
  service,
  index,
  scrollX,
  onPress,
  isSelected,
  primaryColor,
  textColor,
  textMuted,
  durationLabel,
}: SlideProps) {
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
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <Animated.View
        style={[
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isSelected ? 0.22 : 0.12,
            shadowRadius: 22,
            elevation: isSelected ? 12 : 7,
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
            backgroundColor: '#FFFFFF',
            borderWidth: isSelected ? 2.5 : 1,
            borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.07)',
            overflow: 'visible',
            paddingHorizontal: 14,
            paddingTop: 18,
            paddingBottom: 28,
          }}
        >
          {isSelected && (
            <View
              style={[
                styles.slideSelectedBadge,
                I18nManager.isRTL ? { left: 10 } : { right: 10 },
                { backgroundColor: primaryColor },
              ]}
            >
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
          )}

          <Animated.View
            style={[
              {
                flex: 1,
                alignItems: 'center',
              },
              stylez,
            ]}
          >
            <View
              style={[
                styles.slideIconRing,
                { backgroundColor: `${primaryColor}18` },
              ]}
            >
              <Ionicons name="cut-outline" size={30} color={primaryColor} />
            </View>

            <Text
              style={[styles.slideServiceName, { color: textColor }]}
              numberOfLines={3}
            >
              {service?.name || ''}
            </Text>

            {!!durationLabel && (
              <View style={styles.slideDurationRow}>
                <Ionicons name="time-outline" size={16} color={textMuted} />
                <Text style={[styles.slideDurationText, { color: textMuted }]}>
                  {durationLabel}
                </Text>
              </View>
            )}
          </Animated.View>

          {typeof service?.price === 'number' && (
            <View style={styles.slidePricePillWrap} pointerEvents="none">
              <View style={[styles.slidePricePill, { backgroundColor: primaryColor }]}>
                <Text style={styles.slidePricePillText}>₪{service.price}</Text>
              </View>
            </View>
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
  const stylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        scrollX.value,
        [index - 1, index, index + 1],
        [0, 0.8, 0]
      ),
    } as any;
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject as any, { backgroundColor: '#1a1a2e' }, stylez]}
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
  const barberImageUrl = typeof params.barberImageUrl === 'string' ? params.barberImageUrl : '';
  const multiBarber = params.multiBarber === '1';

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [homeLogoUrl, setHomeLogoUrl] = useState<string | null>(null);

  const scrollX = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    businessProfileApi.getProfile().then((p) => {
      if (cancelled) return;
      const raw = String(p?.home_logo_url ?? '').trim();
      setHomeLogoUrl(/^https?:\/\//i.test(raw) ? raw : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load services filtered by barber
  useEffect(() => {
    const loadServices = async () => {
      setIsLoading(true);
      try {
        const list = await servicesApi.getAllServices();
        const adminCount = multiBarber ? 2 : 1;
        const filtered = barberId
          ? filterServicesForBookingBarber(list, barberId, adminCount)
          : list;
        setServices(filtered);
      } catch (e) {
        setServices([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadServices();
  }, [barberId, multiBarber]);

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

      {/* Header — logo row + title/subtitle (same rhythm as select-staff) */}
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
              source={getHomeLogoSourceFromUrl(homeLogoUrl)}
              style={[styles.headerLogo, !homeLogoUrl && styles.headerLogoBundledWhite]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.headerButton} />
        </View>

        <View style={styles.heroTextBlock}>
          <Text
            style={styles.heroTitle}
            maxFontSizeMultiplier={1.35}
          >
            {t('booking.selectServiceTitle', 'Select a Service')}
          </Text>
          <Text
            style={styles.heroSubtitle}
            maxFontSizeMultiplier={1.3}
          >
            {t('booking.selectServiceSubtitle', 'Swipe through the cards and tap one to choose')}
          </Text>
          {!!barberName && (
            <View style={styles.barberIndicator}>
              <Ionicons name="person" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.barberIndicatorText}>{barberName}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* Service Details in Top Area */}
      <View style={[styles.detailsContainer, { height: _topSpacing * 0.38, marginTop: height * 0.02 }]}>
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
        style={{ opacity: 1, marginTop: -_topSpacing * 0.22 }}
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
            isSelected={activeIndex === index}
            primaryColor={colors.primary}
            textColor={colors.text}
            textMuted={colors.textSecondary}
            durationLabel={
              typeof item.duration_minutes === 'number'
                ? `${item.duration_minutes} ${t('booking.min', 'min')}`
                : ''
            }
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

      <BookingSummarySheet
        visible={!!barberId}
        chips={
          barberId
            ? [{ key: 'barber', kind: 'barber', label: barberName || '', imageUri: barberImageUrl || '' }]
            : []
        }
        primaryColor={colors.primary}
        bottomOffset={insets.bottom + CLIENT_FLOATING_TAB_BAR_HEIGHT}
        onChipPress={(kind) => {
          if (kind === 'barber') router.back();
          /* Already on service selection — service/day placeholders are visual hints only */
        }}
      />
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
  },
  headerLogoBundledWhite: {
    tintColor: '#FFFFFF',
  },
  heroTextBlock: {
    paddingHorizontal: 22,
    paddingBottom: 10,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  barberIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  barberIndicatorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  slideSelectedBadge: {
    position: 'absolute',
    top: 10,
    zIndex: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  slideIconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideServiceName: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.35,
    paddingHorizontal: 4,
    flex: 1,
    minHeight: 44,
  },
  slideDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 4,
  },
  slideDurationText: {
    fontSize: 14,
    fontWeight: '600',
  },
  slidePricePillWrap: {
    position: 'absolute',
    bottom: -11,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
  },
  slidePricePill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  slidePricePillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
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



