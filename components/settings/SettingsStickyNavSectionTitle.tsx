import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface SettingsStickyNavSectionTitleProps {
  sectionKey: string;
  title: string;
}

/**
 * Sticky settings header: crossfades when the active section changes while scrolling.
 */
export function SettingsStickyNavSectionTitle({ sectionKey, title }: SettingsStickyNavSectionTitleProps) {
  return (
    <Reanimated.View
      key={sectionKey}
      entering={FadeIn.duration(170)}
      exiting={FadeOut.duration(110)}
      style={styles.wrap}
    >
      <Text style={styles.text} numberOfLines={1}>
        {title}
      </Text>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 22,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '100%',
    alignSelf: 'center',
  },
  text: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
});
