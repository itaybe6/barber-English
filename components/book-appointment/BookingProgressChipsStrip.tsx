import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  I18nManager,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { AnimatePresence, MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export const BOOKING_PROGRESS_STRIP_HEIGHT = 78;
export const BOOKING_PROGRESS_STRIP_TOP_GAP = 6;
/** Total vertical space to reserve below status bar (strip + gap) */
export const BOOKING_PROGRESS_STRIP_INSET =
  BOOKING_PROGRESS_STRIP_TOP_GAP + BOOKING_PROGRESS_STRIP_HEIGHT + 8;

export const H_PAD = 14;
export const GAP = 6;
const INNER_RADIUS = 14;

export interface BookingProgressChipModel {
  key: string;
  kind: 'barber' | 'service' | 'day' | 'time';
  label: string;
  imageUri?: string;
  /** Service chip: show name + price (matches list row flight). */
  serviceName?: string;
  servicePriceText?: string;
}

export type ChipFlightComputeOptions = {
  scaleMax?: number;
  /** Wide rows: use `min` or `height` so scale stays subtle (avoids huge zoom / digit jitter). */
  scaleBasis?: 'max' | 'height' | 'min';
};

/** Moti `from` for chip "flight" from a measured on-screen rect (barber face, service row, day cell). */
export interface ChipFlightEntrance {
  translateX: number;
  translateY: number;
  scale: number;
}

/** @deprecated Use ChipFlightEntrance — kept for existing imports */
export type BarberChipEntrance = ChipFlightEntrance;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Window X of vertical center of slot `index` when there are `count` slots (0 = first in reading order). */
export function slotCenterX(
  count: number,
  index: number,
  windowWidth: number,
  pad: number,
  gap: number,
  rtl: boolean
): number {
  const n = Math.max(1, count);
  const inner = windowWidth - 2 * pad - gap * Math.max(0, n - 1);
  const slotW = inner / n;
  if (rtl) {
    return windowWidth - pad - slotW / 2 - index * (slotW + gap);
  }
  return pad + slotW / 2 + index * (slotW + gap);
}

/**
 * Delta from measured source rect (window coords) to chip slot `slotIndex` when the strip shows `slotCount` chips.
 */
export function computeChipFlightEntranceFromRect(
  rect: { x: number; y: number; width: number; height: number },
  windowWidth: number,
  safeAreaTop: number,
  rtl: boolean,
  slotCount: number,
  slotIndex: number,
  options?: ChipFlightComputeOptions
): ChipFlightEntrance {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const stripTop = safeAreaTop + BOOKING_PROGRESS_STRIP_TOP_GAP;
  const endCy = stripTop + BOOKING_PROGRESS_STRIP_HEIGHT / 2;
  const endCx = slotCenterX(slotCount, slotIndex, windowWidth, H_PAD, GAP, rtl);
  const cellInner = BOOKING_PROGRESS_STRIP_HEIGHT - 14;
  const scaleMax = options?.scaleMax ?? 5.5;
  const basis = options?.scaleBasis ?? 'max';
  const dim =
    basis === 'height'
      ? rect.height
      : basis === 'min'
        ? Math.min(rect.width, rect.height)
        : Math.max(rect.width, rect.height);
  const scale = clamp(dim / cellInner, 1.06, scaleMax);
  return {
    translateX: cx - endCx,
    translateY: cy - endCy,
    scale,
  };
}

/** Barber only on strip (step 2): one slot. */
export function computeBarberEntranceFromRect(
  rect: { x: number; y: number; width: number; height: number },
  windowWidth: number,
  safeAreaTop: number,
  rtl: boolean
): ChipFlightEntrance {
  return computeChipFlightEntranceFromRect(rect, windowWidth, safeAreaTop, rtl, 1, 0);
}

interface Props {
  visible: boolean;
  safeAreaTop: number;
  primaryColor: string;
  chips: BookingProgressChipModel[];
  /** Set when advancing from barber step with a measured face rect; cleared when not used */
  barberEntrance: ChipFlightEntrance | null;
  /** Bump to replay barber entrance (e.g. 1 → 2) */
  barberEntranceKey: number;
  serviceEntrance?: ChipFlightEntrance | null;
  serviceEntranceKey?: number;
  dayEntrance?: ChipFlightEntrance | null;
  dayEntranceKey?: number;
}

export default function BookingProgressChipsStrip({
  visible,
  safeAreaTop,
  primaryColor,
  chips,
  barberEntrance,
  barberEntranceKey,
  serviceEntrance = null,
  serviceEntranceKey = 0,
  dayEntrance = null,
  dayEntranceKey = 0,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const fullW = Math.max(0, winW - H_PAD * 2);
  const n = chips.length;

  if (!visible || n === 0) return null;

  const finalW = n > 0 ? (fullW - (n - 1) * GAP) / n : fullW;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.shell,
        {
          top: safeAreaTop + BOOKING_PROGRESS_STRIP_TOP_GAP,
          left: H_PAD,
          width: fullW,
        },
      ]}
    >
      <View
        style={[styles.row, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', gap: GAP }]}
        collapsable={false}
      >
        <AnimatePresence>
          {chips.map((chip) => {
            const hasFlight = chip.kind === 'barber' || chip.kind === 'service' || chip.kind === 'day';

            const textChipBody = (
              <>
                {chip.kind === 'service' ? (
                  <Ionicons name="cut-outline" size={18} color={primaryColor} style={styles.kindIcon} />
                ) : chip.kind === 'day' ? (
                  <Ionicons name="calendar-outline" size={18} color={primaryColor} style={styles.kindIcon} />
                ) : (
                  <Ionicons name="time-outline" size={18} color={primaryColor} style={styles.kindIcon} />
                )}
                <Text style={styles.cellLabel} numberOfLines={2}>
                  {chip.label}
                </Text>
              </>
            );

            return (
              <MotiView
                key={chip.key}
                from={{ opacity: 0 }}
                animate={{ width: finalW, opacity: 1 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: 'timing', duration: 440, easing: Easing.out(Easing.cubic) }}
                style={[
                  styles.cell,
                  hasFlight ? styles.cellFlight : styles.cellClip,
                  {
                    height: BOOKING_PROGRESS_STRIP_HEIGHT,
                    borderRadius: INNER_RADIUS,
                  },
                ]}
              >
                {chip.kind === 'barber' ? (
                  <MotiView
                    key={barberEntrance ? `be-${barberEntranceKey}` : 'be-static'}
                    from={
                      barberEntrance
                        ? {
                            translateX: barberEntrance.translateX,
                            translateY: barberEntrance.translateY,
                            scale: barberEntrance.scale,
                          }
                        : { translateX: 0, translateY: 0, scale: 1 }
                    }
                    animate={{ translateX: 0, translateY: 0, scale: 1 }}
                    transition={{ type: 'timing', duration: 600, easing: Easing.out(Easing.cubic) }}
                    style={styles.barberInner}
                  >
                    {chip.imageUri ? (
                      <Image
                        source={{ uri: chip.imageUri }}
                        style={styles.barberImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.barberPlaceholder}>
                        <Ionicons name="person" size={38} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                  </MotiView>
                ) : chip.kind === 'service' ? (
                  // Ghost overlay (in book-appointment.tsx) handles the flight animation.
                  // The chip itself just fades in at its final strip position.
                  <View style={styles.flightInner}>
                    <View style={styles.serviceCircle}>
                      <Text
                        style={[styles.serviceCirclePrice, { color: primaryColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {chip.servicePriceText ?? '—'}
                      </Text>
                      <Text
                        style={styles.serviceCircleName}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                      >
                        {chip.serviceName ?? chip.label}
                      </Text>
                    </View>
                  </View>
                ) : chip.kind === 'day' ? (
                  <MotiView
                    key={dayEntrance ? `de-${dayEntranceKey}` : 'de-static'}
                    from={
                      dayEntrance
                        ? {
                            translateX: dayEntrance.translateX,
                            translateY: dayEntrance.translateY,
                            scale: dayEntrance.scale,
                          }
                        : { translateX: 0, translateY: 0, scale: 1 }
                    }
                    animate={{ translateX: 0, translateY: 0, scale: 1 }}
                    transition={{ type: 'timing', duration: 600, easing: Easing.out(Easing.cubic) }}
                    style={styles.flightInner}
                  >
                    <View style={styles.textCell}>{textChipBody}</View>
                  </MotiView>
                ) : (
                  <View style={styles.textCell}>{textChipBody}</View>
                )}
              </MotiView>
            );
          })}
        </AnimatePresence>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 30,
    overflow: 'visible',
  },
  row: {
    alignItems: 'stretch',
    overflow: 'visible',
  },
  /** Flight animation scales/moves outside the chip (barber, service, day). */
  cellFlight: {
    overflow: 'visible',
    zIndex: 50,
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  flightInner: {
    flex: 1,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellClip: {
    overflow: 'hidden',
  },
  cell: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  barberInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  barberImage: {
    width: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    height: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    borderRadius: (BOOKING_PROGRESS_STRIP_HEIGHT - 14) / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  barberPlaceholder: {
    width: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    height: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    borderRadius: (BOOKING_PROGRESS_STRIP_HEIGHT - 14) / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  kindIcon: {
    flexShrink: 0,
  },
  cellLabel: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  /** Single circle chip — mirrors barber photo circle with price + name stacked inside. */
  serviceCircle: {
    width: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    height: BOOKING_PROGRESS_STRIP_HEIGHT - 14,
    borderRadius: (BOOKING_PROGRESS_STRIP_HEIGHT - 14) / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  serviceCirclePrice: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  serviceCircleName: {
    fontSize: 8,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 10,
    marginTop: 1,
  },
});
