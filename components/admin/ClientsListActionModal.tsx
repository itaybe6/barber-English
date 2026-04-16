import { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
  I18nManager,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, usePrimaryContrast, type ThemeColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';

function isHebrewLocale(lang: string | undefined): boolean {
  if (typeof lang !== 'string') return false;
  const l = lang.toLowerCase();
  return l.startsWith('he') || l.startsWith('iw') || l.startsWith('ar');
}

export interface ClientsListActionModalProps {
  visible: boolean;
  title: string;
  message: string;
  /** When false, only the primary button is shown (e.g. OK on error). */
  showCancel: boolean;
  cancelText: string;
  confirmText: string;
  confirmDestructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Render as an in-tree overlay (e.g. on top of the clients bottom sheet) instead of a nested `Modal`.
   */
  embedded?: boolean;
}

export default function ClientsListActionModal({
  visible,
  title,
  message,
  showCancel,
  cancelText,
  confirmText,
  confirmDestructive,
  onCancel,
  onConfirm,
  embedded = false,
}: ClientsListActionModalProps) {
  const { i18n } = useTranslation();
  const colors = useColors();
  const { onPrimary } = usePrimaryContrast();
  const insets = useSafeAreaInsets();
  const activeLang = i18n.resolvedLanguage || i18n.language;
  const isRtlText = isHebrewLocale(activeLang) || I18nManager.isRTL;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const textAlignStyle: TextStyle = useMemo(
    () => ({
      textAlign: isRtlText ? 'right' : 'left',
      writingDirection: isRtlText ? 'rtl' : 'ltr',
    }),
    [isRtlText]
  );

  const dismiss = () => {
    if (showCancel) onCancel();
    else onConfirm();
  };

  const overlayPadBottom = Math.max(insets.bottom, 20);

  const backdropStyle: StyleProp<ViewStyle> = [
    styles.overlay,
    { paddingBottom: overlayPadBottom },
  ];

  const embeddedBackdropStyle: StyleProp<ViewStyle> = [
    StyleSheet.absoluteFillObject,
    styles.overlay,
    { paddingBottom: overlayPadBottom },
  ];

  const card = (
    <Pressable style={[styles.card, { direction: 'ltr' }]} onPress={() => {}} accessibilityRole="none">
      <Text style={[styles.title, textAlignStyle]} maxFontSizeMultiplier={1.35} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.message, textAlignStyle]} maxFontSizeMultiplier={1.35}>
        {message}
      </Text>
      <View style={styles.buttonsRow} accessibilityRole="toolbar">
        {showCancel ? (
          <TouchableOpacity
            style={styles.btnCancel}
            onPress={onCancel}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={cancelText}
          >
            <Text style={styles.btnCancelText}>{cancelText}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            showCancel ? styles.btnConfirmSplit : styles.btnConfirmFull,
            confirmDestructive ? styles.btnDanger : { backgroundColor: colors.primary },
          ]}
          onPress={onConfirm}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={confirmText}
        >
          <Text
            style={confirmDestructive ? styles.btnDangerText : [styles.btnPrimaryText, { color: onPrimary }]}
          >
            {confirmText}
          </Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );

  if (embedded) {
    if (!visible) return null;
    return (
      <View style={styles.embeddedRoot} pointerEvents="box-none">
        <Pressable style={embeddedBackdropStyle} onPress={dismiss} accessibilityRole="button">
          {card}
        </Pressable>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={dismiss}
    >
      <Pressable style={backdropStyle} onPress={dismiss} accessibilityRole="button">
        {card}
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    embeddedRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 200,
      elevation: 200,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: '#FFFFFF',
      borderRadius: 20,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.06)',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.14,
          shadowRadius: 22,
        },
        android: { elevation: 10 },
        default: {},
      }),
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.35,
      width: '100%',
      alignSelf: 'stretch',
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 22,
      width: '100%',
      alignSelf: 'stretch',
      marginBottom: 22,
    },
    buttonsRow: {
      flexDirection: 'row',
      width: '100%',
      gap: 10,
    },
    btnCancel: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F2F2F7',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.06)',
    },
    btnCancelText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    btnConfirmSplit: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnConfirmFull: {
      flex: 1,
      minWidth: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnDanger: {
      backgroundColor: '#FFECEC',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#FFD0D0',
    },
    btnDangerText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FF3B30',
    },
    btnPrimaryText: {
      fontSize: 16,
      fontWeight: '800',
    },
  });
}
