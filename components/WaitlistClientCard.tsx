import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, I18nManager } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';

interface WaitlistClientCardProps {
  name: string;
  image: string;
  serviceName: string;
  /** Time the client joined the waitlist — omit to hide the clock chip. */
  registeredAtLabel?: string;
  /** e.g. Morning / Any time — optional. */
  timePreferenceLabel?: string;
  /** Omit to hide the status pill (e.g. admin waitlist compact card). */
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
  const colors = useColors();
  const { primaryOnSurface } = usePrimaryContrast();
  const isRtl = I18nManager.isRTL;
  const textAlign = isRtl ? 'right' : 'left';
  const writingDirection = isRtl ? ('rtl' as const) : ('ltr' as const);

  const hasImage = Boolean(image && image.trim().length > 0);
  const placeholder = require('@/assets/images/user.png');

  const chipFill = useMemo(() => hexToRgba(colors.primary, 0.08), [colors.primary]);
  const chipOutline = useMemo(() => hexToRgba(colors.primary, 0.14), [colors.primary]);
  const showStatus = Boolean(statusLabel && statusLabel.trim().length > 0);

  const avatarEl = (
    <View style={[styles.avatarRing, { borderColor: colors.border }]}>
      <Image source={hasImage ? { uri: image } : placeholder} style={styles.avatar} />
    </View>
  );

  const mainEl = (
    <View style={styles.main}>
      <View style={[styles.titleRow, !showStatus && styles.titleRowSingle]}>
        <View style={styles.nameBlock}>
          <Text
            style={[styles.name, { color: colors.text, textAlign, writingDirection }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name}
          </Text>
        </View>
        {showStatus ? (
          <View
            style={[
              styles.statusPill,
              { backgroundColor: hexToRgba(colors.primary, 0.1), flexDirection: isRtl ? 'row-reverse' : 'row' },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: primaryOnSurface }]} />
            <Text style={[styles.statusText, { color: primaryOnSurface, textAlign }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[styles.service, { color: colors.textSecondary, textAlign, writingDirection }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {serviceName}
      </Text>

      {registeredAtLabel || timePreferenceLabel ? (
        <View style={[styles.metaRow, { justifyContent: 'flex-start' }]}>
          {registeredAtLabel ? (
            <View
              style={[
                styles.metaChip,
                { backgroundColor: chipFill, flexDirection: isRtl ? 'row-reverse' : 'row' },
              ]}
            >
              <Clock size={12} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.metaChipText, { color: colors.textSecondary, textAlign }]}>{registeredAtLabel}</Text>
            </View>
          ) : null}
          {timePreferenceLabel ? (
            <View style={[styles.prefChip, { borderColor: chipOutline }]}>
              <Text
                style={[styles.prefChipText, { color: colors.textSecondary, textAlign, writingDirection }]}
                numberOfLines={1}
              >
                {timePreferenceLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
    gap: 10,
    backgroundColor: 'transparent',
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 1,
    borderWidth: 1,
    backgroundColor: '#FAFAFA',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 21,
    backgroundColor: '#ECECEC',
  },
  main: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
    alignItems: 'stretch',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRowSingle: {
    justifyContent: 'flex-start',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
    width: '100%',
  },
  statusPill: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.05,
    flexShrink: 1,
  },
  service: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
    opacity: 0.88,
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
    width: '100%',
  },
  metaChip: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  prefChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    maxWidth: '100%',
  },
  prefChipText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
