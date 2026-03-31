import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

const SPACING = 8;
const RULER_HEIGHT = 24;
const RULER_TICK_WIDTH = 2;
const ITEM_SIZE = SPACING;

Animated.addWhitelistedNativeProps({ text: true });

interface RulerLineProps {
  index: number;
  scrollX: SharedValue<number>;
  tickColor: string;
}

function RulerLine({ index, scrollX, tickColor }: RulerLineProps) {
  const stylez = useAnimatedStyle(() => ({
    transform: [
      {
        scaleY: interpolate(scrollX.value, [index - 1, index, index + 1], [0.98, 1, 0.98]),
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          height: RULER_HEIGHT,
          width: ITEM_SIZE,
          justifyContent: 'center',
          alignItems: 'center',
        },
        stylez,
      ]}
    >
      <View
        style={{
          width: RULER_TICK_WIDTH,
          height: '100%',
          backgroundColor: tickColor,
          opacity: 0.45,
        }}
      />
    </Animated.View>
  );
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedDayTextProps {
  scrollX: SharedValue<number>;
  minDay: number;
  color: string;
}

function AnimatedDayText({ scrollX, minDay, color }: AnimatedDayTextProps) {
  /* `text` is a Reanimated-whitelisted native prop on Animated.TextInput */
  const animatedProps = useAnimatedProps<any>(() => ({
    text: String(minDay + Math.round(scrollX.value)),
  }));
  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      defaultValue={String(minDay)}
      animatedProps={animatedProps}
      style={[
        {
          fontSize: 40,
          fontWeight: '800',
          textAlign: 'center',
          letterSpacing: -2,
          fontVariant: ['tabular-nums'],
          color,
          minWidth: 72,
          paddingVertical: 0,
        },
      ]}
    />
  );
}

export interface BookingDaysRulerHandle {
  scrollToDay: (day: number) => void;
}

export interface BookingDaysRulerProps {
  minDay?: number;
  maxDay?: number;
  fadeColor?: string;
  tickColor?: string;
  indicatorColor?: string;
  unitLabel: string;
  onDayChange: (day: number) => void;
}

export const BookingDaysRuler = forwardRef<BookingDaysRulerHandle, BookingDaysRulerProps>(
  function BookingDaysRuler(
    {
      minDay = 1,
      maxDay = 60,
      fadeColor = '#ffffff',
      tickColor,
      indicatorColor,
      unitLabel,
      onDayChange,
    },
    ref,
  ) {
    const { width: windowWidth } = useWindowDimensions();
    const tick = tickColor ?? Colors.text;
    const center = indicatorColor ?? Colors.primary;

    const tickCount = maxDay - minDay + 1;
    const data = useMemo(() => Array.from({ length: tickCount }, (_, i) => i), [tickCount]);

    const scrollX = useSharedValue(0);
    const listRef = useRef<FlatList<number>>(null);

    const emitDay = useCallback(
      (day: number) => {
        const d = Math.max(minDay, Math.min(maxDay, day));
        onDayChange(d);
      },
      [minDay, maxDay, onDayChange],
    );

    const onScroll = useAnimatedScrollHandler({
      onScroll: (e) => {
        scrollX.value = clamp(e.contentOffset.x / ITEM_SIZE, 0, tickCount - 1);
      },
      onEndDrag: (e) => {
        const idx = Math.round(clamp(e.contentOffset.x / ITEM_SIZE, 0, tickCount - 1));
        runOnJS(emitDay)(minDay + idx);
      },
      onMomentumEnd: (e) => {
        const idx = Math.round(clamp(e.contentOffset.x / ITEM_SIZE, 0, tickCount - 1));
        runOnJS(emitDay)(minDay + idx);
      },
    });

    const scrollToDay = useCallback(
      (day: number) => {
        const idx = Math.max(0, Math.min(tickCount - 1, day - minDay));
        scrollX.value = idx;
        listRef.current?.scrollToOffset({ offset: idx * ITEM_SIZE, animated: false });
      },
      [minDay, tickCount],
    );

    useImperativeHandle(ref, () => ({ scrollToDay }), [scrollToDay]);

    const sidePad = windowWidth / 2 - ITEM_SIZE / 2;

    return (
      <View style={styles.wrap}>
        <View style={styles.valueBlock}>
          <AnimatedDayText scrollX={scrollX} minDay={minDay} color={center} />
          <Text style={styles.unit}>{unitLabel}</Text>
        </View>

        <View style={styles.rulerHost}>
          <Animated.FlatList
            ref={listRef}
            data={data}
            keyExtractor={(item) => String(item)}
            horizontal
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_SIZE}
            snapToAlignment="start"
            contentContainerStyle={{
              paddingHorizontal: sidePad,
            }}
            renderItem={({ index }) => <RulerLine index={index} scrollX={scrollX} tickColor={tick} />}
            onScroll={onScroll}
            scrollEventThrottle={1000 / 60}
          />
          <View style={[styles.centerLine, { backgroundColor: center }]} />
          <LinearGradient
            style={StyleSheet.absoluteFillObject}
            colors={[fadeColor, `${fadeColor}00`, `${fadeColor}00`, fadeColor]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            locations={[0, 0.28, 0.72, 1]}
            pointerEvents="none"
          />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    gap: SPACING,
    marginTop: 12,
  },
  valueBlock: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING,
  },
  unit: {
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
    color: Colors.subtext,
    marginTop: 6,
  },
  rulerHost: {
    justifyContent: 'center',
  },
  centerLine: {
    alignSelf: 'center',
    position: 'absolute',
    height: RULER_HEIGHT + 6,
    width: RULER_TICK_WIDTH,
    borderRadius: 1,
    top: 0,
  },
});
