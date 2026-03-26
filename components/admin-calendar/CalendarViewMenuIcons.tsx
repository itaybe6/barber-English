import React from 'react';
import { CalendarClock, CalendarRange, LayoutGrid } from 'lucide-react-native';
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
      return <CalendarClock size={iconSize} color={color} strokeWidth={2.2} />;
    case 'week':
      return <CalendarRange size={iconSize} color={color} strokeWidth={2.2} />;
    case 'month':
      return <LayoutGrid size={iconSize} color={color} strokeWidth={2.2} />;
    default:
      return null;
  }
}
