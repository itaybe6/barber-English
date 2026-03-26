import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { Calendar } from 'lucide-react-native';

const BAR_COUNT = 7;
const BAR_WIDTH = 6;
const BAR_GAP = 5;
const MAX_BAR_H = 52;
const MIN_BAR_H = 12;

export interface AppointmentsCalendarLoaderProps {
  message: string;
  /** צבע מותג — ברירת מחדל כחול יומן Google */
  accentColor?: string;
}

function AppointmentsCalendarLoaderInner({ message, accentColor = '#1A73E8' }: AppointmentsCalendarLoaderProps) {
  const soft = useMemo(() => `${accentColor}22`, [accentColor]);

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message}>
      <MotiView
        from={{ opacity: 0.35, scale: 0.92 }}
        animate={{ opacity: 0.55, scale: 1 }}
        transition={{
          type: 'timing',
          duration: 1400,
          loop: true,
          repeatReverse: true,
        }}
        style={[styles.glow, { backgroundColor: soft }]}
      />

      <MotiView
        from={{ rotate: '-6deg', translateY: 0 }}
        animate={{ rotate: '6deg', translateY: -3 }}
        transition={{
          type: 'timing',
          duration: 1600,
          loop: true,
          repeatReverse: true,
        }}
        style={styles.iconWrap}
      >
        <Calendar size={36} color={accentColor} strokeWidth={2.2} />
      </MotiView>

      <View style={styles.barsRow}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <MotiView
            key={i}
            from={{ height: MIN_BAR_H, opacity: 0.35 }}
            animate={{ height: MAX_BAR_H, opacity: 1 }}
            transition={{
              type: 'timing',
              duration: 520,
              loop: true,
              delay: i * 85,
              repeatReverse: true,
            }}
            style={[
              styles.bar,
              {
                width: BAR_WIDTH,
                backgroundColor: accentColor,
                marginHorizontal: BAR_GAP / 2,
              },
            ]}
          />
        ))}
      </View>

      <MotiView
        from={{ opacity: 0.55 }}
        animate={{ opacity: 1 }}
        transition={{
          type: 'timing',
          duration: 900,
          loop: true,
          repeatReverse: true,
        }}
      >
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </MotiView>
    </View>
  );
}

export const AppointmentsCalendarLoader = memo(AppointmentsCalendarLoaderInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  iconWrap: {
    marginBottom: 4,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: MAX_BAR_H + 8,
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  bar: {
    borderRadius: 3,
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 8,
    writingDirection: 'rtl',
  },
});
