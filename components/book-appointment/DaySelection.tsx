import React from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
import BookingAnimatedCalendar from '@/components/book-appointment/games-calendar/BookingAnimatedCalendar';

type DayObj = { fullDate: Date };

type Props = {
  visible: boolean;
  styles: any;
  days: DayObj[];
  bookingOpenDays: number;
  selectedDate: Date | null;
  selectedDayIndex: number | null;
  dayAvailability: Record<string, number>;
  language: string;
  /** Business primary (theme) for selection + month indicator */
  primaryColor: string;
  t: (key: string, fallback: string) => string;
  onSelectDayIndex: (index: number | null) => void;
  onClearTime: () => void;
};

export default function DaySelection({
  visible,
  styles,
  days,
  bookingOpenDays,
  selectedDate,
  dayAvailability,
  language,
  primaryColor,
  t,
  onSelectDayIndex,
  onClearTime,
}: Props) {
  if (!visible) return null;

  return (
    <View
      style={{
        width: '100%',
        justifyContent: 'flex-start',
        paddingTop: 32,
        paddingBottom: 12,
      }}
    >
      {/* Header — matches BarberSelection / ServiceSelection style */}
      <View style={localStyles.header}>
        <Text style={localStyles.title}>
          {t('booking.selectDayTitle', 'בחירת תאריך')}
        </Text>
        <Text style={localStyles.subtitle}>
          {t('booking.selectDaySubtitle', 'בחר את היום המועדף עליך')}
        </Text>
      </View>

      <View style={[styles.calendarSectionCard, { marginTop: 16 }]}>
        <View
          style={[
            styles.calendarFixedBox,
            !I18nManager.isRTL && { direction: 'ltr' },
          ]}
        >
          <BookingAnimatedCalendar
            bookingOpenDays={bookingOpenDays}
            dayAvailability={dayAvailability}
            selectedDate={selectedDate}
            days={days}
            language={language}
            primaryColor={primaryColor}
            onSelectDayIndex={onSelectDayIndex}
            onClearTime={onClearTime}
          />
        </View>
      </View>

      {/* Legend */}
      <View style={localStyles.legend}>
        <LegendItem dot="#22c55e" label={t('booking.legend.available', 'יש תורים')} />
        <LegendItem dot="#ef4444" label={t('booking.legend.full', 'מלא')} />
        <LegendItem dot="#C7C7CC" label={t('booking.legend.closed', 'לא עובד')} />
      </View>
    </View>
  );
}

function LegendItem({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={localStyles.legendItem}>
      <View style={[localStyles.legendDot, { backgroundColor: dot }]} />
      <Text style={localStyles.legendLabel}>{label}</Text>
    </View>
  );
}

const DOT_SIZE = 8;

const localStyles = StyleSheet.create({
  header: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: -0.1,
  },
});
