import React, { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, I18nManager, Platform } from 'react-native';

const SIZE = 28;
const OVERLAP = 9;
/** מקסימום "חלונות" בכרטיס: עיגולי ראשי תיבות + אופציונלית תג +N */
const MAX_SLOTS_DEFAULT = 5;

const PASTEL_FILLS = ['#EEF2FF', '#FDF2F8', '#ECFDF5', '#FFFBEB', '#E0F2FE', '#F3E8FF', '#FEF3C7'];

function initialsFromName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = [...parts[0]][0] || '';
    const b = [...parts[parts.length - 1]][0] || '';
    return `${a}${b}`.toUpperCase();
  }
  const chars = [...parts[0] || raw];
  if (chars.length >= 2) return `${chars[0]}${chars[1]}`.toUpperCase();
  return (chars[0] || '?').toUpperCase();
}

function fillForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = key.charCodeAt(i) + ((h << 5) - h);
  }
  return PASTEL_FILLS[Math.abs(h) % PASTEL_FILLS.length];
}

const INITIALS_TEXT = '#334155';

export interface WaitlistPreviewClient {
  key: string;
  client_name: string;
}

interface WaitlistHomePreviewAvatarsProps {
  clients: WaitlistPreviewClient[];
  primaryColor: string;
  surfaceColor: string;
  /** מקסימום רוחב לוגי (מספר עיגולים כולל +N אם צריך) */
  maxSlots?: number;
}

/**
 * עיגולי ראשי תיבות חופפים לכרטיס רשימת המתנה בדף הבית — מוגבל ל־maxSlots כדי שלא ייחתך.
 */
export default function WaitlistHomePreviewAvatars({
  clients,
  primaryColor,
  surfaceColor,
  maxSlots = MAX_SLOTS_DEFAULT,
}: WaitlistHomePreviewAvatarsProps) {
  const isRTL = I18nManager.isRTL;

  const { initialsSlots, overflowPlus } = useMemo(() => {
    const list = clients || [];
    const slots = Math.max(3, Math.min(maxSlots, 6));
    if (list.length === 0) {
      return { initialsSlots: [] as WaitlistPreviewClient[], overflowPlus: 0 };
    }
    if (list.length <= slots) {
      return { initialsSlots: list, overflowPlus: 0 };
    }
    const shown = slots - 1;
    return {
      initialsSlots: list.slice(0, shown),
      overflowPlus: list.length - shown,
    };
  }, [clients, maxSlots]);

  const displayOrder = useMemo(
    () => (isRTL ? [...initialsSlots].reverse() : initialsSlots),
    [initialsSlots, isRTL]
  );

  if (displayOrder.length === 0 && overflowPlus === 0) return null;

  const items: ReactNode[] = [];

  displayOrder.forEach((c, index) => {
    const initials = initialsFromName(c.client_name);
    const fill = fillForKey(c.key);
    const color = INITIALS_TEXT;
    items.push(
      <View
        key={c.key}
        style={[
          styles.slot,
          index > 0 && (isRTL ? { marginEnd: -OVERLAP } : { marginStart: -OVERLAP }),
          { zIndex: index + 1 },
        ]}
      >
        <View
          style={[
            styles.circle,
            {
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              backgroundColor: fill,
              borderColor: surfaceColor,
            },
          ]}
        >
          <Text style={[styles.initials, { color }]} numberOfLines={1}>
            {initials}
          </Text>
        </View>
      </View>
    );
  });

  if (overflowPlus > 0) {
    const index = displayOrder.length;
    items.push(
      <View
        key="__plus__"
        style={[
          styles.slot,
          index > 0 && (isRTL ? { marginEnd: -OVERLAP } : { marginStart: -OVERLAP }),
          { zIndex: index + 2 },
        ]}
      >
        <View
          style={[
            styles.circle,
            {
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              borderColor: surfaceColor,
              backgroundColor: `${primaryColor}18`,
            },
          ]}
        >
          <Text style={[styles.plusInner, { color: primaryColor }]} numberOfLines={1}>
            +{overflowPlus}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, isRTL ? styles.rowRtl : styles.rowLtr]} pointerEvents="none">
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    maxWidth: '100%',
    flexWrap: 'nowrap',
  },
  rowLtr: {
    justifyContent: 'flex-start',
  },
  rowRtl: {
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 2 },
    }),
  },
  initials: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  plusInner: {
    fontSize: 11,
    fontWeight: '800',
  },
});
