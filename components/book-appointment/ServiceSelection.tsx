import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native';
import Animated, { SharedValue, Easing, FadeIn } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

const stepSlideUp = FadeIn.duration(400).easing(Easing.out(Easing.cubic)).withInitialValues({ opacity: 0, transform: [{ translateY: 60 }] });

import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const LIST_H_PAD = 16;
const ICON_SIZE = 42;

/** True dashed line — RN `borderStyle: 'dashed'` is unreliable on Android. */
function DashedRowDivider({ width }: { width: number }) {
  const w = Math.max(40, Math.floor(width - 32));
  return (
    <View style={dashedDividerStyles.wrap} pointerEvents="none">
      <Svg width={w} height={3}>
        <Line
          x1={0}
          y1={1.5}
          x2={w}
          y2={1.5}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={1}
          strokeDasharray="5 6"
        />
      </Svg>
    </View>
  );
}

const dashedDividerStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
  /** Multi-select: narrow “Continue” below the list (not the bottom BookingStepTabs bar). */
  onContinueMulti?: () => void;
  t: any;
  onSelectService: (service: Service, index: number) => void;
};

export interface ServiceSelectionHandle {
  measureSelectedRowInWindow: (
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void
  ) => void;
}

const ServiceSelection = forwardRef<ServiceSelectionHandle, Props>(function ServiceSelection(
  {
    visible,
    styles: parentStyles,
    step2FadeStyle,
    topOffset: _topOffset = 0,
    isLoading,
    services,
    selectedServiceId,
    selectedServiceIds,
    multiSelectEnabled = true,
    onContinueMulti,
    t,
    onSelectService,
  },
  ref
) {
  const { colors } = useBusinessColors();
  const { width: winW } = useWindowDimensions();
  const pendingTapRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  /** ~full width inside `section` margins (16×2) + `shell` padding (LIST_H_PAD×2) */
  const dividerLineW = Math.max(80, Math.floor(winW - 32 - LIST_H_PAD * 2));

  useImperativeHandle(
    ref,
    () => ({
      measureSelectedRowInWindow(callback) {
        const cached = pendingTapRectRef.current;
        pendingTapRectRef.current = null;
        if (cached && cached.width >= 8 && cached.height >= 8) {
          callback(cached);
          return;
        }
        callback(null);
      },
    }),
    []
  );

  if (!visible) return null;

  const rtl = I18nManager.isRTL;

  const isSvcSelected = (item: Service) => {
    const svcId = String((item as any).id ?? '');
    if (selectedServiceIds?.length) return selectedServiceIds.includes(svcId);
    return svcId === String(selectedServiceId ?? '');
  };

  return (
    <Animated.View
      entering={stepSlideUp}
      style={[
        parentStyles.section,
        step2FadeStyle,
        {
          marginTop: 0,
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
            <Text style={styles.title} maxFontSizeMultiplier={1.35}>
              {t('booking.selectServiceTitle', 'Select a Service')}
            </Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
              {multiSelectEnabled
                ? t('booking.selectMultipleHint', 'Tap to select one or more services')
                : t('booking.selectSingleServiceHint', 'Tap to choose one service')}
            </Text>
          </View>

          {/* Clean vertical list inside a frosted white card */}
          <View style={styles.listCard}>
            {services.map((service, index) => {
              const svcKey = String((service as any).id ?? `svc-${index}`);
              const selected = isSvcSelected(service);
              const isLast = index === services.length - 1;
              return (
                <Animated.View
                  key={svcKey}
                  entering={bookingStepRowEntering(index)}
                >
                  <ServiceRow
                    service={service}
                    isSelected={selected}
                    primaryColor={colors.primary}
                    cardWidth={0}
                    tapRectRef={pendingTapRectRef}
                    onSelect={() => onSelectService(service, index)}
                    isLast={isLast}
                    t={t}
                  />
                  {!isLast && <DashedRowDivider width={dividerLineW} />}
                </Animated.View>
              );
            })}
          </View>

          {multiSelectEnabled &&
            typeof onContinueMulti === 'function' &&
            (selectedServiceIds?.length ?? 0) > 0 && (
              <View style={styles.continueWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('booking.continue', 'Continue')}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onContinueMulti();
                  }}
                  style={({ pressed }) => [
                    styles.continuePill,
                    {
                      borderColor: `${colors.primary}55`,
                      // RTL: `row` lays out from the right — text first (right), icon second (left), like the design reference.
                      flexDirection: 'row',
                    },
                    pressed && styles.continuePillPressed,
                  ]}
                >
                  <Text style={[styles.continuePillText, { color: colors.primary }]}>
                    {t('booking.continue', 'Continue')}
                  </Text>
                  {/* `direction: 'ltr'` prevents forceRTL from horizontally mirroring the SVG (otherwise `<` becomes `>`). */}
                  <View style={styles.continueChevronPhysical}>
                    {rtl ? (
                      <ChevronRight size={17} color={colors.primary} strokeWidth={2.2} />
                    ) : (
                      <ChevronLeft size={17} color={colors.primary} strokeWidth={2.2} />
                    )}
                  </View>
                </Pressable>
              </View>
            )}
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
});

export default ServiceSelection;

type RowProps = {
  service: Service;
  isSelected: boolean;
  primaryColor: string;
  cardWidth: number;
  tapRectRef: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>;
  onSelect: () => void;
  isLast?: boolean;
  t: any;
};

const ServiceRow = React.memo(function ServiceRow(
  { service, isSelected, primaryColor, tapRectRef, onSelect, isLast = false, t }: RowProps
) {
  const pricePillRef = useRef<View>(null);
  const duration = (service as any)?.duration_minutes ?? 60;
  const price = (service as any)?.price ?? 0;
  const name = String((service as any)?.name || '');
  const rtl = I18nManager.isRTL;
  const rowDir = rtl ? 'row-reverse' : 'row';

  const captureRectAndSelect = () => {
    requestAnimationFrame(() => {
      const node = pricePillRef.current;
      if (node) {
        node.measureInWindow((x, y, w, h) => {
          if (typeof w === 'number' && typeof h === 'number' && w >= 8 && h >= 8) {
            tapRectRef.current = { x, y, width: w, height: h };
          }
          onSelect();
        });
      } else {
        onSelect();
      }
    });
  };

  return (
    <Pressable
      onPress={captureRectAndSelect}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={
        price > 0
          ? `${name}, ${duration} ${t('booking.min', 'min')}, ₪${price}`
          : `${name}, ${duration} ${t('booking.min', 'min')}`
      }
      style={({ pressed }) => [
        styles.row,
        { flexDirection: rowDir },
        isSelected && { backgroundColor: `${primaryColor}0D` },
        pressed && styles.rowPressed,
      ]}
    >
      {/* Left: colored icon circle */}
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: `${primaryColor}18` },
          isSelected && { backgroundColor: `${primaryColor}28` },
        ]}
      >
        {isSelected
          ? <Ionicons name="checkmark" size={20} color={primaryColor} />
          : <Clock3 size={18} color={primaryColor} strokeWidth={2.2} />
        }
      </View>

      {/* Middle: name + duration — stretch full flex slot so wrapped RTL lines stay anchored to the icon side */}
      <View style={styles.rowMid}>
        <Text
          style={[
            styles.rowName,
            {
              color: isSelected ? primaryColor : '#111827',
              textAlign: rtl ? 'right' : 'left',
              writingDirection: rtl ? 'rtl' : 'ltr',
            },
          ]}
          numberOfLines={2}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.rowDuration,
            { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
          ]}
          numberOfLines={1}
        >
          {duration} {t('booking.min', "דק'")}
        </Text>
      </View>

      {/* Right: price pill */}
      <View
        ref={pricePillRef}
        collapsable={false}
        style={[
          styles.rowPricePill,
          {
            backgroundColor: isSelected ? primaryColor : `${primaryColor}14`,
          },
        ]}
      >
        <Text
          style={[
            styles.rowPriceText,
            { color: isSelected ? '#FFFFFF' : primaryColor },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {price > 0 ? `₪${price}` : '—'}
        </Text>
      </View>

      {/* dashed separator rendered outside the pressable so it doesn't affect hit area */}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  shell: {
    gap: 16,
    paddingHorizontal: LIST_H_PAD,
  },
  header: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** White frosted card that contains all service rows */
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 8,
  },
  continueWrap: {
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 8,
  },
  continuePill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 22,
    minWidth: 132,
    maxWidth: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  continuePillPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  continueChevronPhysical: {
    direction: 'ltr',
  },
  continuePillText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  /** Single service row */
  row: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 72,
    position: 'relative',
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowMid: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 21,
    width: '100%',
  },
  rowDuration: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
    letterSpacing: -0.1,
    width: '100%',
  },
  rowPricePill: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowPriceText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
