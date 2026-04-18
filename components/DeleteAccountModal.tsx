import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, I18nManager } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { AlertTriangle, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/authStore';
import { useAdminCalendarSheetTimingConfig } from '@/components/admin-calendar/useAdminCalendarSheetTiming';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DELETE_ITEM_KEYS = [
  'profile.delete.items.profile',
  'profile.delete.items.appointments',
  'profile.delete.items.constraints',
  'profile.delete.items.hours',
  'profile.delete.items.gallery',
  'profile.delete.items.notifications',
  'profile.delete.items.recurring',
  'profile.delete.items.waitlist',
] as const;

const DANGER = '#E53935';
const DANGER_SOFT = '#FFEBEE';

export default function DeleteAccountModal({ visible, onClose, onSuccess }: DeleteAccountModalProps) {
  const { colors } = useBusinessColors();
  const logout = useAuthStore((state) => state.logout);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['90%'], []);
  const animationConfigs = useAdminCalendarSheetTimingConfig();
  const isRTL = I18nManager.isRTL;

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => onClose(), [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  const sheetBg = useCallback(
    () => (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          },
        ]}
      />
    ),
    [colors.surface],
  );

  const handleDeleteAccount = async () => {
    Alert.alert(t('profile.delete.title'), t('profile.delete.confirmAlert'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('profile.delete.confirmButton'),
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            const success = await usersApi.deleteUserAndAllData();
            if (success) {
              Alert.alert(t('success.generic'), t('profile.delete.success'), [
                {
                  text: t('ok'),
                  onPress: () => {
                    onClose();
                    logout();
                    onSuccess();
                  },
                },
              ]);
            } else {
              Alert.alert(t('error.generic'), t('profile.delete.failed'));
            }
          } catch (error) {
            console.error('Error deleting account:', error);
            Alert.alert(t('error.generic'), t('profile.delete.failed'));
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      index={0}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      backgroundComponent={sheetBg}
      handleIndicatorStyle={{ backgroundColor: `${colors.text}24`, width: 42, height: 4 }}
      enablePanDownToClose
      topInset={insets.top}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.headerBlock}>
          <LinearGradient
            colors={[`${DANGER}22`, DANGER_SOFT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerIconRing}
          >
            <AlertTriangle size={30} color={DANGER} strokeWidth={2.2} />
          </LinearGradient>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('profile.delete.title')}</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
            {t('profile.delete.subtitle')}
          </Text>
        </View>

        <Text style={[styles.warningTitle, { color: DANGER }]}>{t('profile.delete.warningTitle')}</Text>
        <Text style={[styles.warningBody, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('profile.delete.warningBody')}
        </Text>

        <View style={[styles.listCard, { borderColor: `${colors.text}10`, backgroundColor: colors.surface }]}>
          {DELETE_ITEM_KEYS.map((key, i) => (
            <View
              key={key}
              style={[
                styles.listRow,
                i < DELETE_ITEM_KEYS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${colors.text}0D` },
              ]}
            >
              {isRTL ? (
                <>
                  <Trash2 size={17} color={`${colors.text}55`} style={styles.listTrash} />
                  <Text style={[styles.listText, { color: colors.text, textAlign: 'right' }]} numberOfLines={2}>
                    {t(key)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.listText, { color: colors.text, textAlign: 'left' }]} numberOfLines={2}>
                    {t(key)}
                  </Text>
                  <Trash2 size={17} color={`${colors.text}55`} style={styles.listTrash} />
                </>
              )}
            </View>
          ))}
        </View>

        <View style={[styles.noteCard, { borderStartColor: '#F9A825' }]}>
          <Text style={[styles.noteText, { textAlign: isRTL ? 'right' : 'left' }]}>{t('profile.delete.note')}</Text>
        </View>

        <View style={[styles.actionsRow, isRTL && styles.actionsRowRtl]}>
          <TouchableOpacity
            style={[
              styles.deleteBtn,
              { backgroundColor: DANGER, shadowColor: DANGER },
              isLoading && styles.btnDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Trash2 size={18} color="#fff" style={isRTL ? styles.iconLeadingRtl : styles.iconLeading} />
                <Text style={styles.deleteBtnLabel}>{t('profile.delete.title')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cancelBtn,
              { borderColor: colors.primary, backgroundColor: colors.surface },
              isLoading && styles.btnDisabled,
            ]}
            onPress={() => sheetRef.current?.dismiss()}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelBtnLabel, { color: colors.primary }]}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  warningTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  warningBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  listText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  listTrash: {
    flexShrink: 0,
  },
  noteCard: {
    backgroundColor: '#FFFDE7',
    borderRadius: 14,
    padding: 16,
    borderStartWidth: 4,
    marginBottom: 22,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5D4037',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  actionsRowRtl: {
    flexDirection: 'row-reverse',
  },
  deleteBtn: {
    flex: 1.05,
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  iconLeading: {
    marginRight: 8,
  },
  iconLeadingRtl: {
    marginLeft: 8,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
