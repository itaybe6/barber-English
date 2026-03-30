import React from 'react';
import { Calendar, CalendarDays, Grid3x3 } from 'lucide-react-native';
import type { CalendarViewMode } from './calendarViewMode';

export function CalendarViewModeIcon({
  mode,
  color,
  iconSize = 20,
}: {
  mode: CalendarViewMode;
  color: string;
  iconSize?: number;
}) {
  switch (mode) {
    case 'day':
      return <Calendar size={iconSize} color={color} strokeWidth={2.2} />;
    case 'week':
      return <CalendarDays size={iconSize} color={color} strokeWidth={2.2} />;
    case 'month':
      return <Grid3x3 size={iconSize} color={color} strokeWidth={2.2} />;
    default:
      return null;
  }
}
