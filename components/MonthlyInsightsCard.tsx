import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, I18nManager } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

interface MonthlyInsightsCardProps {
  appointmentsThisMonth: number;
  appointmentsToday: number;
  newClientsThisMonth: number;
  loading?: boolean;
  colors: { primary: string; text: string; textSecondary: string; secondary?: string };
}

const TODAY_SEGMENT_COLOR = '#34C759';
const NEW_CLIENTS_SEGMENT_COLOR = '#FF9500';

const CHART_SIZE = 128;
const STROKE_WIDTH = 14;
const CENTER = CHART_SIZE / 2;
const RADIUS = (CHART_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function MonthlyInsightsCard({
  appointmentsThisMonth,
  appointmentsToday,
  newClientsThisMonth,
  loading,
  colors,
}: MonthlyInsightsCardProps) {
  const { t, i18n } = useTranslation();
  const isHebrewUi =
    (typeof i18n.language === 'string' && i18n.language.startsWith('he')) || I18nManager.isRTL;
  const total = appointmentsThisMonth + appointmentsToday + newClientsThisMonth;

  const monthLabel = useMemo(() => {
    const locale = typeof i18n.language === 'string' && i18n.language.startsWith('he') ? 'he-IL' : 'en-US';
    return new Date().toLocaleString(locale, { month: 'long', year: 'numeric' });
  }, [i18n.language]);

  const segmentDefs = useMemo(
    () => [
      {
        key: 'month',
        value: appointmentsThisMonth,
        color: colors.primary,
        label: t('admin.insights.monthLegend'),
      },
      {
        key: 'today',
        value: appointmentsToday,
        color: TODAY_SEGMENT_COLOR,
        label: t('admin.insights.todayLegend'),
      },
      {
        key: 'clients',
        value: newClientsThisMonth,
        color: NEW_CLIENTS_SEGMENT_COLOR,
        label: t('admin.insights.newClientsLegend'),
      },
    ],
    [appointmentsThisMonth, appointmentsToday, newClientsThisMonth, colors.primary, t]
  );

  const segments = useMemo(() => {
    if (total === 0) return [];
    const items = segmentDefs.filter((s) => s.value > 0);
    let accumulated = 0;
    return items.map((item) => {
      const length = (item.value / total) * CIRCUMFERENCE;
      const offset = accumulated;
      accumulated += length;
      return { ...item, length, offset };
    });
  }, [segmentDefs, total]);

  const cardInner = (
    <>
      {/* direction: ltr — תג החודש משמאל, כותרת מימין ומיושרת לקצה (כמו RTL נכון) */}
      <View style={styles.header}>
        <View style={[styles.monthPill, { backgroundColor: `${colors.primary}14` }]}>
          <Text style={[styles.monthPillText, { color: colors.primary }]}>{monthLabel}</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }, isHebrewUi ? styles.titleRtl : styles.titleLtr]}>
          {t('admin.insights.title')}
        </Text>
      </View>

      {total === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('admin.insights.noData')}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.chartWrap}>
            <Svg width={CHART_SIZE} height={CHART_SIZE}>
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke="#ECECF0"
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {segments.map((seg) => (
                <Circle
                  key={seg.key}
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
                  strokeLinecap="round"
                />
              ))}
            </Svg>
            <View style={styles.chartCenter}>
              <Text style={[styles.centerNum, { color: colors.text }]}>{appointmentsThisMonth}</Text>
              <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>{t('admin.insights.monthLegend')}</Text>
            </View>
          </View>

          <View style={styles.legend}>
            {segmentDefs.map((item) => (
              <View key={item.key} style={styles.legendRow}>
                {/* כמו צילום 1: טקסט משמאל, מספר + נקודה מימין (direction:ltr = קבוע) */}
                <Text style={[styles.legendLabel, { color: colors.text }]} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={[styles.legendValue, { color: colors.text }]}>{item.value}</Text>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
              </View>
            ))}
          </View>
        </View>
      )}
    </>
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

  return <View style={styles.card}>{cardInner}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#EAEAEF',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 20,
      },
      android: { elevation: 5 },
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
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    // חשוב: מניעת היפוך flex ב-RTL — תמיד תג משמאל, כותרת מימין
    ...({ direction: 'ltr' } as const),
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.35,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  titleRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  titleLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  monthPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 0,
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: -1,
    opacity: 0.85,
  },
  legend: {
    flex: 1,
    marginStart: 14,
    gap: 12,
    paddingVertical: 2,
    minWidth: 0,
  },
  legendRow: {
    flexDirection: 'row',
    ...({ direction: 'ltr' } as const),
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF0',
    alignSelf: 'stretch',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
    minWidth: 0,
    textAlign: 'left',
  },
  legendValue: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.25,
  },
});
