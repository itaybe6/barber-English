import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarViewMode } from './calendarViewMode';

export function WeekMenuIcon({ color }: { color: string }) {
  const h = 18;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: h }}>
      {[0.5, 0.85, 0.65, 0.9].map((f, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: Math.max(7, h * f),
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

export function CalendarViewModeIcon({
  mode,
  color,
  iconSize = 22,
}: {
  mode: CalendarViewMode;
  color: string;
  iconSize?: number;
}) {
  switch (mode) {
    case 'day':
      return <Ionicons name="today-outline" size={iconSize} color={color} />;
    case 'week':
      return <WeekMenuIcon color={color} />;
    case 'month':
      return <Ionicons name="grid-outline" size={iconSize} color={color} />;
    default:
      return null;
  }
}
