import React from 'react';
import { View, useWindowDimensions, I18nManager } from 'react-native';
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
  onSelectDayIndex,
  onClearTime,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();

  if (!visible) return null;

  /** Taller slot + vertical centering so the calendar sits nearer the middle of the screen */
  const centerSlotMinHeight = Math.max(520, windowHeight * 0.58);

  return (
    <View
      style={{
        width: '100%',
        minHeight: centerSlotMinHeight,
        justifyContent: 'center',
        paddingVertical: 12,
      }}
    >
      <View style={[styles.calendarSectionCard, { marginTop: 0 }]}>
        <View
          style={[
            styles.calendarFixedBox,
            /* Hebrew/RTL: natural horizontal scroll + weekday order; English keeps LTR calendar */
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
    </View>
  );
}
