import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatePresence, MotiView } from 'moti';

const { width } = Dimensions.get('screen');

const DEFAULT_SIZE = Math.min(148, Math.round(width * 0.36));
const DEFAULT_COLOR = '#34C759';
const DURATION = 320;

type Props = {
  size?: number;
  color?: string;
};

export default function BookingSuccessAnimation({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }: Props) {
  const [played, setPlayed] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setPlayed(true), 60);
    return () => clearTimeout(id);
  }, []);

  return (
    <View style={[s.wrap, { width: size, height: size }]}>
      {/* Expanding background burst */}
      <MotiView
        animate={{ scale: played ? 10 : 1 }}
        transition={{ type: 'timing', duration: DURATION * 1.4 }}
        style={[
          s.burst,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />

      {/* Main circle */}
      <MotiView
        animate={{ backgroundColor: played ? '#FFFFFF' : color }}
        transition={{ type: 'timing', duration: DURATION }}
        style={[
          s.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <AnimatePresence exitBeforeEnter>
          {!played ? (
            <MotiView
              key="pre"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'timing', duration: Math.max(40, DURATION / 10) }}
            >
              <Feather name="check" size={size * 0.46} color="#FFFFFF" />
            </MotiView>
          ) : (
            <MotiView
              key="post"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'timing', duration: Math.max(40, DURATION / 10) }}
            >
              <Feather name="check" size={size * 0.46} color={color} />
            </MotiView>
          )}
        </AnimatePresence>
      </MotiView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

