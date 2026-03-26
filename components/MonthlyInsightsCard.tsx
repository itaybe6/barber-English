import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface MonthlyInsightsCardProps {
  /** Booked visits not yet finished: pending (awaiting approval) + confirmed (approved / scheduled). */
  booked: number;
  /** Finished services only (status completed). */
  completed: number;
  cancelled: number;
  /** Client users created this calendar month (not part of appointment donut). */
  newClientsThisMonth: number;
  loading?: boolean;
  colors: any;
}

const COMPLETED_SEGMENT_COLOR = '#34C759';

const CHART_SIZE = 120;
const STROKE_WIDTH = 12;
const CENTER = CHART_SIZE / 2;
const RADIUS = (CHART_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function MonthlyInsightsCard({
  booked,
  completed,
  cancelled,
  newClientsThisMonth,
  loading,
  colors,
}: MonthlyInsightsCardProps) {
  const { t } = useTranslation();
  const total = booked + completed + cancelled;

  const monthLabel = useMemo(() => {
    return new Date().toLocaleString('he-IL', { month: 'long', year: 'numeric' });
  }, []);

  const segments = useMemo(() => {
    if (total === 0) return [];
    const items = [
      { value: booked, color: colors.primary },
      { value: completed, color: COMPLETED_SEGMENT_COLOR },
      { value: cancelled, color: '#FF9500' },
    ].filter((s) => s.value > 0);

    let accumulated = 0;
    return items.map((item) => {
      const length = (item.value / total) * CIRCUMFERENCE;
      const offset = accumulated;
      accumulated += length;
      return { ...item, length, offset };
    });
  }, [booked, completed, cancelled, total, colors.primary]);

  const legendItems = [
    { value: booked, color: colors.primary, label: t('admin.insights.booked', 'Booked') },
    { value: completed, color: COMPLETED_SEGMENT_COLOR, label: t('admin.insights.completed', 'Completed') },
    { value: cancelled, color: '#FF9500', label: t('admin.insights.cancelled', 'Cancelled') },
  ];

  const newClientsRow = (
    <View
      style={[
        styles.newClientsRow,
        { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}22` },
      ]}
    >
      <Ionicons name="person-add-outline" size={22} color={colors.primary} />
      <Text style={[styles.newClientsNumber, { color: colors.text }]}>{newClientsThisMonth}</Text>
      <Text style={[styles.newClientsLabel, { color: colors.textSecondary }]}>
        {t('admin.insights.newClientsThisMonth', 'New clients this month')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('admin.insights.title', 'Monthly Insights')}
          </Text>
          <View style={[styles.monthPill, { backgroundColor: `${colors.primary}12` }]}>
            <Text style={[styles.monthPillText, { color: colors.primary }]}>{monthLabel}</Text>
          </View>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="analytics-outline" size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('admin.insights.noData', 'No appointment data this month')}
          </Text>
        </View>
        {newClientsRow}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('admin.insights.title', 'Monthly Insights')}
        </Text>
        <View style={[styles.monthPill, { backgroundColor: `${colors.primary}12` }]}>
          <Text style={[styles.monthPillText, { color: colors.primary }]}>{monthLabel}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Donut Chart */}
        <View style={styles.chartWrap}>
          <Svg width={CHART_SIZE} height={CHART_SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke="#F2F2F7"
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            {segments.map((seg, i) => (
              <Circle
                key={i}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke={seg.color}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDasharray={`${seg.length} ${CIRCUMFERENCE - seg.length}`}
                strokeDashoffset={-seg.offset}
                rotation={-90}
                originX={CENTER}
                originY={CENTER}
              />
            ))}
          </Svg>
          <View style={styles.chartCenter}>
            <Text style={[styles.centerNum, { color: colors.text }]}>{total}</Text>
            <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>
              {t('admin.insights.total', 'Total')}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {legendItems.map((item, i) => (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[styles.legendNum, { color: colors.text }]}>{item.value}</Text>
              <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {newClientsRow}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  newClientsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  newClientsNumber: {
    fontSize: 20,
    fontWeight: '800',
    minWidth: 24,
  },
  newClientsLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  monthPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartWrap: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    position: 'relative',
  },
  chartCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerNum: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -2,
  },
  legend: {
    flex: 1,
    marginLeft: 24,
    gap: 14,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendNum: {
    fontSize: 17,
    fontWeight: '700',
    minWidth: 28,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
