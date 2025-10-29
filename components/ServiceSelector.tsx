import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, FlatList, I18nManager } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Service } from '@/lib/supabase';

const SCREEN = Dimensions.get('window');
const HEADER_HEIGHT = 320; // compact height to mirror BarberSelector
const CARD_WIDTH_PERCENT = 0.68;
const STRIP_SHIFT = 20; // margin/offset calibration
const STRIP_TRANSLATE = 28; // hard translate to ensure visible shift left

export type ServiceSelectorProps = {
  services: Service[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  bottomOffset?: number;
};

const ServiceSelector: React.FC<ServiceSelectorProps> = ({ services, activeIndex, onIndexChange, styles, bottomOffset }) => {
  const { t } = useTranslation();

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

  React.useEffect(() => {}, [activeIndex]);

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const cardWidth = SCREEN.width * CARD_WIDTH_PERCENT;
  const cardHorizontalMargin = (SCREEN.width - cardWidth) / 2;
  const sidePeekShift = Math.min(36, cardHorizontalMargin + 12);
  const prevIdx = services.length > 0 ? (((activeIndex || 0) - 1 + services.length) % services.length) : 0;
  const nextIdx = services.length > 0 ? (((activeIndex || 0) + 1) % services.length) : 0;
  const canGoPrev = services.length > 1;
  const canGoNext = services.length > 1;
  const goPrev = React.useCallback(() => {
    if (!services || services.length === 0) return;
    const length = services.length;
    const next = ((activeIndex || 0) - 1 + length) % length;
    if (next !== activeIndex) onIndexChange(next);
  }, [activeIndex, services.length]);
  const goNext = React.useCallback(() => {
    if (!services || services.length === 0) return;
    const length = services.length;
    const next = ((activeIndex || 0) + 1) % length;
    if (next !== activeIndex) onIndexChange(next);
  }, [activeIndex, services.length]);

  return (
    <View style={{ position: 'relative', height: HEADER_HEIGHT + 220, marginBottom: -50 }}>
      <View style={{ transform: [{ translateX: -STRIP_TRANSLATE }] }}>
      {/* Side previews */}
      {services.length > 1 && prevIdx !== activeIndex && (
        <View style={{ position: 'absolute', left: -sidePeekShift - 8 - STRIP_SHIFT, top: 16, width: cardWidth * 0.74, height: HEADER_HEIGHT - 40, borderRadius: 20, overflow: 'hidden', transform: [{ rotateZ: '-2deg' }, { scale: 0.92 }], opacity: 0.65 }}>
          {services[prevIdx] && (
            <Image source={{ uri: getCurrentImageUrl(prevIdx) as any }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
      )}
      {services.length > 1 && nextIdx !== activeIndex && (
        <View style={{ position: 'absolute', right: -sidePeekShift - 8 + STRIP_SHIFT, top: 16, width: cardWidth * 0.74, height: HEADER_HEIGHT - 40, borderRadius: 20, overflow: 'hidden', transform: [{ rotateZ: '2deg' }, { scale: 0.92 }], opacity: 0.65 }}>
          {services[nextIdx] && (
            <Image source={{ uri: getCurrentImageUrl(nextIdx) as any }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
      )}

      {/* Main card */}
      <View style={{ height: HEADER_HEIGHT, marginTop: 24, marginLeft: cardHorizontalMargin - STRIP_SHIFT, marginRight: cardHorizontalMargin + STRIP_SHIFT, width: cardWidth, borderRadius: 20, overflow: 'hidden', backgroundColor: '#F2F2F7', zIndex: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 10 }}>
        {!!bgCurrent && (
          <Animated.Image source={{ uri: bgCurrent }} style={[{ width: '100%', height: '100%' }, bgStyle]} resizeMode="cover" fadeDuration={0 as any} />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
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

        {/* Arrows */}
        <View style={{ position: 'absolute', top: '50%', left: 12, transform: [{ translateY: -28 }], zIndex: 10, opacity: canGoPrev ? 1 : 0.4 }}>
          <TouchableOpacity onPress={goPrev} activeOpacity={0.75} disabled={!canGoPrev} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8, backgroundColor: 'transparent' }}>
            <BlurView intensity={36} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <Ionicons name="chevron-back-outline" size={28} color="#1C1C1E" />
          </TouchableOpacity>
        </View>
        <View style={{ position: 'absolute', top: '50%', right: 12, transform: [{ translateY: -28 }], zIndex: 10, opacity: canGoNext ? 1 : 0.4 }}>
          <TouchableOpacity onPress={goNext} activeOpacity={0.75} disabled={!canGoNext} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8, backgroundColor: 'transparent' }}>
            <BlurView intensity={36} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <Ionicons name="chevron-forward-outline" size={28} color="#1C1C1E" />
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </View>
  );
};

export default ServiceSelector;
