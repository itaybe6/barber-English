import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/src/theme/ThemeProvider';
import type { TopActiveClientRow } from '@/lib/api/topActiveClients';

const AVATAR = 40;
const MAX_BAR = 112;
const BAR_WIDTH_FRAC = 0.72;
const DEFAULT_BAR = '#ECECEC';
/** Strong accent for #1 — matches reference; falls back well when primary is brand-colored */
const HIGHLIGHT_BAR = '#FFD60A';

interface TopActiveClientsLeaderboardProps {
  rows: TopActiveClientRow[];
  loading?: boolean;
  colors: ThemeColors;
}

export function TopActiveClientsLeaderboard({ rows, loading, colors }: TopActiveClientsLeaderboardProps) {
  const { t } = useTranslation();

  const maxCount = useMemo(() => rows.reduce((m, r) => Math.max(m, r.visitCount), 0), [rows]);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.primary}18` }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('admin.insights.topClientsTitle', 'Most active clients')}
        </Text>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.primary}18` }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('admin.insights.topClientsTitle', 'Most active clients')}
        </Text>
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          {t('admin.insights.topClientsEmpty', 'No visit data yet')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.primary}18` }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('admin.insights.topClientsTitle', 'Most active clients')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {t('admin.insights.topClientsSubtitle', 'By total visits (excl. cancelled)')}
      </Text>

      <View style={styles.chartRow}>
        {rows.map((row, index) => {
          const isTop = index === 0;
          const barColor = isTop ? HIGHLIGHT_BAR : DEFAULT_BAR;
          const ringColor = isTop ? HIGHLIGHT_BAR : `${colors.textSecondary}55`;
          const h = maxCount > 0 ? Math.max(8, Math.round((row.visitCount / maxCount) * MAX_BAR)) : 8;

          return (
            <View key={row.userId} style={styles.column}>
              <View
                style={[
                  styles.avatarRing,
                  {
                    borderColor: ringColor,
                    borderStyle: 'dashed',
                  },
                ]}
              >
                {row.imageUrl ? (
                  <Image source={{ uri: row.imageUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: `${colors.primary}14` }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                )}
              </View>
              <Text style={[styles.count, { color: colors.text }]} numberOfLines={1}>
                {row.visitCount}
              </Text>
              <View style={[styles.barTrack, { height: MAX_BAR }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: h,
                      backgroundColor: barColor,
                      width: `${BAR_WIDTH_FRAC * 100}%` as const,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 20,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  avatarRing: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarImg: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  barTrack: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    minHeight: 8,
  },
});
