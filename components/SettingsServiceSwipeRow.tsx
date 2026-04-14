import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

/** Must match `swipeDeleteAction` width in settings styles */
export const SETTINGS_SERVICE_SWIPE_DELETE_W = 88;

interface SettingsServiceSwipeRowProps {
  /** When false (e.g. expanded editor), horizontal swipe is disabled */
  enabled: boolean;
  onDeletePress: () => void;
  children: React.ReactNode;
}

/**
 * Swipe-to-delete for service rows with a hard cap on horizontal travel.
 * Replaces RNGH `Swipeable` here because its right-panel width measurement breaks
 * under RTL + `row-reverse`, allowing the row to drag across the full screen while
 * the delete target stays a thin sliver.
 */
export function SettingsServiceSwipeRow({
  enabled,
  onDeletePress,
  children,
}: SettingsServiceSwipeRowProps) {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const closeRow = useCallback(() => {
    translateX.value = withSpring(0, { damping: 28, stiffness: 320 });
  }, [translateX]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-26, 26])
    .failOffsetY([-18, 18])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      const minX = -SETTINGS_SERVICE_SWIPE_DELETE_W;
      translateX.value = next > 0 ? 0 : next < minX ? minX : next;
    })
    .onEnd(() => {
      const threshold = -SETTINGS_SERVICE_SWIPE_DELETE_W * 0.45;
      if (translateX.value < threshold) {
        translateX.value = withSpring(-SETTINGS_SERVICE_SWIPE_DELETE_W, { damping: 26, stiffness: 300 });
      } else {
        translateX.value = withSpring(0, { damping: 26, stiffness: 300 });
      }
    });

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleDeleteTap = () => {
    closeRow();
    onDeletePress();
  };

  return (
    <View style={styles.root} accessibilityElementsHidden={false}>
      {/* LTR layer so “swipe left to reveal delete on the right” matches iOS muscle memory in Hebrew UI */}
      <View style={styles.ltrLayer} pointerEvents="box-none">
        <View style={styles.deleteStrip} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteTap()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('settings.services.a11yDelete', 'Delete service')}
          >
            <Trash2 size={20} color="#fff" />
            <Text style={styles.deleteLabel}>{t('settings.services.delete', 'Delete')}</Text>
          </TouchableOpacity>
        </View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.foreground, foregroundStyle]} pointerEvents="box-none">
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
  },
  ltrLayer: {
    direction: 'ltr',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
  },
  deleteStrip: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  deleteBtn: {
    width: SETTINGS_SERVICE_SWIPE_DELETE_W,
    marginVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  deleteLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  foreground: {
    backgroundColor: 'transparent',
  },
});
