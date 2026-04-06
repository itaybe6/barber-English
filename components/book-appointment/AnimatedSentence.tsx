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
  /** Word order + wrap edge for RTL (Hebrew). */
  rtl?: boolean;
  /** When false, row shrink-wraps so the block can align to one screen edge (e.g. left). */
  fullWidth?: boolean;
  /** With fullWidth, packs each wrapped line (e.g. center the sentence block). */
  rowJustify?: 'flex-start' | 'center' | 'flex-end';
  /** Keep all words on one row (may clip on tiny screens — pair with shorter copy / smaller font). */
  nowrap?: boolean;
  /** Horizontal gap between word chips (default 4). Use a larger value for very large headlines. */
  wordGap?: number;
};

export const AnimatedSentence = memo(
  ({
    children,
    onExitFinish,
    onEnterFinish,
    stagger = 100,
    baseDelay = 0,
    rtl = false,
    fullWidth = true,
    rowJustify = 'flex-start',
    nowrap = false,
    wordGap = 4,
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
      <View
        style={{
          flexDirection: 'row',
          flexWrap: nowrap ? 'nowrap' : 'wrap',
          gap: wordGap,
          justifyContent: rowJustify,
          ...(rowJustify === 'center' ? { alignContent: 'center' as const } : null),
          ...(fullWidth ? { width: '100%' as const, alignSelf: 'stretch' as const } : { alignSelf: 'flex-start' as const }),
          ...(rtl ? { direction: 'rtl' as const } : null),
        }}
        key={trimmed}
      >
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
