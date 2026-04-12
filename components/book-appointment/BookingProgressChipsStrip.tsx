import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  I18nManager,
  useWindowDimensions,
  Platform,
  Pressable,
} from 'react-native';
import { AnimatePresence, MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export const BOOKING_PROGRESS_STRIP_HEIGHT = 78;
export const BOOKING_PROGRESS_STRIP_TOP_GAP = 6;
/**
 * How far the white caption badge overlaps the bottom of the frosted chip (sits “on” the frame).
 * Keep in sync with `captionSlot` `marginTop`.
 */
export const BOOKING_PROGRESS_STRIP_CAPTION_OVERLAP = 11;
/**
 * Inner height budget for caption row (single-line tags; avoids oversized name strip when many chips).
 */
export const BOOKING_PROGRESS_STRIP_CAPTION_HEIGHT = 30;
/** Total vertical space to reserve below status bar (chips + captions + padding). */
export const BOOKING_PROGRESS_STRIP_INSET =
  BOOKING_PROGRESS_STRIP_TOP_GAP +
  BOOKING_PROGRESS_STRIP_HEIGHT +
  (BOOKING_PROGRESS_STRIP_CAPTION_HEIGHT - BOOKING_PROGRESS_STRIP_CAPTION_OVERLAP) +
  8;

export const H_PAD = 14;
export const GAP = 6;
const INNER_RADIUS = 14;

function StripMetaCard(props: {
  kind: 'service' | 'day' | 'time';
  /** When true, chip shows only the main surface (captions live in `ChipCaption` below). */
  chipSurfaceOnly?: boolean;
  /** Day / time: main label. Service: fallback title if `serviceTitle` missing. */
  primary: string;
  /** Service only: price line (e.g. ₪120). */
  price?: string;
  /** Service only: service name (shown large on top). */
  serviceTitle?: string;
  /** Day only: weekday on top (e.g. רביעי). */
  dayWeekday?: string;
  /** Day only: date line under weekday. */
  dayDateLine?: string;
  /** Time only: בוקר / צהריים / ערב under the clock. */
  timeDaypart?: string;
}) {
  const { kind, primary, price, serviceTitle, dayWeekday, dayDateLine, timeDaypart, chipSurfaceOnly } = props;

  if (kind === 'service') {
    const title = (serviceTitle ?? primary).trim() || '—';
    if (chipSurfaceOnly) {
      return (
        <View style={styles.metaCard}>
          <Text style={styles.metaServiceTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.62}>
            {title}
          </Text>
        </View>
      );
    }
    const priceLine = price ?? '—';
    return (
      <View style={styles.metaCard}>
        <Text style={styles.metaServiceTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.62}>
          {title}
        </Text>
        <Text style={styles.metaServicePriceBelow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
          {priceLine}
        </Text>
      </View>
    );
  }

  if (kind === 'day') {
    if (chipSurfaceOnly) {
      const dateOnly = (dayDateLine ?? primary).trim() || '—';
      return (
        <View style={styles.metaCard}>
          <Text style={styles.metaDayDatePrimary} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
            {dateOnly}
          </Text>
        </View>
      );
    }
    if (dayWeekday && dayDateLine) {
      return (
        <View style={styles.metaCard}>
          <Text style={styles.metaDayWeekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {dayWeekday}
          </Text>
          <Text style={styles.metaDayDateLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
            {dayDateLine}
          </Text>
        </View>
      );
    }
  }

  if (kind === 'time') {
    if (chipSurfaceOnly) {
      return (
        <View style={styles.metaCard}>
          <Text style={styles.metaDayWeekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {primary}
          </Text>
        </View>
      );
    }
    if (timeDaypart) {
      return (
        <View style={styles.metaCard}>
          <Text style={styles.metaDayWeekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {primary}
          </Text>
          <Text style={styles.metaDayDateLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
            {timeDaypart}
          </Text>
        </View>
      );
    }
  }

  return (
    <View style={styles.metaCard}>
      <Text style={styles.metaPrimaryDayTime} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.62}>
        {primary}
      </Text>
    </View>
  );
}

function CaptionWhiteBadge(props: { children: React.ReactNode; variant?: 'default' | 'barber' }) {
  const variant = props.variant ?? 'default';
  return (
    <View
      style={[
        styles.captionWhiteBadge,
        variant === 'barber' && styles.captionWhiteBadgeBarber,
      ]}
    >
      {props.children}
    </View>
  );
}

function ChipCaption(props: { chip: BookingProgressChipModel; primaryColor: string }) {
  const { chip, primaryColor } = props;
  const tagColor = { color: primaryColor };

  const slot = (inner: React.ReactNode, variant: 'default' | 'barber' = 'default') => (
    <View style={styles.captionSlot}>
      <CaptionWhiteBadge variant={variant}>{inner}</CaptionWhiteBadge>
    </View>
  );

  if (chip.kind === 'barber') {
    const name = (chip.label || '').trim();
    if (!name) {
      return <View style={[styles.captionSlot, styles.captionSlotSpacer]} />;
    }
    return slot(
      <Text
        style={[styles.captionOnWhiteText, styles.captionBarberNameOnWhite, tagColor]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {name}
      </Text>,
      'barber'
    );
  }

  if (chip.kind === 'service') {
    const promo = (chip.servicePromoTag || '').trim();
    const pill = (chip.servicePriceText || '').trim();
    if (!promo && !pill) {
      return <View style={[styles.captionSlot, styles.captionSlotSpacer]} />;
    }
    return slot(
      <>
        {promo ? (
          <Text style={[styles.captionOnWhiteText, styles.captionPromoOnWhite, tagColor]} numberOfLines={1}>
            {promo}
          </Text>
        ) : null}
        {pill ? (
          <Text
            style={[styles.captionPriceOnWhite, tagColor, { marginTop: promo ? 2 : 0 }]}
            numberOfLines={1}
          >
            {pill}
          </Text>
        ) : null}
      </>
    );
  }

  if (chip.kind === 'day') {
    const day = (chip.dayWeekday || '').trim();
    if (!day) {
      return <View style={[styles.captionSlot, styles.captionSlotSpacer]} />;
    }
    return slot(
      <Text style={[styles.captionOnWhiteText, tagColor]} numberOfLines={1}>
        {day}
      </Text>
    );
  }

  if (chip.kind === 'time') {
    const part = (chip.timeDaypart || '').trim();
    if (!part) {
      return <View style={[styles.captionSlot, styles.captionSlotSpacer]} />;
    }
    return slot(
      <Text style={[styles.captionOnWhiteText, tagColor]} numberOfLines={1}>
        {part}
      </Text>
    );
  }

  return <View style={[styles.captionSlot, styles.captionSlotSpacer]} />;
}

export interface BookingProgressChipModel {
  key: string;
  kind: 'barber' | 'service' | 'day' | 'time';
  label: string;
  imageUri?: string;
  /** Service chip: name + price in strip. */
  serviceName?: string;
  servicePriceText?: string;
  /** Day chip: weekday on top line. */
  dayWeekday?: string;
  /** Day chip: date line under weekday. */
  dayDateLine?: string;
  /** Time chip: daypart under clock (e.g. בוקר). */
  timeDaypart?: string;
  /**
   * Optional line above the price pill under the service chip (e.g. on-sale label).
   * When empty, only the price pill is shown in the caption row.
   */
  servicePromoTag?: string;
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
  /** Target visual is full-bleed strip cell (not a small circle). */
  const cellInner = BOOKING_PROGRESS_STRIP_HEIGHT - 4;
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
  /** Tap a chip to jump to that booking step (barber → 1, service → 2, …). */
  onChipPress?: (kind: BookingProgressChipModel['kind']) => void;
}

function chipAccessibilityLabel(chip: BookingProgressChipModel): string {
  switch (chip.kind) {
    case 'barber':
      return chip.label || 'Staff';
    case 'service': {
      const parts = [chip.serviceName || chip.label, chip.servicePromoTag, chip.servicePriceText].filter(Boolean);
      return parts.join(', ') || 'Service';
    }
    case 'day':
      return chip.dayWeekday ? `${chip.dayWeekday} ${chip.dayDateLine ?? ''}`.trim() : chip.label;
    case 'time':
      return chip.timeDaypart ? `${chip.label}, ${chip.timeDaypart}` : chip.label;
    default:
      return chip.label;
  }
}

export default function BookingProgressChipsStrip({
  visible,
  safeAreaTop,
  primaryColor,
  chips,
  barberEntrance,
  barberEntranceKey,
  onChipPress,
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
            /** Step 1 only: centered square thumbnail. From service onward (`n >= 2`): photo fills the chip cell (cover). */
            const barberPhotoFillCell = n >= 2;
            const barberPhotoSide = Math.max(
              40,
              Math.min(finalW - 4, BOOKING_PROGRESS_STRIP_HEIGHT - 4)
            );

            const pressable = !!onChipPress;
            const cellBody =
              chip.kind === 'barber' ? (
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
                  style={[styles.barberInner, barberPhotoFillCell && styles.barberInnerFillCell]}
                >
                  {chip.imageUri ? (
                    <View
                      style={[
                        styles.barberPhotoSlot,
                        barberPhotoFillCell
                          ? styles.barberPhotoSlotFillCell
                          : {
                              width: barberPhotoSide,
                              height: barberPhotoSide,
                              borderRadius: Math.min(INNER_RADIUS, barberPhotoSide / 2),
                            },
                      ]}
                    >
                      <Image
                        source={{ uri: chip.imageUri }}
                        style={styles.barberImageCover}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.barberPlaceholder,
                        barberPhotoFillCell
                          ? styles.barberPhotoSlotFillCell
                          : {
                              width: barberPhotoSide,
                              height: barberPhotoSide,
                              borderRadius: Math.min(INNER_RADIUS, barberPhotoSide / 2),
                            },
                      ]}
                    >
                      <Ionicons
                        name="person"
                        size={Math.round((barberPhotoFillCell ? BOOKING_PROGRESS_STRIP_HEIGHT : barberPhotoSide) * 0.38)}
                        color="rgba(255,255,255,0.45)"
                      />
                    </View>
                  )}
                </MotiView>
              ) : chip.kind === 'service' ? (
                <View style={styles.flightInner}>
                  <StripMetaCard
                    chipSurfaceOnly
                    kind="service"
                    primary={chip.label}
                    price={chip.servicePriceText}
                    serviceTitle={chip.serviceName ?? chip.label}
                  />
                </View>
              ) : chip.kind === 'day' ? (
                <View style={styles.flightInner}>
                  <StripMetaCard
                    chipSurfaceOnly
                    kind="day"
                    primary={chip.label}
                    dayWeekday={chip.dayWeekday}
                    dayDateLine={chip.dayDateLine}
                  />
                </View>
              ) : (
                <View style={styles.flightInner}>
                  <StripMetaCard
                    chipSurfaceOnly
                    kind="time"
                    primary={chip.label}
                    timeDaypart={chip.timeDaypart}
                  />
                </View>
              );

            const caption = <ChipCaption chip={chip} primaryColor={primaryColor} />;

            return (
              <MotiView
                key={chip.key}
                from={{ opacity: 0 }}
                animate={{ width: finalW, opacity: 1 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: 'timing', duration: 440, easing: Easing.out(Easing.cubic) }}
                style={styles.chipColumnOuter}
              >
                {pressable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={chipAccessibilityLabel(chip)}
                    onPress={() => onChipPress?.(chip.kind)}
                    style={({ pressed }) => [
                      styles.chipColumnPressable,
                      pressed && styles.chipPressablePressed,
                    ]}
                    android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false }}
                  >
                    <View
                      style={[
                        styles.cell,
                        hasFlight ? styles.cellFlight : styles.cellClip,
                        {
                          height: BOOKING_PROGRESS_STRIP_HEIGHT,
                          borderRadius: INNER_RADIUS,
                        },
                      ]}
                    >
                      {cellBody}
                    </View>
                    {caption}
                  </Pressable>
                ) : (
                  <View style={styles.chipColumnPressable}>
                    <View
                      style={[
                        styles.cell,
                        hasFlight ? styles.cellFlight : styles.cellClip,
                        {
                          height: BOOKING_PROGRESS_STRIP_HEIGHT,
                          borderRadius: INNER_RADIUS,
                        },
                      ]}
                    >
                      {cellBody}
                    </View>
                    {caption}
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
    overflow: 'visible',
  },
  row: {
    alignItems: 'stretch',
    overflow: 'visible',
  },
  chipColumnOuter: {
    overflow: 'visible',
  },
  chipColumnPressable: {
    width: '100%',
    alignItems: 'stretch',
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
  chipPressablePressed: {
    opacity: 0.88,
  },
  cell: {
    width: '100%',
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
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  /** Barber chip when service+ chips exist: stretch photo to cell edges. */
  barberInnerFillCell: {
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  barberPhotoSlot: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  barberPhotoSlotFillCell: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    borderRadius: INNER_RADIUS,
  },
  barberImageCover: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  barberPlaceholder: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Shared layout for service / date / time — full cell, no inner circle. */
  metaCard: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  metaDayWeekday: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.35,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaDayDateLine: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  /** Day chip surface: numeric date only (weekday is in caption below). */
  metaDayDatePrimary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.35,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  /** Time chip: no icon, slightly larger type. */
  metaPrimaryDayTime: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 18,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  /** Service chip: name on top (largest text in strip row). */
  metaServiceTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.45,
    lineHeight: 18,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  /** Service chip: price under the name. */
  metaServicePriceBelow: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.25,
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  captionSlot: {
    marginTop: -BOOKING_PROGRESS_STRIP_CAPTION_OVERLAP,
    minHeight: BOOKING_PROGRESS_STRIP_CAPTION_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    /** Above `cellFlight` (50) so the badge overlaps the bottom of the frosted chip on screen. */
    zIndex: 60,
  },
  /** Keeps column height when a chip has no caption text. */
  captionSlotSpacer: {
    minHeight: Math.max(0, BOOKING_PROGRESS_STRIP_CAPTION_HEIGHT - BOOKING_PROGRESS_STRIP_CAPTION_OVERLAP),
  },
  captionWhiteBadge: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      /** Above frosted chip flight (`cellFlight` elevation 14) so overlap reads correctly. */
      android: { elevation: 16 },
      default: {},
    }),
  },
  /** Narrow columns: keep name tag pill-sized, not full chip width / tall block. */
  captionWhiteBadgeBarber: {
    maxWidth: '78%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  /** Text color comes from `primaryColor` at runtime (ChipCaption). */
  captionOnWhiteText: {
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  captionBarberNameOnWhite: {
    fontSize: 11,
    maxWidth: '100%',
  },
  captionPromoOnWhite: {
    marginBottom: 3,
    fontSize: 11,
    fontWeight: '700',
  },
  /** Price on same white badge as promo — no nested purple pill (avoids “double background”). */
  captionPriceOnWhite: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
