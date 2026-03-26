import { memo, useMemo } from 'react';
import { TextProps, View, StyleSheet } from 'react-native';
import Animated, { FadeOut, runOnJS, SlideInDown } from 'react-native-reanimated';

export type AnimatedSentenceProps = TextProps & {
  onExitFinish?: () => void;
  onEnterFinish?: (wordsCount: number) => void;
  /** Delay between consecutive words (ms). */
  stagger?: number;
  /** Extra delay before the first word (ms), e.g. to sequence multiple sentences. */
  baseDelay?: number;
};

export const AnimatedSentence = memo(
  ({
    children,
    onExitFinish,
    onEnterFinish,
    stagger = 100,
    baseDelay = 0,
    ...rest
  }: AnimatedSentenceProps) => {
    if (typeof children !== 'string') {
      throw new Error('AnimatedSentence only accepts string');
    }

    const trimmed = children.trim();
    const words = useMemo(() => (trimmed ? trimmed.split(/\s+/) : []), [trimmed]);

    if (words.length === 0) {
      return null;
    }

    const flat = StyleSheet.flatten(rest.style);
    const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : 50;

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} key={trimmed}>
        {words.map((word, index) => (
          <View style={{ overflow: 'hidden' }} key={`word-${index}-${word}`}>
            <Animated.Text
              entering={SlideInDown.springify()
                .delay(baseDelay + index * stagger)
                .withInitialValues({
                  originY: (fontSize + 10) * 2,
                })
                .withCallback((finished) => {
                  if (
                    finished &&
                    index === words.length - 1 &&
                    onEnterFinish &&
                    trimmed !== ''
                  ) {
                    runOnJS(onEnterFinish)(words.length);
                  }
                })}
              exiting={FadeOut.springify().withCallback((finished) => {
                if (
                  finished &&
                  index === words.length - 1 &&
                  onExitFinish &&
                  trimmed !== ''
                ) {
                  runOnJS(onExitFinish)();
                }
              })}
              {...rest}
            >
              {word}
            </Animated.Text>
          </View>
        ))}
      </View>
    );
  }
);

AnimatedSentence.displayName = 'AnimatedSentence';
