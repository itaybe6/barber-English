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
}

/** Moti `from` for the barber cell inner layer (flight from card). */
export interface BarberChipEntrance {
  translateX: number;
  translateY: number;
  scale: number;
}

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
 * Delta from measured card face (window coords) to first chip slot center (step 2, single chip).
 */
export function computeBarberEntranceFromRect(
  rect: { x: number; y: number; width: number; height: number },
  windowWidth: number,
  safeAreaTop: number,
  rtl: boolean
): BarberChipEntrance {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const stripTop = safeAreaTop + BOOKING_PROGRESS_STRIP_TOP_GAP;
  const endCy = stripTop + BOOKING_PROGRESS_STRIP_HEIGHT / 2;
  const endCx = slotCenterX(1, 0, windowWidth, H_PAD, GAP, rtl);
  const cellInner = BOOKING_PROGRESS_STRIP_HEIGHT - 14;
  const scale = clamp(Math.max(rect.width, rect.height) / cellInner, 1.04, 5.5);
  return {
    translateX: cx - endCx,
    translateY: cy - endCy,
    scale,
  };
}

interface Props {
  visible: boolean;
  safeAreaTop: number;
  primaryColor: string;
  chips: BookingProgressChipModel[];
  /** Set when advancing from barber step with a measured face rect; cleared when not used */
  barberEntrance: BarberChipEntrance | null;
  /** Bump to replay barber entrance (e.g. 1 → 2) */
  barberEntranceKey: number;
}

export default function BookingProgressChipsStrip({
  visible,
  safeAreaTop,
  primaryColor,
  chips,
  barberEntrance,
  barberEntranceKey,
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
      <View style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row', gap: GAP }]}>
        <AnimatePresence>
          {chips.map((chip, index) => {
            const fromTx = (winW * index) / 4;
            const squeezeFromX = rtl ? fromTx : -fromTx;
            const exitTx = rtl ? fromTx : -fromTx;
            const isBarber = chip.kind === 'barber';

            return (
              <MotiView
                key={chip.key}
                from={{
                  width: fullW,
                  ...(isBarber ? {} : { translateX: squeezeFromX }),
                }}
                animate={{
                  width: finalW,
                  translateX: 0,
                }}
                exit={{
                  width: 0,
                  ...(isBarber ? {} : { translateX: exitTx }),
                  opacity: 0,
                }}
                transition={{ type: 'timing', duration: 380 }}
                style={[
                  styles.cell,
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
                    transition={{ type: 'timing', duration: 560 }}
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
                ) : (
                  <View style={styles.textCell}>
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
                  </View>
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
  },
  row: {
    alignItems: 'stretch',
  },
  cell: {
    overflow: 'hidden',
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
});
