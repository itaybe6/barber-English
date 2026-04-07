import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Clock3 } from 'lucide-react-native';
import Animated, { SharedValue } from 'react-native-reanimated';

import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const THUMB_SIZE = 56;

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
  /** When false, UI explains single-service selection only (toggle logic lives in parent). */
  multiSelectEnabled?: boolean;
  t: any;
  onSelectService: (service: Service, index: number) => void;
};

export default function ServiceSelection({
  visible,
  styles: parentStyles,
  step2FadeStyle,
  topOffset = 0,
  isLoading,
  services,
  selectedServiceId,
  selectedServiceIds,
  multiSelectEnabled = true,
  t,
  onSelectService,
}: Props) {
  const { colors } = useBusinessColors();

  if (!visible) return null;

  const isSvcSelected = (item: Service) => {
    const svcId = String((item as any).id ?? '');
    if (selectedServiceIds?.length) return selectedServiceIds.includes(svcId);
    return svcId === String(selectedServiceId ?? '');
  };

  return (
    <Animated.View
      style={[
        parentStyles.section,
        step2FadeStyle,
        {
          marginTop: Math.max(topOffset + 12, 16),
          marginBottom: 0,
        },
      ]}
    >
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', marginTop: 12 }]}>
            {t('booking.loadingServices', 'Loading services...')}
          </Text>
        </View>
      ) : services.length > 0 ? (
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {multiSelectEnabled
                ? t('booking.selectServices', 'Select Services')
                : t('booking.selectServiceTitle', 'Select a Service')}
            </Text>
            <Text style={styles.subtitle}>
              {multiSelectEnabled
                ? t('booking.selectMultipleHint', 'Tap to select one or more services')
                : t('booking.selectSingleServiceHint', 'Tap to choose one service')}
            </Text>
          </View>

          <View style={styles.list}>
            {services.map((service, index) => {
              const rowKey = String((service as any).id ?? `svc-${index}`);
              return (
                <Animated.View key={rowKey} entering={bookingStepRowEntering(index)}>
                  <ServiceRow
                    service={service}
                    isSelected={isSvcSelected(service)}
                    primaryColor={colors.primary}
                    onPress={() => onSelectService(service, index)}
                    t={t}
                  />
                </Animated.View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.loadingState}>
          <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', fontSize: 17 }]}>
            {t('booking.noServices', 'No services available')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

type RowProps = {
  service: Service;
  isSelected: boolean;
  primaryColor: string;
  onPress: () => void;
  t: any;
};

function ServiceRow({
  service,
  isSelected,
  primaryColor,
  onPress,
  t,
}: RowProps) {
  const duration = (service as any)?.duration_minutes ?? 60;
  const price = (service as any)?.price ?? 0;
  const name = String((service as any)?.name || '');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={
        price > 0
          ? `${name}, ${duration} ${t('booking.min', 'min')}, ₪${price}`
          : `${name}, ${duration} ${t('booking.min', 'min')}`
      }
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {/* Price circle */}
      <View style={styles.priceRing}>
        <View style={styles.priceInner}>
          <Text
            style={[styles.priceText, { color: price > 0 ? primaryColor : '#9CA3AF' }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {price > 0 ? `₪${price}` : '—'}
          </Text>
        </View>
      </View>

      {/* Info pill */}
      <View
        style={[
          styles.infoPill,
          isSelected ? styles.infoPillSelected : styles.infoPillIdle,
        ]}
      >
        {isSelected ? (
          <View style={styles.checkSlot}>
            <Ionicons name="checkmark-circle" size={20} color={primaryColor} />
          </View>
        ) : null}
        <View style={styles.infoTextBlock}>
          <Text style={styles.serviceName} numberOfLines={2}>
            {name}
          </Text>
          <View style={styles.durationBadge}>
            <Clock3 size={12} color={primaryColor} strokeWidth={2.2} />
            <Text style={[styles.durationText, { color: primaryColor }]} numberOfLines={1}>
              {duration} {t('booking.min', "דק'")}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 36,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  list: {
    gap: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    direction: 'ltr',
    gap: 10,
  },
  rowPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  priceRing: {
    width: THUMB_SIZE + 6,
    height: THUMB_SIZE + 6,
    borderRadius: (THUMB_SIZE + 6) / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  priceInner: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 20,
    gap: 8,
  },
  infoPillIdle: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoPillSelected: {
    backgroundColor: '#FFFFFF',
    /* Match idle border so selected/unselected pills keep the same outer size (avoids layout jump). */
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoTextBlock: {
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    textAlign: 'right',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  checkSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
