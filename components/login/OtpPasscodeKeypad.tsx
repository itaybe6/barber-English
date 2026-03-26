import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { MotiView } from 'moti';
import Animated, { Easing, type AnimatedStyle } from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const PASSCODE_LENGTH = 6;

export type OtpKeyId = number | 'space' | 'delete';

export const OTP_KEYPAD_ROWS: OtpKeyId[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['space', 0, 'delete'],
];

export interface OtpPasscodeKeypadProps {
  passcode: number[];
  onKey: (key: OtpKeyId) => void;
  busy: boolean;
  disabled: boolean;
  useLightFg: boolean;
  primary: string;
  heroText: string;
  heroFaint: string;
  /** Reanimated style for horizontal shake on error */
  shakeDotsStyle: AnimatedStyle;
  deleteA11yLabel: string;
}

/**
 * Six circular slots + custom dial keypad — shared by login-otp and register OTP step.
 * Container width follows parent padding (body uses paddingHorizontal 26).
 */
export function OtpPasscodeKeypad({
  passcode,
  onKey,
  busy,
  disabled,
  useLightFg,
  primary,
  heroText,
  heroFaint,
  shakeDotsStyle,
  deleteA11yLabel,
}: OtpPasscodeKeypadProps) {
  const { width: winW } = useWindowDimensions();

  const { keypadInnerW, colGap, keyW, keyH, dotGap, dotSize } = useMemo(() => {
    const keypadInnerW = winW - 52;
    const colGap = 12;
    const keyW = Math.floor((keypadInnerW - 2 * colGap) / 3);
    const keyH = Math.min(56, Math.round(keyW * 0.95));
    const dotGap = 10;
    const dotSize = Math.min(
      46,
      (winW - 52 - dotGap * (PASSCODE_LENGTH - 1)) / PASSCODE_LENGTH,
    );
    return { keypadInnerW, colGap, keyW, keyH, dotGap, dotSize };
  }, [winW]);

  const dotOuterBg = useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)';
  const deleteIconColor = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';

  return (
    <>
      <Animated.View style={[styles.dotsRow, shakeDotsStyle, { gap: dotGap }]}>
        {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
          <View
            key={`slot-${i}`}
            style={[
              styles.dotOuter,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: dotOuterBg,
              },
            ]}
          >
            {passcode[i] !== undefined && (
              <MotiView
                from={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: 'timing',
                  duration: 220,
                  easing: Easing.out(Easing.back(1.2)),
                }}
                style={[
                  styles.dotInner,
                  {
                    backgroundColor: primary,
                    borderRadius: dotSize / 2,
                  },
                ]}
              >
                <Text style={[styles.dotDigit, { fontSize: dotSize * 0.42 }]}>{String(passcode[i])}</Text>
              </MotiView>
            )}
          </View>
        ))}
      </Animated.View>

      <View style={styles.spinnerSlot}>
        {busy ? (
          <ActivityIndicator color={useLightFg ? '#FFFFFF' : primary} size="small" />
        ) : null}
      </View>

      <View style={[styles.keypad, { width: keypadInnerW }]}>
        {OTP_KEYPAD_ROWS.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={[
              styles.keypadRow,
              {
                width: keypadInnerW,
                marginBottom: rowIndex < OTP_KEYPAD_ROWS.length - 1 ? 8 : 0,
                gap: colGap,
              },
            ]}
          >
            {row.map((key, colIndex) => {
              if (key === 'space') {
                return (
                  <View
                    key={`sp-${rowIndex}-${colIndex}`}
                    style={{ width: keyW, height: keyH }}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                );
              }
              return (
                <TouchableOpacity
                  key={`${rowIndex}-${String(key)}`}
                  onPress={() => onKey(key)}
                  disabled={disabled}
                  style={[
                    styles.keyCell,
                    { width: keyW, height: keyH },
                    useLightFg && styles.keyCellLight,
                  ]}
                  accessibilityRole="keyboardkey"
                  accessibilityLabel={key === 'delete' ? deleteA11yLabel : String(key)}
                >
                  {key === 'delete' ? (
                    <MaterialCommunityIcons name="keyboard-backspace" size={34} color={deleteIconColor} />
                  ) : (
                    <Text style={[styles.keyText, { color: heroText }]}>{key}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    direction: 'ltr',
  },
  dotOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dotInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDigit: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  spinnerSlot: {
    minHeight: 22,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  keypad: {
    marginTop: 4,
    marginBottom: 12,
    alignSelf: 'center',
    direction: 'ltr',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  keyCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  keyCellLight: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '700',
  },
});
