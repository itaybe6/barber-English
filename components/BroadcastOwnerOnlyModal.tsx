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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';

export interface BroadcastOwnerOnlyModalProps {
  visible: boolean;
  onClose: () => void;
}

function isHebrewLocale(lang: string | undefined): boolean {
  if (typeof lang !== 'string') return false;
  const l = lang.toLowerCase();
  return l.startsWith('he') || l.startsWith('iw');
}

export default function BroadcastOwnerOnlyModal({ visible, onClose }: BroadcastOwnerOnlyModalProps) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  /** Modal often ignores app RTL; use resolved language + explicit alignment (not only I18nManager). */
  const activeLang = i18n.resolvedLanguage || i18n.language;
  const isRtlUI = isHebrewLocale(activeLang) || I18nManager.isRTL;
  const styles = useMemo(() => createStyles(colors, isRtlUI), [colors, isRtlUI]);

  const title = t('admin.broadcastComposer.ownerOnlyTitle');
  const message = t('admin.broadcastComposer.ownerOnlyMessage');
  const okLabel = t('admin.broadcastComposer.ok');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 20) }]}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Pressable style={styles.cardWrap} onPress={(e) => e.stopPropagation()}>
          {/* LTR box so layout is predictable; Hebrew uses explicit right alignment (Modal often ignores global RTL). */}
          <View style={styles.card}>
            <LinearGradient
              colors={[colors.primary, `${colors.primary}CC`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.topAccent}
            />
            <View
              style={[
                styles.iconRing,
                isRtlUI ? styles.iconRingRtl : styles.iconRingLtr,
                { backgroundColor: `${colors.primary}1A`, borderColor: `${colors.primary}33` },
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.message}>{message}</Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={onClose}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={okLabel}
            >
              <Text style={styles.primaryButtonText}>{okLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isRtlUI: boolean) {
  const align = isRtlUI ? 'right' : 'left';
  const writingDir = isRtlUI ? ('rtl' as const) : ('ltr' as const);

  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.52)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 22,
    },
    cardWrap: {
      width: '100%',
      maxWidth: 360,
    },
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 26,
      overflow: 'hidden',
      paddingTop: 22,
      paddingHorizontal: 22,
      paddingBottom: 22,
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.18,
          shadowRadius: 32,
        },
        android: {
          elevation: 14,
        },
        default: {},
      }),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(15, 23, 42, 0.08)',
    },
    topAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
    },
    iconRing: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 18,
      borderWidth: 1,
    },
    iconRingRtl: {
      alignSelf: 'flex-end',
    },
    iconRingLtr: {
      alignSelf: 'flex-start',
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      textAlign: align,
      writingDirection: writingDir,
      width: '100%' as const,
      letterSpacing: isRtlUI ? 0 : -0.3,
      lineHeight: 28,
    },
    message: {
      marginTop: 12,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: align,
      writingDirection: writingDir,
      width: '100%' as const,
      lineHeight: 23,
    },
    primaryButton: {
      marginTop: 26,
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
}
