import React, { useCallback, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { SharedValue } from 'react-native-reanimated';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const GRID_H_PADDING = 14;
const GRID_GAP = 18;
const CARD_HEIGHT_RATIO = 1.11;
const CARD_CORNER = 56;
const CARD_BG_UNSELECTED = 'rgba(255,255,255,0.16)';
const CARD_BORDER_UNSELECTED = 'rgba(255,255,255,0.34)';
const CARD_BORDER_SELECTED = 'rgba(255,255,255,0.95)';
const CARD_BORDER_WIDTH_SELECTED = 5;
/** Pill sits on bottom frame; this much extends below the card */
const NAME_PILL_OUTSIDE = 20;
const NAME_PILL_H_PAD = 18;
const NAME_PILL_V_PAD = 10;

type Props = {
  visible: boolean;
  styles: any;
  introFadeStyle: any;
  topOffset: number;
  safeAreaBottom?: number;
  isLoading: boolean;
  barbers: User[];
  selectedBarberId?: string | number | null;
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectBarber: (barber: User) => void;
  /** Keeps parent in sync for “continue” (measureInWindow after layout / scroll). */
  onSelectedFaceWindowFrame?: (
    rect: { x: number; y: number; width: number; height: number } | null
  ) => void;
};

export interface BarberSelectionHandle {
  /** Reports window coordinates of the selected barber card face (photo area), or null if unavailable. */
  measureSelectedFaceInWindow: (
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void
  ) => void;
  /** Re-measure after scroll so “continue” uses the current on-screen position. */
  syncSelectedFaceFrame: () => void;
}

function primaryWithAlpha(hex: string, alpha: string): string {
  const h = hex.replace('#', '');
  if (h.length === 6) return `#${h}${alpha}`;
  return hex;
}

const BarberSelection = forwardRef<BarberSelectionHandle, Props>(function BarberSelection(
  {
    visible,
    styles: parentStyles,
    introFadeStyle,
    topOffset = 0,
    isLoading,
    barbers,
    selectedBarberId,
    t,
    onSelectBarber,
    onSelectedFaceWindowFrame,
  },
  ref
) {
  const { colors } = useBusinessColors();
  const { width: winW } = useWindowDimensions();
  const selectedFaceRef = useRef<View>(null);

  const reportFaceFrame = useCallback(() => {
    const node = selectedFaceRef.current;
    if (!node) {
      onSelectedFaceWindowFrame?.(null);
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      if (typeof w !== 'number' || typeof h !== 'number' || w < 12 || h < 12) {
        onSelectedFaceWindowFrame?.(null);
        return;
      }
      onSelectedFaceWindowFrame?.({ x, y, width: w, height: h });
    });
  }, [onSelectedFaceWindowFrame]);

  useImperativeHandle(
    ref,
    () => ({
    measureSelectedFaceInWindow(callback) {
      requestAnimationFrame(() => {
        const node = selectedFaceRef.current;
        if (!node) {
          callback(null);
          return;
        }
        node.measureInWindow((x, y, w, h) => {
          if (typeof w !== 'number' || typeof h !== 'number' || w < 12 || h < 12) {
            callback(null);
            return;
          }
          const r = { x, y, width: w, height: h };
          onSelectedFaceWindowFrame?.(r);
          callback(r);
        });
      });
    },
    syncSelectedFaceFrame() {
      requestAnimationFrame(reportFaceFrame);
    },
    }),
    [onSelectedFaceWindowFrame, reportFaceFrame]
  );

  const { cardW, cardH } = useMemo(() => {
    const inner = winW - GRID_H_PADDING * 2 - GRID_GAP;
    const w = Math.max(120, Math.floor(inner / 2));
    const h = Math.round(w * CARD_HEIGHT_RATIO);
    return { cardW: w, cardH: h };
  }, [winW]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        parentStyles.section,
        introFadeStyle,
        {
          marginTop: Math.max(topOffset + 12, 16),
          marginBottom: 0,
          marginHorizontal: 0,
        },
      ]}
    >
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              parentStyles.loadingText,
              { color: 'rgba(255,255,255,0.7)', marginTop: 14, fontSize: 15, fontWeight: '600' },
            ]}
          >
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : barbers.length > 0 ? (
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('booking.selectStaffTitle', 'Choose your stylist')}
            </Text>
            <Text style={styles.subtitle}>
              {t('booking.selectStaffSubtitle', 'Tap a team member below to continue')}
            </Text>
          </View>

          <View
            style={[
              styles.grid,
              { paddingHorizontal: GRID_H_PADDING, gap: GRID_GAP, direction: 'rtl' },
            ]}
          >
            {barbers.map((barber, index) => {
              const isSelected = String(barber.id ?? '') === String(selectedBarberId ?? '');
              const uri = (barber?.image_url as string | undefined) || '';
              const rowKey = String(barber.id ?? `barber-${index}`);

              return (
                <Animated.View
                  key={rowKey}
                  entering={bookingStepRowEntering(index)}
                  style={[styles.cardSlot, { width: cardW, marginBottom: NAME_PILL_OUTSIDE + 10 }]}
                >
                  <Pressable
                    onPress={() => onSelectBarber(barber)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={barber.name || t('booking.step.barber', 'Barber')}
                    android_ripple={{ color: primaryWithAlpha(colors.primary, '28') }}
                    style={({ pressed }) => [styles.cardPressable, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <View style={[styles.cardSlotInner, { width: cardW, height: cardH }]}>
                      <View
                        ref={isSelected ? selectedFaceRef : undefined}
                        collapsable={false}
                        onLayout={
                          isSelected
                            ? () => {
                                requestAnimationFrame(reportFaceFrame);
                              }
                            : undefined
                        }
                        style={[
                          styles.cardFace,
                          {
                            width: cardW,
                            height: cardH,
                            backgroundColor: isSelected ? '#FFFFFF' : CARD_BG_UNSELECTED,
                            borderWidth: isSelected ? CARD_BORDER_WIDTH_SELECTED : 1,
                            borderColor: isSelected ? CARD_BORDER_SELECTED : CARD_BORDER_UNSELECTED,
                            shadowColor: isSelected ? colors.primary : '#000',
                            shadowOpacity: isSelected ? 0.2 : 0.16,
                            shadowRadius: isSelected ? 14 : 10,
                            elevation: Platform.OS === 'android' ? (isSelected ? 6 : 4) : 0,
                          },
                        ]}
                      >
                        {uri ? (
                          <Image source={{ uri }} style={styles.imageFill} resizeMode="cover" />
                        ) : (
                          <View style={styles.imagePlaceholder}>
                            <Ionicons
                              name="person"
                              size={Math.round(cardH * 0.22)}
                              color="rgba(255,255,255,0.35)"
                            />
                          </View>
                        )}
                      </View>

                      <View style={styles.namePillWrap} pointerEvents="none">
                        <View
                          style={[
                            styles.namePill,
                            isSelected && styles.namePillSelected,
                          ]}
                        >
                          <Text
                            style={[styles.namePillText, { color: colors.primary }]}
                            numberOfLines={2}
                          >
                            {barber.name || ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.loadingState}>
          <Ionicons
            name="people-outline"
            size={52}
            color="rgba(255,255,255,0.3)"
            style={{ marginBottom: 14 }}
          />
          <Text
            style={[
              parentStyles.loadingText,
              { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
            ]}
          >
            {t('booking.noBarbers', 'No specialists available')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

export default BarberSelection;

const styles = StyleSheet.create({
  shell: {
    gap: 22,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    width: '100%',
  },
  cardSlot: {
    overflow: 'visible',
  },
  cardPressable: {
    overflow: 'visible',
  },
  cardSlotInner: {
    position: 'relative',
    overflow: 'visible',
  },
  cardFace: {
    borderRadius: CARD_CORNER,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
  },
  imageFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,36,1)',
  },
  namePillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -NAME_PILL_OUTSIDE,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  namePill: {
    maxWidth: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: NAME_PILL_V_PAD,
    paddingHorizontal: NAME_PILL_H_PAD,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  namePillSelected: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  namePillText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
