import React, { useMemo, useState } from 'react';
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
  Dimensions,
  I18nManager,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { X, User, Phone, Lock } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { usersApi } from '@/lib/api/users';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { parseIsraeliMobileNational10 } from '@/lib/login/israeliMobilePhone';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

const { height: SH } = Dimensions.get('window');

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

interface AddAdminModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddAdminModal({ visible, onClose, onSuccess }: AddAdminModalProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const activeLang = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isRtl = I18nManager.isRTL || activeLang.startsWith('he');

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
  /** Brighter copy on gradient so subtitles, hints, and placeholders read clearly */
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.72)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.45)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.22)';
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  const btnScale = useSharedValue(1);
  const btnScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const canonicalPhone = useMemo(() => parseIsraeliMobileNational10(phone), [phone]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setNameFocused(false);
    setPhoneFocused(false);
    setPasswordFocused(false);
    setConfirmFocused(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

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
    return (
      name.trim().length > 0 &&
      canonicalPhone !== null &&
      password.length >= 6 &&
      password === confirmPassword
    );
  }, [name, canonicalPhone, password, confirmPassword]);

  const handleSubmit = async () => {
    if (!validateForm() || !canonicalPhone) return;

    setIsLoading(true);
    try {
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
      console.error('Error creating admin user:', error);
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.createFailed', 'Error creating user'));
    } finally {
      setIsLoading(false);
    }
  };

  const inputAlign = isRtl ? 'right' : 'left';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: gradientEnd }]}>
        <LinearGradient colors={[...loginGradient]} style={StyleSheet.absoluteFill} />
        {Platform.OS !== 'web' ? (
          <BrandLavaLampBackground
            primaryColor={primary}
            baseColor={gradientEnd}
            count={4}
            duration={16000}
            blurIntensity={48}
          />
        ) : null}
        <StatusBar style={useLightFg ? 'light' : 'dark'} />

        <TouchableOpacity
          style={[
            styles.closeBtn,
            {
              top: insets.top + 8,
              ...(isRtl ? { right: 16 } : { left: 16 }),
              borderColor: useLightFg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)',
              backgroundColor: useLightFg ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)',
            },
          ]}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('close', 'Close')}
        >
          <X size={22} color={heroText} strokeWidth={2.2} />
        </TouchableOpacity>

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAwareScreenScroll
            style={[styles.keyboardAvoid, { backgroundColor: 'transparent' }]}
            contentContainerStyle={[
              styles.scrollContainer,
              {
                backgroundColor: 'transparent',
                paddingVertical: 16,
                paddingBottom: bottomPad + 24,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            bounces={false}
          >
            <View style={[styles.rtlRoot, { direction: isRtl ? 'rtl' : 'ltr' }]}>
              <Pressable
                accessible={false}
                style={[styles.dismissKeyboardArea, { minHeight: Math.max(SH - insets.top - insets.bottom, 420) }]}
                onPress={Keyboard.dismiss}
              >
                <View style={[styles.formZone, { paddingBottom: bottomPad }]}>
                  <LoginEntranceSection delayMs={0} style={styles.stepBody}>
                    <Text style={[styles.heroTitle, { color: heroText }]}>{t('settings.admin.addEmployee', 'Add employee')}</Text>
                    <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                      {t('settings.admin.addEmployeeSubtitle', 'Add another employee to the system')}
                    </Text>
                    <Text style={[styles.heroHintLine, { color: heroMuted }]}>
                      {t('settings.admin.addEmployeeFormHint', 'They will sign in with the phone number and password you set.')}
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
                        placeholder={t('register.profile.namePlaceholder', 'Full name')}
                        placeholderTextColor={heroFaint}
                        value={name}
                        onChangeText={setName}
                        autoCorrect={false}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => setNameFocused(false)}
                        returnKeyType="next"
                        accessibilityLabel={t('settings.admin.fullNameLabel', 'Full name')}
                      />
                    </View>

                    <View
                      style={[
                        styles.phoneOpenRow,
                        { flexDirection: 'row', marginTop: 14 },
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
                        returnKeyType="next"
                      />
                    </View>
                    {phone.trim().length > 0 && !canonicalPhone ? (
                      <Text style={[styles.errorOnHero, styles.errorOnHeroPhoneInvalid, { textAlign: inputAlign }]}>
                        {t('settings.admin.phoneInvalid', 'Invalid phone number')}
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.phoneOpenRow,
                        { flexDirection: 'row', marginTop: 14 },
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
                        placeholder={t('settings.admin.passwordPlaceholder', 'Password')}
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
                    <Text style={[styles.softHint, { color: heroMuted }]}>{t('settings.admin.passwordHint', 'At least 6 characters')}</Text>

                    <View
                      style={[
                        styles.phoneOpenRow,
                        { flexDirection: 'row', marginTop: 6 },
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
                        placeholder={t('settings.admin.confirmPasswordPlaceholder', 'Confirm password')}
                        placeholderTextColor={heroFaint}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        onFocus={() => setConfirmFocused(true)}
                        onBlur={() => setConfirmFocused(false)}
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit}
                        autoComplete="off"
                        textContentType="password"
                      />
                    </View>
                    {confirmPassword.length > 0 && password !== confirmPassword ? (
                      <Text style={[styles.errorOnHero, { color: businessColors.error, textAlign: inputAlign }]}>
                        {t('settings.admin.passwordsMismatch', 'Passwords do not match')}
                      </Text>
                    ) : null}
                  </LoginEntranceSection>

                  <LoginEntranceSection delayMs={420} style={[styles.btnWrap, styles.profileBtnWrap]}>
                    <Animated.View style={btnScaleStyle}>
                      <TouchableOpacity
                        onPressIn={() => {
                          btnScale.value = withTiming(0.97, { duration: 90 });
                        }}
                        onPressOut={() => {
                          btnScale.value = withSpring(1, { damping: 16, stiffness: 280 });
                        }}
                        onPress={handleSubmit}
                        disabled={!formComplete || isLoading}
                        activeOpacity={1}
                        accessibilityRole="button"
                      >
                        <View
                          style={[
                            styles.btnOuter,
                            useLightFg ? styles.btnOuterElevated : null,
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
                              {t('settings.admin.addEmployeeCta', 'Add employee')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  </LoginEntranceSection>

                  <LoginEntranceSection delayMs={560} style={styles.linksWrap}>
                    <Text style={[styles.footerNote, { color: heroMuted }]}>
                      {t('settings.admin.reviewPasswordNote', 'Password is stored securely.')}
                    </Text>
                  </LoginEntranceSection>
                </View>
              </Pressable>
            </View>
          </KeyboardAwareScreenScroll>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 40,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keyboardAvoid: { flex: 1 },
  scrollContainer: { flexGrow: 1 },
  rtlRoot: { flex: 1 },
  dismissKeyboardArea: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  formZone: {
    backgroundColor: 'transparent',
    paddingHorizontal: 26,
    width: '100%',
  },
  stepBody: {
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontWeight: '700',
  },
  heroHintLine: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 6,
    fontWeight: '700',
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
    marginTop: 6,
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
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '700',
  },
  errorOnHero: {
    fontSize: 13,
    marginTop: 8,
    width: '100%',
  },
  /** Softer on dark purple gradient than `businessColors.error` */
  errorOnHeroPhoneInvalid: {
    color: '#fecaca',
    fontWeight: '600',
  },
  btnWrap: {
    marginTop: 10,
  },
  profileBtnWrap: {
    marginTop: 36,
  },
  btnOuter: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  btnOuterElevated: {
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  btnOuterDisabled: {
    opacity: 0.46,
  },
  btnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  linksWrap: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 8,
  },
  footerNote: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '600',
  },
});
