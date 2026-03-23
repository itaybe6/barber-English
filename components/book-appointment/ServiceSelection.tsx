import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  SharedValue,
} from 'react-native-reanimated';

import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const SCREEN = Dimensions.get('window');

type Props = {
  visible: boolean;
  styles: any;
  step2FadeStyle: any;
  topOffset: number;
  safeAreaBottom: number;
  isLoading: boolean;
  services: Service[];
  selectedServiceId?: string | number | null;
  selectedServiceIds?: string[];
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectService: (service: Service, index: number) => void;
  onContinue?: () => void;
};

export default function ServiceSelection({
  visible,
  styles: parentStyles,
  step2FadeStyle,
  topOffset,
  safeAreaBottom,
  isLoading,
  services,
  selectedServiceId,
  selectedServiceIds,
  t,
  onSelectService,
  onContinue,
}: Props) {
  const { colors } = useBusinessColors();

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        parentStyles.section,
        parentStyles.sectionFullBleed,
        step2FadeStyle,
        { flex: 1, minHeight: SCREEN.height * 0.7 },
      ]}
    >
      {isLoading ? (
        <View style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[parentStyles.loadingText, { color: '#6B7280' }]}>
            {t('booking.loadingServices', 'Loading services...')}
          </Text>
        </View>
      ) : services.length > 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Math.max(safeAreaBottom, 20) + 160,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(400)}
            style={s.headerWrap}
          >
            <Text style={s.headerTitle}>
              {t('booking.selectServices', 'Select Services')}
            </Text>
            <Text style={s.headerSub}>
              {t('booking.selectMultipleHint', 'Tap to select one or more services')}
            </Text>
          </Animated.View>

          {/* Service cards grid */}
          <View style={s.grid}>
            {(services || []).map((service, idx) => {
              const svcId = String((service as any).id ?? '');
              const isSelected = selectedServiceIds
                ? selectedServiceIds.includes(svcId)
                : svcId === String(selectedServiceId ?? '');
              const imageUri =
                (service as any)?.image_url ||
                (service as any)?.cover_url ||
                (service as any)?.image ||
                '';

              return (
                <Animated.View
                  key={(service as any).id ?? idx}
                  entering={FadeInDown.delay(120 + idx * 55).duration(400)}
                  style={s.cardOuter}
                >
                  <TouchableOpacity
                    onPress={() => onSelectService(service, idx)}
                    activeOpacity={0.88}
                    style={[
                      s.card,
                      isSelected && [s.cardSelected, { borderColor: colors.primary, shadowColor: colors.primary }],
                    ]}
                  >
                    {/* Image */}
                    <View style={s.imageWrap}>
                      {imageUri ? (
                        <Image
                          source={{ uri: imageUri }}
                          style={s.cardImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[s.cardImage, s.imagePlaceholder]}>
                          <Ionicons name="cut" size={32} color="rgba(255,255,255,0.55)" />
                        </View>
                      )}
                      {/* Price badge */}
                      <View style={s.priceBadge}>
                        <Text style={s.priceText}>₪{(service as any).price ?? 0}</Text>
                      </View>
                      {/* Selected checkmark */}
                      {isSelected && (
                        <View style={[s.checkBadge, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </View>

                    {/* Card info */}
                    <View style={s.info}>
                      <Text
                        numberOfLines={2}
                        style={[s.name, isSelected && { color: colors.primary }]}
                      >
                        {(service as any).name}
                      </Text>
                      <View style={s.metaRow}>
                        <Ionicons name="time-outline" size={13} color="#8E8E93" />
                        <Text style={s.duration}>
                          {(service as any).duration_minutes ?? 60} {t('booking.min', 'min')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          {/* Continue button */}
          {onContinue && (selectedServiceIds?.length ?? 0) > 0 && (
            <Animated.View
              entering={FadeInDown.delay(200).duration(380)}
              style={s.continueBtnWrap}
            >
              <TouchableOpacity
                onPress={onContinue}
                activeOpacity={0.88}
                style={[s.continueBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
              >
                <Text style={s.continueBtnText}>
                  {t('booking.continue', 'Continue')}
                  {(selectedServiceIds?.length ?? 0) > 1 ? ` (${selectedServiceIds!.length})` : ''}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      ) : (
        <View style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', fontSize: 17 }]}>
            {t('booking.noServices', 'No services available')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  headerWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#1C1C1E',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardOuter: {
    width: '47.5%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  cardSelected: {
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 9,
    transform: [{ scale: 1.02 }],
  },
  imageWrap: {
    width: '100%',
    height: 110,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.93)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
  },
  priceText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    zIndex: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  info: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.2,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  duration: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  continueBtnWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    width: '100%',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
