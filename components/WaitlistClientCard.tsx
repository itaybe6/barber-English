import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Image, StyleSheet, I18nManager } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';

interface WaitlistClientCardProps {
  name: string;
  image: string;
  serviceName: string;
  /** Time the client joined the waitlist (e.g. from created_at). */
  registeredAtLabel: string;
  /** e.g. Morning / Any time — optional. */
  timePreferenceLabel?: string;
  statusLabel?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function WaitlistClientCard({
  name,
  image,
  serviceName,
  registeredAtLabel,
  timePreferenceLabel,
  statusLabel,
}: WaitlistClientCardProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const { primaryOnSurface } = usePrimaryContrast();
  const isRtl = I18nManager.isRTL;
  const textAlign = isRtl ? 'right' : 'left';
  const writingDirection = isRtl ? ('rtl' as const) : ('ltr' as const);

  const hasImage = Boolean(image && image.trim().length > 0);
  const placeholder = require('@/assets/images/user.png');

  const chipFill = useMemo(() => hexToRgba(colors.primary, 0.12), [colors.primary]);
  const chipOutline = useMemo(() => hexToRgba(colors.primary, 0.22), [colors.primary]);
  const avatarRing = useMemo(() => hexToRgba(colors.primary, 0.35), [colors.primary]);
  const pillBg = useMemo(() => hexToRgba(colors.primary, 0.1), [colors.primary]);

  const status = statusLabel || t('admin.waitlist.waiting', 'Waiting');

  const avatarEl = (
    <View style={[styles.avatarRing, { borderColor: avatarRing }]}>
      <Image source={hasImage ? { uri: image } : placeholder} style={styles.avatar} />
    </View>
  );

  const mainEl = (
    <View style={styles.main}>
      <View style={styles.titleRow}>
        <View style={styles.nameBlock}>
          <Text
            style={[styles.name, { color: colors.text, textAlign, writingDirection }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: pillBg, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <View style={[styles.statusDot, { backgroundColor: primaryOnSurface }]} />
          <Text style={[styles.statusText, { color: primaryOnSurface, textAlign }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>

      <Text
        style={[styles.service, { color: colors.textSecondary, textAlign, writingDirection }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {serviceName}
      </Text>

      <View style={[styles.metaRow, { justifyContent: 'flex-start' }]}>
        <View
          style={[
            styles.metaChip,
            { backgroundColor: chipFill, flexDirection: isRtl ? 'row-reverse' : 'row' },
          ]}
        >
          <Clock size={15} color={primaryOnSurface} strokeWidth={2.2} />
          <Text style={[styles.metaChipText, { color: primaryOnSurface, textAlign }]}>{registeredAtLabel}</Text>
        </View>
        {timePreferenceLabel ? (
          <View style={[styles.prefChip, { borderColor: chipOutline }]}>
            <Text
              style={[styles.prefChipText, { color: primaryOnSurface, textAlign, writingDirection }]}
              numberOfLines={1}
            >
              {timePreferenceLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  /** RTL: main (text) first so it sits on the visual right; LTR: avatar first on the left. */
  return (
    <View style={[styles.root, { flexDirection: 'row' }]}>
      {isRtl ? (
        <>
          {mainEl}
          {avatarEl}
        </>
      ) : (
        <>
          {avatarEl}
          {mainEl}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'transparent',
  },
  avatarRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 2,
    borderWidth: 2,
    backgroundColor: '#FAFAFA',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    backgroundColor: '#ECECEC',
  },
  main: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 6,
    alignItems: 'stretch',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    width: '100%',
  },
  statusPill: {
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  service: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    opacity: 0.92,
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    width: '100%',
  },
  metaChip: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
  },
  metaChipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  prefChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.65)',
    maxWidth: '100%',
  },
  prefChipText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
});
