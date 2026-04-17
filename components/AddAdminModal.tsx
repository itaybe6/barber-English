import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
  Keyboard,
  PanResponder,
  Dimensions,
  I18nManager,
  InputAccessoryView,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { User, Phone, Lock } from 'lucide-react-native';
import { usersApi } from '@/lib/api/users';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { parseIsraeliMobileNational10 } from '@/lib/login/israeliMobilePhone';
import { readableOnHex } from '@/lib/utils/readableOnHex';

const { height: SH } = Dimensions.get('window');
const SHEET_ANIM_MS = 320;
const SWIPE_CLOSE_THRESHOLD = 80;
/** iOS: empty accessory replaces RN default toolbar above phone-pad / numeric keyboards */
const IOS_HIDDEN_KEYBOARD_ACCESSORY = 'addAdminModalIosHiddenAcc';
/** Minimum sheet body height — keep in sync with AddServiceModal `SHEET_SCROLL_MIN_HEIGHT` */
const SHEET_SCROLL_MIN_HEIGHT = SH * 0.54;

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n * f))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lightenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * ratio));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

export interface AddAdminModalEditingUser {
  id: string;
  name: string;
  phone: string;
}

interface AddAdminModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When set, modal is in edit mode for this admin (password optional — leave blank to keep). */
  editingUser?: AddAdminModalEditingUser | null;
}

export default function AddAdminModal({ visible, onClose, onSuccess, editingUser = null }: AddAdminModalProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 20);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();

  const activeLang = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isRtl = I18nManager.isRTL || activeLang.startsWith('he');

  const [isMounted, setIsMounted] = useState(visible);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const primary = businessColors.primary;
  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.4)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.2)';
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  const sheetTranslateY = useSharedValue(SH);
  const backdropOpacity = useSharedValue(0);
  const dragY = useSharedValue(0);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.get(),
  }));
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() + dragY.get() }],
  }));

  useEffect(() => {
    if (visible) setIsMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!isMounted) return;
    if (visible) {
      sheetTranslateY.set(SH);
      backdropOpacity.set(0);
      dragY.set(0);
      const frame = requestAnimationFrame(() => {
        sheetTranslateY.set(withTiming(0, { duration: SHEET_ANIM_MS, easing: Easing.out(Easing.cubic) }));
        backdropOpacity.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
      });
      return () => cancelAnimationFrame(frame);
    }
    sheetTranslateY.set(withTiming(SH, { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    backdropOpacity.set(withTiming(0, { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    const timer = setTimeout(() => setIsMounted(false), SHEET_ANIM_MS);
    return () => clearTimeout(timer);
  }, [backdropOpacity, dragY, isMounted, sheetTranslateY, visible]);

  const canonicalPhone = useMemo(() => parseIsraeliMobileNational10(phone), [phone]);
  const inputAlign = isRtl ? 'right' : 'left';
  const isEditMode = Boolean(editingUser?.id);

  const resetForm = useCallback(() => {
    setName('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setNameFocused(false);
    setPhoneFocused(false);
    setPasswordFocused(false);
    setConfirmFocused(false);
    setIsLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!visible) return;
    if (editingUser?.id) {
      setName(String(editingUser.name || ''));
      setPhone(String(editingUser.phone || ''));
      setPassword('');
      setConfirmPassword('');
      setNameFocused(false);
      setPhoneFocused(false);
      setPasswordFocused(false);
      setConfirmFocused(false);
    } else {
      resetForm();
    }
  }, [visible, editingUser?.id, editingUser?.name, editingUser?.phone, resetForm]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) dragY.set(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_CLOSE_THRESHOLD || gs.vy > 0.8) {
          dragY.set(withTiming(SH, { duration: 280, easing: Easing.in(Easing.cubic) }));
          setTimeout(() => {
            resetForm();
            onClose();
          }, 260);
        } else {
          dragY.set(withSpring(0, { damping: 18, stiffness: 260 }));
        }
      },
    })
  ).current;

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.nameRequired', 'Please enter a name'));
      return false;
    }
    if (!phone.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.phoneRequired', 'Please enter a phone number'));
      return false;
    }
    if (!canonicalPhone) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.phoneInvalid', 'Please enter a valid phone number'));
      return false;
    }
    if (isEditMode) {
      const pwEmpty = password.length === 0 && confirmPassword.length === 0;
      if (!pwEmpty) {
        if (password.length < 6) {
          Alert.alert(t('error.generic', 'Error'), t('settings.admin.passwordTooShort', 'Password must be at least 6 characters'));
          return false;
        }
        if (password !== confirmPassword) {
          Alert.alert(t('error.generic', 'Error'), t('settings.admin.passwordsMismatch', 'Passwords do not match'));
          return false;
        }
      }
      return true;
    }
    if (!password.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.passwordRequired', 'Please enter a password'));
      return false;
    }
    if (password.length < 6) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.passwordTooShort', 'Password must be at least 6 characters'));
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.passwordsMismatch', 'Passwords do not match'));
      return false;
    }
    return true;
  };

  const formComplete = useMemo(() => {
    if (!name.trim() || canonicalPhone === null) return false;
    if (isEditMode) {
      const pwEmpty = password.length === 0 && confirmPassword.length === 0;
      if (pwEmpty) return true;
      return password.length >= 6 && password === confirmPassword;
    }
    return password.length >= 6 && password === confirmPassword;
  }, [name, canonicalPhone, password, confirmPassword, isEditMode]);

  const handleSubmit = async () => {
    if (!validateForm() || !canonicalPhone) return;
    setIsLoading(true);
    try {
      if (isEditMode && editingUser?.id) {
        const payload: { name: string; phone: string; password?: string } = {
          name: name.trim(),
          phone: canonicalPhone,
        };
        if (password.trim().length > 0) {
          payload.password = password.trim();
        }
        const updated = await usersApi.updateUser(editingUser.id, payload);
        if (updated) {
          handleClose();
          onSuccess();
        } else {
          Alert.alert(t('error.generic', 'Error'), t('settings.admin.updateEmployeeFailed', 'Failed to update employee'));
        }
        return;
      }

      const result = await usersApi.createUserWithPassword(
        {
          name: name.trim(),
          phone: canonicalPhone,
          user_type: 'admin',
          business_id: '',
        },
        password
      );
      if (result.ok) {
        handleClose();
        onSuccess();
      } else {
        const dup =
          result.code === '23505' || /duplicate|unique constraint/i.test(String(result.error || ''));
        Alert.alert(
          t('error.generic', 'Error'),
          dup ? t('settings.admin.createExists', 'Phone may already exist') : t('settings.admin.createFailed', 'Error creating user')
        );
      }
    } catch (error) {
      console.error('Error saving admin user:', error);
      Alert.alert(
        t('error.generic', 'Error'),
        isEditMode ? t('settings.admin.updateEmployeeFailed', 'Failed to update employee') : t('settings.admin.createFailed', 'Error creating user')
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} accessible={false} />
        </Animated.View>

        <Animated.View style={[styles.sheetOuter, sheetAnimatedStyle]}>
            <LinearGradient
              colors={[...loginGradient]}
              style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}
            />

            <View style={styles.handleArea} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
            </View>

            <KeyboardAwareScreenScroll
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              bounces={false}
              enableOnAndroid
              extraScrollHeight={22}
              extraHeight={8}
              enableAutomaticScroll
              enableResetScrollToCoords={false}
              contentContainerStyle={[
                styles.sheetContent,
                { direction: isRtl ? 'rtl' : 'ltr', paddingBottom: bottomPad + 8 },
              ]}
            >
              <Text style={[styles.heroTitle, { color: heroText }]}>
                {isEditMode
                  ? t('settings.admin.editEmployee', 'עריכת עובד')
                  : t('settings.admin.addEmployee', 'הוספת עובד')}
              </Text>
              <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                {isEditMode
                  ? t('settings.admin.editEmployeeSubtitle', 'עדכון שם, טלפון או סיסמה.')
                  : t('settings.admin.addEmployeeSubtitle', 'הוספת עובד נוסף למערכת.')}
              </Text>

              <View
                style={[
                  styles.phoneOpenRow,
                  styles.profileNameRow,
                  { flexDirection: 'row' },
                  {
                    borderBottomColor: nameFocused ? phoneBorderFocus : phoneBorderUnfocus,
                    borderBottomWidth: nameFocused ? 2.5 : 1.5,
                  },
                ]}
              >
                <View style={styles.phoneOpenIconSlot} accessible={false}>
                  <User size={18} color={nameFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                </View>
                <TextInput
                  style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText }]}
                  placeholder={t('register.profile.namePlaceholder', 'שם מלא')}
                  placeholderTextColor={heroFaint}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  returnKeyType="next"
                  accessibilityLabel={t('settings.admin.fullNameLabel', 'שם מלא')}
                />
              </View>

              <View
                style={[
                  styles.phoneOpenRow,
                  { flexDirection: 'row', marginTop: 12 },
                  {
                    borderBottomColor: phoneFocused ? phoneBorderFocus : phoneBorderUnfocus,
                    borderBottomWidth: phoneFocused ? 2.5 : 1.5,
                  },
                ]}
              >
                <View style={styles.phoneOpenIconSlot} accessible={false}>
                  <Phone size={18} color={phoneFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.5} />
                </View>
                <TextInput
                  style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText, writingDirection: 'ltr' }]}
                  placeholder={t('settings.admin.phonePlaceholder', '050-1234567')}
                  placeholderTextColor={heroFaint}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  returnKeyType="done"
                  enterKeyHint="done"
                  inputAccessoryViewID={Platform.OS === 'ios' ? IOS_HIDDEN_KEYBOARD_ACCESSORY : undefined}
                />
              </View>
              {phone.trim().length > 0 && !canonicalPhone ? (
                <Text style={[styles.errorOnHero, styles.errorOnHeroPhoneInvalid, { textAlign: inputAlign }]}>
                  {t('settings.admin.phoneInvalid', 'מספר טלפון לא תקין')}
                </Text>
              ) : null}

              <View
                style={[
                  styles.phoneOpenRow,
                  { flexDirection: 'row', marginTop: 12 },
                  {
                    borderBottomColor: passwordFocused ? phoneBorderFocus : phoneBorderUnfocus,
                    borderBottomWidth: passwordFocused ? 2.5 : 1.5,
                  },
                ]}
              >
                <View style={styles.phoneOpenIconSlot} accessible={false}>
                  <Lock size={18} color={passwordFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                </View>
                <TextInput
                  style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText }]}
                  placeholder={
                    isEditMode
                      ? t('settings.admin.passwordPlaceholderOptional', 'סיסמה חדשה (אופציונלי)')
                      : t('settings.admin.passwordPlaceholder', 'סיסמה')
                  }
                  placeholderTextColor={heroFaint}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  returnKeyType="next"
                  autoComplete="off"
                  textContentType="password"
                />
              </View>
              <Text style={[styles.softHint, { color: heroMuted }]}>
                {isEditMode
                  ? t('settings.admin.editEmployeePasswordHint', 'השאר ריק לשמירת הסיסמה הקיימת.')
                  : t('settings.admin.passwordHint', 'לפחות 6 תווים')}
              </Text>

              <View
                style={[
                  styles.phoneOpenRow,
                  { flexDirection: 'row', marginTop: 8 },
                  {
                    borderBottomColor: confirmFocused ? phoneBorderFocus : phoneBorderUnfocus,
                    borderBottomWidth: confirmFocused ? 2.5 : 1.5,
                  },
                ]}
              >
                <View style={styles.phoneOpenIconSlot} accessible={false}>
                  <Lock size={18} color={confirmFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                </View>
                <TextInput
                  style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText }]}
                  placeholder={
                    isEditMode
                      ? t('settings.admin.confirmPasswordPlaceholderOptional', 'אימות סיסמה חדשה')
                      : t('settings.admin.confirmPasswordPlaceholder', 'אימות סיסמה')
                  }
                  placeholderTextColor={heroFaint}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  onFocus={() => setConfirmFocused(true)}
                  onBlur={() => setConfirmFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                  autoComplete="off"
                  textContentType="password"
                />
              </View>
              {confirmPassword.length > 0 && password !== confirmPassword ? (
                <Text style={[styles.errorOnHero, { color: businessColors.error, textAlign: inputAlign }]}>
                  {t('settings.admin.passwordsMismatch', 'הסיסמאות אינן תואמות')}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={() => void handleSubmit()}
                disabled={!formComplete || isLoading}
                activeOpacity={0.85}
                style={styles.btnWrap}
              >
                <View
                  style={[
                    styles.btnOuter,
                    (!formComplete || isLoading) && styles.btnOuterDisabled,
                    {
                      backgroundColor: ctaElevatedBg,
                      borderWidth: useLightFg ? 1 : StyleSheet.hairlineWidth * 2,
                      borderColor: ctaElevatedBorder,
                    },
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={ctaElevatedLabel} size="small" />
                  ) : (
                    <Text style={[styles.btnText, { color: ctaElevatedLabel }]}>
                      {isEditMode
                        ? t('settings.admin.saveEmployeeChanges', 'שמירת שינויים')
                        : t('settings.admin.addEmployeeCta', 'הוספת עובד')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              <Text style={[styles.footerNote, { color: heroMuted }]}>
                {isEditMode
                  ? t('settings.admin.editEmployeePasswordHint', 'השאר את שדות הסיסמה ריקים כדי לשמור על הסיסמה הקיימת.')
                  : t('settings.admin.reviewPasswordNote', 'הסיסמה נשמרת בצורה מאובטחת.')}
              </Text>
            </KeyboardAwareScreenScroll>
          </Animated.View>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={IOS_HIDDEN_KEYBOARD_ACCESSORY}>
            <View style={styles.iosKeyboardAccEmpty} />
          </InputAccessoryView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosKeyboardAccEmpty: {
    height: 0,
    width: '100%',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetScroll: {
    minHeight: SHEET_SCROLL_MIN_HEIGHT,
    maxHeight: SH * 0.88,
    width: '100%',
  },
  sheetOuter: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  sheetContent: {
    paddingHorizontal: 26,
    paddingTop: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 28,
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    paddingHorizontal: 4,
    fontWeight: '600',
  },
  phoneOpenRow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 1,
    minHeight: 48,
    gap: 6,
  },
  profileNameRow: {
    marginTop: 0,
  },
  phoneOpenIconSlot: {
    paddingBottom: 1,
    opacity: 0.95,
  },
  phoneOpenInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: 0,
    margin: 0,
  },
  softHint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  errorOnHero: {
    fontSize: 13,
    marginTop: 8,
    width: '100%',
  },
  errorOnHeroPhoneInvalid: {
    color: '#fecaca',
    fontWeight: '600',
  },
  btnWrap: {
    marginTop: 22,
    marginBottom: 4,
  },
  btnOuter: {
    minHeight: 52,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  btnOuterDisabled: {
    opacity: 0.46,
  },
  btnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerNote: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
});
