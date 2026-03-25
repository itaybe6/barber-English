import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const defaultGradients = [
  { start: '#ff0000', end: '#ff4000' },
  { start: '#ff4000', end: '#ff7f00' },
  { start: '#ff7f00', end: '#ffbf00' },
  { start: '#ffbf00', end: '#ffff00' },
  { start: '#ffff00', end: '#80ff00' },
  { start: '#80ff00', end: '#00ff80' },
  { start: '#00ff80', end: '#00ffff' },
  { start: '#00ffff', end: '#0080ff' },
  { start: '#0080ff', end: '#0000ff' },
  { start: '#0000ff', end: '#4b0082' },
  { start: '#4b0082', end: '#9400d3' },
  { start: '#9400d3', end: '#ff007f' },
  { start: '#ff007f', end: '#ff0000' },
];

export interface GradientPair {
  start: string;
  end: string;
}

export interface FlowerProps {
  leafs: number;
  size: number;
  duration?: number;
  initialActiveIndex?: number;
  gradients?: GradientPair[];
  onPress?: (index: number) => void;
}

interface LeafProps {
  index: number;
  leafs: number;
  size: number;
  progress: SharedValue<number>;
  gradient: GradientPair;
  dummyLeaf?: boolean;
  onLeafPress?: () => void;
}

function Leaf({
  leafs,
  index,
  progress,
  size,
  gradient,
  onLeafPress,
  dummyLeaf,
}: LeafProps) {
  const leafSize = Math.floor(size * 0.25);
  const TWO_PI = 2 * Math.PI;
  const angle = TWO_PI / leafs;

  const radius = useDerivedValue(() =>
    interpolate(progress.value, [0, 1], [0, leafSize])
  );

  const stylez = useAnimatedStyle(() => ({
    zIndex: dummyLeaf && progress.value === 1 ? -1 : leafSize - index,
    opacity: !dummyLeaf ? 1 : interpolate(progress.value, [0.2, 1], [1, 0]),
    transform: [
      {
        translateX:
          Math.cos(progress.value * angle * (leafs - index)) * radius.value,
      },
      {
        translateY:
          Math.sin(progress.value * angle * (leafs - index)) * radius.value,
      },
      {
        scale: dummyLeaf
          ? 1
          : interpolate(
              progress.value,
              [0, 0.05],
              [0.5, 1],
              Extrapolation.CLAMP
            ),
      },
      {
        rotate: `${progress.value * angle * (leafs - index)}rad`,
      },
    ],
    // Increase the width only — height stays at leafSize so it goes from circle → oval
    width: interpolate(progress.value, [0, 1], [leafSize, leafSize * 2 - 10]),
    shadowOpacity: interpolate(progress.value, [0, 1], [0, 0.5]),
    shadowRadius: interpolate(progress.value, [0, 1], [0, leafSize / 6]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          backgroundColor: gradient.start,
          width: leafSize,
          height: leafSize,
          borderRadius: leafSize,
          shadowOffset: { width: 0, height: 0 },
          shadowColor: '#000',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: leafs - index,
        },
        stylez,
      ]}
      onTouchStart={() => onLeafPress?.()}
    >
      <LinearGradient
        start={[0, 1]}
        end={[1, 0]}
        colors={[gradient.start, gradient.end]}
        style={{ flex: 1, borderRadius: leafSize }}
      />
    </Animated.View>
  );
}

const _spacing = 30;

export function Flower({
  leafs,
  size,
  gradients = defaultGradients,
  onPress,
  initialActiveIndex = 0,
  duration = 1000,
}: FlowerProps) {
  const progress = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);

  const stylez = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [size * 0.25 + _spacing, size]),
    height: interpolate(progress.value, [0, 1], [size * 0.25 + _spacing, size]),
  }));

  const animate = useCallback(() => {
    progress.value = withTiming(progress.value === 0 ? 1 : 0, {
      duration,
      easing: Easing.elastic(0.9),
    });
  }, [duration, progress]);

  const safeGradients = gradients.length >= leafs ? gradients : defaultGradients;

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: -10, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 10,
          backgroundColor: '#ffffff',
          transform: [{ rotate: '-90deg' }],
        },
        stylez,
      ]}
    >
      {Array.from({ length: leafs }).map((_, i) => (
        <Leaf
          index={i}
          key={i}
          progress={progress}
          size={size - _spacing}
          leafs={leafs}
          onLeafPress={() => {
            setActiveIndex(i);
            animate();
            onPress?.(i);
          }}
          gradient={safeGradients[i % safeGradients.length]}
        />
      ))}
      <Leaf
        index={0}
        progress={progress}
        size={size}
        leafs={leafs}
        dummyLeaf
        gradient={safeGradients[activeIndex % safeGradients.length]}
        onLeafPress={animate}
      />
    </Animated.View>
  );
}
