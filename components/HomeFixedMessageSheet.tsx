import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, I18nManager } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/src/theme/ThemeProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const COPY_MAX_WIDTH = 340;

export interface HomeFixedMessageSheetProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}

/**
 * Client home: salon broadcast message as a bottom sheet (drag down / backdrop to close).
 */
export default function HomeFixedMessageSheet({
  visible,
  message,
  onDismiss,
}: HomeFixedMessageSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colors = useColors();
  const isRTL = I18nManager.isRTL;

  const maxDynamicContentSize = useMemo(() => Math.round(SCREEN_H * 0.88), []);
  /** Slightly taller sheet than raw content (dynamic sizing still applies for long text). */
  const minScrollMinHeight = useMemo(() => Math.round(SCREEN_H * 0.36), []);

  useEffect(() => {
    if (visible && message.length > 0) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible, message]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );

  const sheetBg = useCallback(
    () => (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderCurve: 'continuous',
          },
        ]}
      />
    ),
    [colors.surface],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      name="homeFixedMessage"
      enableDynamicSizing
      maxDynamicContentSize={maxDynamicContentSize}
      topInset={insets.top}
      bottomInset={0}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundComponent={sheetBg}
      handleIndicatorStyle={{ backgroundColor: `${colors.text}28`, width: 40 }}
      enablePanDownToClose
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 18) + 6,
            minHeight: minScrollMinHeight,
          },
        ]}
      >
        <View style={styles.sheetColumn}>
          <View
            style={[
              styles.headerBand,
              { borderBottomColor: `${colors.text}12` },
            ]}
          >
            <View style={styles.headerRow}>
              <View
                style={[styles.iconWrap, { backgroundColor: `${colors.primary}1F` }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons name="megaphone-outline" size={19} color={colors.primary} />
              </View>
              <Text
                style={[styles.headerTitle, { color: colors.text }]}
                accessibilityRole="header"
              >
                {t('home.fixedMessage.title', 'Important message')}
              </Text>
            </View>
          </View>

          <View style={styles.bodyBlock}>
            <Text
              style={[
                styles.body,
                {
                  color: colors.text,
                  writingDirection: isRTL ? 'rtl' : 'ltr',
                },
              ]}
            >
              {message}
            </Text>
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 2,
    alignItems: 'stretch',
  },
  sheetColumn: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
  },
  headerBand: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'nowrap',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexShrink: 1,
    maxWidth: '78%',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.35,
    textAlign: 'center',
    lineHeight: 22,
  },
  bodyBlock: {
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  body: {
    width: '100%',
    maxWidth: COPY_MAX_WIDTH,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
    letterSpacing: -0.12,
    textAlign: 'center',
  },
});
