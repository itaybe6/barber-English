import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, I18nManager, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/src/theme/ThemeProvider';

/** קומפקטי — שני לקוחות בשורה אחת בכרטיס הבית */
const AVATAR = 28;
const PASTEL_FILLS = ['#EEF2FF', '#FDF2F8', '#ECFDF5', '#FFFBEB', '#E0F2FE', '#F3E8FF', '#FEF3C7'];
const INITIALS_TEXT = '#334155';

function initialsFromName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = [...parts[0]][0] || '';
    const b = [...parts[parts.length - 1]][0] || '';
    return `${a}${b}`.toUpperCase();
  }
  const chars = [...(parts[0] || raw)];
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

export interface WaitlistHomeNamedPreviewClient {
  key: string;
  client_name: string;
  image_url?: string;
}

interface WaitlistHomePreviewNamedRowsProps {
  clients: WaitlistHomeNamedPreviewClient[];
  primaryColor: string;
}

/**
 * פריוויו בדף הבית — עד 2 לקוחות בשורה אחת: תמונה/ראשי תיבות + שם (קומפקטי).
 */
export default function WaitlistHomePreviewNamedRows({
  clients,
  primaryColor,
}: WaitlistHomePreviewNamedRowsProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const isRTL = I18nManager.isRTL;
  const rows = useMemo(() => (clients || []).slice(0, 2), [clients]);
  const isPair = rows.length === 2;

  const displayName = (name: string) => {
    const n = String(name || '').trim();
    if (n && n !== '?') return n;
    return t('admin.waitlist.previewUnnamed', 'לקוח ברשימה');
  };

  const inner = AVATAR - 4;

  return (
    <View
      style={[styles.wrap, isPair ? styles.wrapPair : styles.wrapSingle]}
      pointerEvents="none"
    >
      {rows.map((c) => {
        const uri = String(c.image_url || '').trim();
        const hasImage = Boolean(uri);
        const initials = initialsFromName(c.client_name);
        const fill = fillForKey(c.key);
        const ring = `${primaryColor}35`;

        return (
          <View
            key={c.key}
            style={[
              styles.clientCell,
              isPair ? styles.clientCellPair : styles.clientCellSingle,
              { flexDirection: isRTL ? 'row-reverse' : 'row' },
            ]}
          >
            <View style={[styles.avatarRing, { borderColor: ring }]}>
              {hasImage ? (
                <Image source={{ uri }} style={styles.avatarImg} />
              ) : (
                <View
                  style={[
                    styles.initialsCircle,
                    {
                      width: inner,
                      height: inner,
                      borderRadius: inner / 2,
                      backgroundColor: fill,
                    },
                  ]}
                >
                  <Text style={[styles.initials, { color: INITIALS_TEXT }]} numberOfLines={1}>
                    {initials}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.name,
                { color: colors.text, textAlign: isRTL ? 'right' : 'left' },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName(c.client_name)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  /** שני תאים מתחלקים בשוויון — תמיד בשורה אחת */
  wrapPair: {
    gap: 6,
  },
  wrapSingle: {
    gap: 0,
    justifyContent: 'flex-start',
  },
  clientCell: {
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    flexShrink: 1,
  },
  clientCellPair: {
    flex: 1,
    flexBasis: 0,
  },
  /** לקוח יחיד — רוחב מלא של הכרטיס כדי ש־ellipsis יעבוד */
  clientCellSingle: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    padding: 2,
    borderWidth: 1.5,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  avatarImg: {
    width: AVATAR - 4,
    height: AVATAR - 4,
    borderRadius: (AVATAR - 4) / 2,
    backgroundColor: '#ECECEC',
  },
  initialsCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
