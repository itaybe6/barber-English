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
import { Clock3 } from 'lucide-react-native';
import Animated, { SharedValue, Easing, FadeIn } from 'react-native-reanimated';

const stepSlideUp = FadeIn.duration(400).easing(Easing.out(Easing.cubic)).withInitialValues({ opacity: 0, transform: [{ translateY: 60 }] });

import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const GRID_H_PAD = 14;
const GRID_GAP = 12;
const CARD_RADIUS = 28;
const TAGS_OVERLAP = 16;
/** Card width vs max half-column (higher = wider cards) */
const CARD_WIDTH_FRACTION = 0.97;

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
    multiSelectEnabled: _multiSelectEnabled = true,
    t,
    onSelectService,
  },
  ref
) {
  const { colors } = useBusinessColors();
  const { width: winW } = useWindowDimensions();
  const pendingTapRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const maxHalf = Math.floor((winW - GRID_H_PAD * 2 - GRID_GAP) / 2);
  const cardWidth = Math.max(120, Math.round(maxHalf * CARD_WIDTH_FRACTION));

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

  const isSvcSelected = (item: Service) => {
    const svcId = String((item as any).id ?? '');
    if (selectedServiceIds?.length) return selectedServiceIds.includes(svcId);
    return svcId === String(selectedServiceId ?? '');
  };

  const serviceRows: Service[][] = [];
  for (let i = 0; i < services.length; i += 2) {
    serviceRows.push(services.slice(i, i + 2));
  }

  return (
    <Animated.View
      entering={stepSlideUp}
      style={[
        parentStyles.section,
        step2FadeStyle,
        {
          /* ScrollView spacer already clears status bar + progress strip; avoid stacking topOffset again (was pushing grid to screen center). */
          marginTop: 4,
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
          <View style={styles.grid}>
            {serviceRows.map((row, rowIndex) => {
              const rowTrackW = cardWidth * 2 + GRID_GAP;
              const colPlaceholder = (
                <View
                  key={`ph-${rowIndex}`}
                  style={{ width: cardWidth }}
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                />
              );

              const renderCell = (service: Service, index: number) => {
                const rowKey = String((service as any).id ?? `svc-${index}`);
                const selected = isSvcSelected(service);
                return (
                  <Animated.View
                    key={rowKey}
                    entering={bookingStepRowEntering(index)}
                    style={[styles.gridCell, { width: cardWidth }]}
                  >
                    <ServiceRow
                      service={service}
                      isSelected={selected}
                      primaryColor={colors.primary}
                      cardWidth={cardWidth}
                      tapRectRef={pendingTapRectRef}
                      onSelect={() => onSelectService(service, index)}
                      t={t}
                    />
                  </Animated.View>
                );
              };

              return (
                <View key={`svc-row-${rowIndex}`} style={styles.gridRow}>
                  <View
                    style={[
                      styles.gridRowTrack,
                      {
                        width: rowTrackW,
                        gap: GRID_GAP,
                        /* RTL mirrors row() so [ph][card] would put the card on the LEFT; force LTR for the orphan row only so the card stays in the right column (under the right-hand service of the row above). */
                        ...(row.length === 1 ? { direction: 'ltr' as const } : null),
                      },
                    ]}
                  >
                    {row.length === 2 ? (
                      <>
                        {renderCell(row[0], rowIndex * 2)}
                        {renderCell(row[1], rowIndex * 2 + 1)}
                      </>
                    ) : (
                      <>
                        {colPlaceholder}
                        {renderCell(row[0], rowIndex * 2)}
                      </>
                    )}
                  </View>
                </View>
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
});

export default ServiceSelection;

type RowProps = {
  service: Service;
  isSelected: boolean;
  primaryColor: string;
  cardWidth: number;
  tapRectRef: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>;
  onSelect: () => void;
  t: any;
};

const ServiceRow = React.memo(function ServiceRow(
  { service, isSelected, primaryColor, cardWidth, tapRectRef, onSelect, t }: RowProps
) {
  const pricePillRef = useRef<View>(null);
  const duration = (service as any)?.duration_minutes ?? 60;
  const price = (service as any)?.price ?? 0;
  const name = String((service as any)?.name || '');
  const rtl = I18nManager.isRTL;

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

  const innerCardW = cardWidth - (isSelected ? 6 : 0);

  return (
    <View style={styles.cardSlot}>
      <Pressable
        onPress={captureRectAndSelect}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={
          price > 0
            ? `${name}, ${duration} ${t('booking.min', 'min')}, ₪${price}`
            : `${name}, ${duration} ${t('booking.min', 'min')}`
        }
        style={({ pressed }) => [pressed && styles.cardPressed]}
      >
        <View
          style={[
            styles.cardFrame,
            isSelected && { padding: 3, backgroundColor: primaryColor, borderRadius: CARD_RADIUS + 3 },
          ]}
        >
          <View
            style={[
              styles.cardFace,
              {
                width: innerCardW,
                borderRadius: CARD_RADIUS,
                borderWidth: isSelected ? 0 : StyleSheet.hairlineWidth,
                borderColor: 'rgba(15,23,42,0.06)',
              },
            ]}
          >
            {isSelected ? (
              <View style={[styles.selectedCheck, rtl ? { left: 10 } : { right: 10 }]}>
                <Ionicons name="checkmark-circle" size={22} color={primaryColor} />
              </View>
            ) : null}

            <View style={styles.cardBody}>
              <Text
                style={[styles.cardServiceName, rtl ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' }]}
                numberOfLines={3}
              >
                {name}
              </Text>
              <View style={styles.durationRow}>
                <Clock3 size={14} color={primaryColor} strokeWidth={2.2} />
                <Text
                  style={[
                    styles.durationText,
                    { color: primaryColor },
                    rtl ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' },
                  ]}
                  numberOfLines={1}
                >
                  {duration} {t('booking.min', "דק'")}
                </Text>
              </View>
            </View>

            <View style={styles.priceTagWrap} pointerEvents="box-none">
              <View
                ref={pricePillRef}
                collapsable={false}
                style={[styles.priceTag, { backgroundColor: primaryColor }]}
              >
                <Text
                  style={[
                    styles.priceTagText,
                    price <= 0 && styles.priceTagTextMuted,
                    rtl ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {price > 0 ? `₪${price}` : '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    gap: 0,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    width: '100%',
    alignItems: 'center',
    gap: 0,
  },
  gridRow: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: GRID_H_PAD,
    marginBottom: TAGS_OVERLAP + 8,
  },
  gridRowTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gridCell: {
    flexShrink: 0,
  },
  cardSlot: {
    alignItems: 'stretch',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  cardFrame: {
    borderRadius: CARD_RADIUS,
  },
  cardFace: {
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
    flexDirection: 'column',
    minHeight: 124,
    paddingBottom: TAGS_OVERLAP + 10,
    paddingTop: 12,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: TAGS_OVERLAP + 4,
    paddingTop: 6,
  },
  cardServiceName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.28,
    textAlign: 'center',
    lineHeight: 22,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    gap: 5,
    marginTop: 2,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  selectedCheck: {
    position: 'absolute',
    top: 8,
    zIndex: 2,
  },
  priceTagWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -TAGS_OVERLAP,
    alignItems: 'center',
    zIndex: 3,
  },
  priceTag: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  priceTagText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  priceTagTextMuted: {
    opacity: 0.88,
  },
});
