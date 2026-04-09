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

const H_PAD = 14;
const GAP = 6;
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

/** Moti `from` for chip “flight” from a measured on-screen rect (barber face, service row, day cell). */
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
  const rtl = I18nManager.isRTL;
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
        style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row', gap: GAP }]}
        collapsable={false}
      >
        <AnimatePresence>
          {chips.map((chip, index) => {
            const fromTx = (winW * index) / 4;
            const squeezeFromX = rtl ? fromTx : -fromTx;
            const exitTx = rtl ? fromTx : -fromTx;
            const isBarber = chip.kind === 'barber';
            const cellOverflow = isBarber || chip.kind === 'service' || chip.kind === 'day';
            /** Barber / service / day use inner “flight” from measured rect — no sideways squeeze on outer cell. */
            const skipHorizontalSqueeze = cellOverflow;

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
                from={{
                  width: fullW,
                  ...(skipHorizontalSqueeze ? {} : { translateX: squeezeFromX }),
                }}
                animate={{
                  width: finalW,
                  translateX: 0,
                }}
                exit={{
                  width: 0,
                  ...(skipHorizontalSqueeze ? {} : { translateX: exitTx }),
                  opacity: 0,
                }}
                transition={
                  skipHorizontalSqueeze
                    ? { type: 'timing', duration: 420, easing: Easing.out(Easing.cubic) }
                    : { type: 'timing', duration: 380 }
                }
                style={[
                  styles.cell,
                  cellOverflow ? styles.cellFlight : styles.cellClip,
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
                  <MotiView
                    key={serviceEntrance ? `se-${serviceEntranceKey}` : 'se-static'}
                    from={
                      serviceEntrance
                        ? {
                            translateX: serviceEntrance.translateX,
                            translateY: serviceEntrance.translateY,
                            scale: serviceEntrance.scale,
                          }
                        : { translateX: 0, translateY: 0, scale: 1 }
                    }
                    animate={{ translateX: 0, translateY: 0, scale: 1 }}
                    transition={{ type: 'timing', duration: 620, easing: Easing.out(Easing.cubic) }}
                    style={styles.textCellFlyInner}
                  >
                    <View style={styles.serviceFlyRoot}>
                      <View style={styles.serviceFlyPriceBubble}>
                        <Text
                          style={[styles.serviceFlyPriceText, { color: primaryColor }]}
                          numberOfLines={1}
                        >
                          {chip.servicePriceText ?? '—'}
                        </Text>
                      </View>
                      <Text
                        style={styles.serviceFlyNameText}
                        numberOfLines={2}
                      >
                        {chip.serviceName ?? chip.label}
                      </Text>
                    </View>
                  </MotiView>
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
                    style={styles.textCellFlyInner}
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
  /** Flight animation scales/moves outside the chip (barber / service / day). */
  cellFlight: {
    overflow: 'visible',
    zIndex: 50,
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  textCellFlyInner: {
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
  /** Mini copy of service list row: price bubble + name (flight + settled chip). */
  serviceFlyRoot: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    direction: 'ltr',
  },
  serviceFlyPriceBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
  },
  serviceFlyPriceText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  serviceFlyNameText: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.15,
    lineHeight: 13,
  },
});
