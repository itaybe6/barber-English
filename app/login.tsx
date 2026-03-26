import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  Dimensions,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { Phone, Lock, Mail, Eye, EyeOff } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/authStore';
import { usersApi } from '@/lib/api/users';
import { supabase, getBusinessId } from '@/lib/supabase';
import { findUserByCredentials, isValidUserType, UserType } from '@/constants/auth';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { superAdminApi } from '@/lib/api/superAdmin';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  MAX_LOGIN_FAILURES,
  normalizePhoneKey,
  readLoginFailures,
  writeLoginFailures,
} from '@/lib/login/loginPhoneFailure';
import { otpErrorMessage } from '@/lib/login/otpErrorMessage';

const { width: SW, height: SH } = Dimensions.get('window');

/** Title row under status bar (primary-colored app header) */
const LOGIN_HEADER_CONTENT_H = 52;

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r + g + b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

function shiftHex(hex: string, delta: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp(parseInt(h.slice(0, 2), 16) + delta);
  const g = clamp(parseInt(h.slice(2, 4), 16) + delta);
  const b = clamp(parseInt(h.slice(4, 6), 16) + delta);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [loginFailureCount, setLoginFailureCount] = useState(0);

  const login = useAuthStore((state) => state.login);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('he') ?? true;

  const primary = businessColors.primary;
  const onPrimary = readableOnHex(primary);

  const phoneKey = normalizePhoneKey(phone);
  const isLoginLocked = phoneKey.length > 0 && loginFailureCount >= MAX_LOGIN_FAILURES;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = normalizePhoneKey(phone);
      if (!key) {
        if (!cancelled) setLoginFailureCount(0);
        return;
      }
      const n = await readLoginFailures(key);
      if (!cancelled) setLoginFailureCount(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [phone]);

  // ── Form panel entrance (slide-up + fade, runs once on mount) ──
  const formSlide = useSharedValue(30);
  const formAlpha = useSharedValue(0);

  useEffect(() => {
    formSlide.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.quad) });
    formAlpha.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) });
  }, []);

  const formEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: formSlide.value }],
    opacity: formAlpha.value,
  }));

  // ── Button press ──
  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // ── Login handler ──
  const reportFailedLogin = async (key: string, kind: 'password' | 'otp' = 'password') => {
    const next = (await readLoginFailures(key)) + 1;
    await writeLoginFailures(key, next);
    setLoginFailureCount(next);
    if (next >= MAX_LOGIN_FAILURES) {
      Alert.alert(
        t('login.tooManyAttemptsTitle', 'התחברות נחסמה'),
        t('login.tooManyAttemptsMessage', 'בוצעו יותר מדי ניסיונות התחברות שגויים למספר זה. לא ניתן להתחבר כעת.')
      );
    } else {
      const remaining = MAX_LOGIN_FAILURES - next;
      const msg =
        kind === 'otp'
          ? t('login.incorrectOtpWithRemaining', 'קוד שגוי. נותרו {{count}} ניסיונות.', { count: remaining })
          : t('login.incorrectCredentialsWithRemaining', 'טלפון או סיסמה שגויים. נותרו {{count}} ניסיונות.', { count: remaining });
      Alert.alert(t('error.generic', 'שגיאה'), msg);
    }
  };

  const handleSendLoginOtp = async () => {
    if (!phone.trim()) {
      Alert.alert(t('error.generic', 'שגיאה'), t('login.fillPhone', 'יש להזין מספר טלפון'));
      return;
    }
    const key = normalizePhoneKey(phone);
    const existingFailures = await readLoginFailures(key);
    if (existingFailures >= MAX_LOGIN_FAILURES) {
      setLoginFailureCount(existingFailures);
      Alert.alert(
        t('login.tooManyAttemptsTitle', 'התחברות נחסמה'),
        t('login.tooManyAttemptsMessage', 'בוצעו יותר מדי ניסיונות התחברות שגויים למספר זה. לא ניתן להתחבר כעת.')
      );
      return;
    }
    setIsLoading(true);
    try {
      const res = await authPhoneOtpApi.sendLoginOtp(phone.trim());
      if (!res.ok) {
        Alert.alert(t('error.generic', 'שגיאה'), otpErrorMessage(t, res.error));
        return;
      }
      router.push({
        pathname: '/login-otp',
        params: { phone: phone.trim() },
      } as unknown as Parameters<typeof router.push>[0]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!usePasswordLogin) {
      await handleSendLoginOtp();
      return;
    }
    if (!phone.trim() || !password.trim()) {
      Alert.alert(t('error.generic', 'שגיאה'), t('login.fillAll', 'יש למלא את כל השדות'));
      return;
    }
    const key = normalizePhoneKey(phone);
    const existingFailures = await readLoginFailures(key);
    if (existingFailures >= MAX_LOGIN_FAILURES) {
      setLoginFailureCount(existingFailures);
      Alert.alert(
        t('login.tooManyAttemptsTitle', 'התחברות נחסמה'),
        t('login.tooManyAttemptsMessage', 'בוצעו יותר מדי ניסיונות התחברות שגויים למספר זה. לא ניתן להתחבר כעת.')
      );
      return;
    }
    setIsLoading(true);
    try {
      if (superAdminApi.verifySuperAdmin(phone.trim(), password)) {
        await writeLoginFailures(key, 0);
        const superUser = {
          id: 'super-admin', phone: phone.trim(),
          type: UserType.SUPER_ADMIN, name: 'Super Admin', user_type: 'super_admin',
        } as any;
        login(superUser);
        router.replace('/(super-admin)' as any);
        return;
      }
      const authUser = await usersApi.authenticateUserByPhone(phone.trim(), password);
      if (authUser) {
        if ((authUser as any)?.block) {
          await writeLoginFailures(key, 0);
          Alert.alert(t('account.blocked', 'חשבון חסום'), t('login.blockedCannotSignIn', 'החשבון שלך חסום. פנה למנהל.'));
          return;
        }
        if (!isValidUserType(authUser.user_type)) {
          await writeLoginFailures(key, 0);
          Alert.alert(t('error.generic', 'שגיאה'), t('login.invalidUserType', 'סוג משתמש לא תקין'));
          return;
        }
        await writeLoginFailures(key, 0);
        const appUser = {
          id: authUser.id, phone: authUser.phone,
          type: authUser.user_type, name: authUser.name,
          email: authUser.email ?? null, image_url: authUser.image_url ?? null,
          user_type: authUser.user_type, block: (authUser as any)?.block ?? false,
          client_approved: (authUser as any).client_approved !== false,
        } as any;
        login(appUser);
        router.replace(appUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
      } else {
        const businessId = getBusinessId();
        const { data: other } = await supabase.from('users').select('*')
          .eq('phone', phone.trim()).neq('business_id', businessId).single();
        if (other) {
          await reportFailedLogin(key);
          return;
        }
        const demoUser = findUserByCredentials(phone.trim(), password);
        if (demoUser) {
          await writeLoginFailures(key, 0);
          login(demoUser);
          router.replace(demoUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
        } else {
          await reportFailedLogin(key);
        }
      }
    } catch {
      const demoUser = findUserByCredentials(phone.trim(), password);
      if (demoUser) {
        await writeLoginFailures(key, 0);
        login(demoUser);
        router.replace(demoUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
      } else {
        await reportFailedLogin(key);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot password handler ──
  const handleForgotSubmit = async () => {
    const e = (forgotEmail || '').trim();
    if (!e) { Alert.alert(t('error.generic', 'שגיאה'), t('login.enterEmail', 'יש להזין כתובת מייל')); return; }
    setIsSendingReset(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke('reset-password', { body: { email: e } });
      if (fnErr) {
        const { error: rpErr } = await supabase.auth.resetPasswordForEmail(e);
        if (rpErr) {
          Alert.alert(t('error.generic', 'שגיאה'), String((rpErr as any)?.message || t('common.tryAgain', 'נסה שוב')));
          return;
        }
      }
      Alert.alert(t('login.emailSent.title', 'מייל נשלח'), t('login.emailSent.message', 'בדוק את תיבת הדואר שלך'), [
        { text: t('ok', 'אישור'), onPress: () => setIsForgotOpen(false) },
      ]);
    } catch {
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'אירעה שגיאה, נסה שוב'));
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style={onPrimary === '#FFFFFF' ? 'light' : 'dark'} />

      <View
        style={[styles.screenHeader, { backgroundColor: primary, paddingTop: insets.top }]}
        accessibilityRole="header"
      >
        <View style={styles.screenHeaderInner}>
          <Text
            style={[styles.screenHeaderTitle, { color: onPrimary }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {t('login.screenHeader', 'התחברות')}
          </Text>
        </View>
      </View>

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAwareScreenScroll
          style={styles.keyboardAvoid}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          removeClippedSubviews={false}
        >
          <Pressable
            accessible={false}
            style={[
              styles.dismissKeyboardArea,
              { minHeight: SH - insets.top - LOGIN_HEADER_CONTENT_H },
            ]}
            onPress={Keyboard.dismiss}
          >
            {/* ── FORM ZONE ── */}
            <Animated.View
              style={[styles.formZone, formEntranceStyle, { paddingBottom: bottomPad + 28 }]}
              collapsable={false}
            >
              {/* Title */}
              <View style={styles.header}>
                <Text style={[styles.titleText, { color: businessColors.text }]}>
                  {t('login.form.title', 'נתראה בפנים')}
                </Text>
                <Text
                  style={[
                    styles.subtitleText,
                    { color: businessColors.textSecondary },
                    { textAlign: isRtl ? 'right' : 'left' },
                  ]}
                >
                  {usePasswordLogin
                    ? t('login.form.subtitle', 'הכנס את הפרטים שלך כדי להמשיך')
                    : t('login.otp.subtitlePhone', 'הזן מספר טלפון — נשלח אליך קוד ב-SMS')}
                </Text>
              </View>

              {/* Phone field — label forced to visual right (RTL strip) */}
              <View style={styles.fieldWrap} collapsable={false}>
                <View
                  style={[
                    styles.fieldLabelPhoneWrap,
                    isRtl
                      ? styles.fieldLabelPhoneWrapRtl
                      : styles.fieldLabelPhoneWrapLtr,
                  ]}
                >
                  <Text
                    style={[
                      styles.fieldLabel,
                      styles.fieldLabelPhoneText,
                      { color: businessColors.textSecondary },
                    ]}
                  >
                    {t('login.field.phone', 'טלפון')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.inputRow,
                    { flexDirection: isRtl ? 'row-reverse' : 'row' },
                    {
                      borderColor: phoneFocused ? primary : 'rgba(0,0,0,0.1)',
                      backgroundColor: phoneFocused ? hexToRgba(primary, 0.03) : '#F7F7F7',
                    },
                  ]}
                >
                  <View accessible={false}>
                    <Phone
                      size={19}
                      color={phoneFocused ? primary : '#ABABAB'}
                      strokeWidth={1.7}
                    />
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                    ]}
                    placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                    placeholderTextColor="#C0C0C0"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    textContentType="telephoneNumber"
                    showSoftInputOnFocus
                    editable={!isLoginLocked}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                </View>
              </View>

              {/* Password field */}
              {usePasswordLogin ? (
                <View style={styles.fieldWrap} collapsable={false}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                    ]}
                  >
                    {t('login.field.password', 'סיסמה')}
                  </Text>
                  <View
                    style={[
                      styles.inputRow,
                      { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      {
                        borderColor: passFocused ? primary : 'rgba(0,0,0,0.1)',
                        backgroundColor: passFocused ? hexToRgba(primary, 0.03) : '#F7F7F7',
                      },
                    ]}
                  >
                    <View accessible={false}>
                      <Lock size={19} color={passFocused ? primary : '#ABABAB'} strokeWidth={1.7} />
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                      ]}
                      placeholder={t('login.passwordPlaceholder', 'סיסמה')}
                      placeholderTextColor="#C0C0C0"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textContentType="password"
                      showSoftInputOnFocus
                      editable={!isLoginLocked}
                      onFocus={() => setPassFocused(true)}
                      onBlur={() => setPassFocused(false)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.eyeBtn}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword
                          ? t('login.a11y.hidePassword', 'הסתר סיסמה')
                          : t('login.a11y.showPassword', 'הצג סיסמה')
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={19} color={passFocused ? primary : '#ABABAB'} strokeWidth={1.7} />
                      ) : (
                        <Eye size={19} color={passFocused ? primary : '#ABABAB'} strokeWidth={1.7} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {isLoginLocked ? (
                <Text
                  style={[
                    styles.lockBanner,
                    { color: businessColors.warning, textAlign: isRtl ? 'right' : 'left' },
                  ]}
                >
                  {t('login.lockedHint', 'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.')}
                </Text>
              ) : null}

              {/* CTA button */}
              <Animated.View style={[btnAnimStyle, styles.btnWrap]}>
                <TouchableOpacity
                  onPressIn={() => { btnScale.value = withTiming(0.97, { duration: 90 }); }}
                  onPressOut={() => { btnScale.value = withSpring(1, { damping: 16, stiffness: 280 }); }}
                  onPress={handleLogin}
                  disabled={isLoading || isLoginLocked}
                  activeOpacity={1}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLoading || isLoginLocked }}
                >
                  <View style={[styles.btnOuter, (isLoading || isLoginLocked) && styles.btnOuterDisabled]}>
                    <LinearGradient
                      colors={[shiftHex(primary, 16), primary, shiftHex(primary, -20)]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.btn}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.btnText}>
                          {isLoginLocked
                            ? t('login.cta.locked', 'התחברות חסומה')
                            : usePasswordLogin
                              ? t('login.cta.signIn', 'כניסה')
                              : t('login.cta.sendOtp', 'שלח קוד ב-SMS')}
                        </Text>
                      )}
                    </LinearGradient>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Links */}
              <View style={styles.linksWrap}>
                <TouchableOpacity
                  onPress={() => setUsePasswordLogin((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10 }}
                >
                  <Text style={[styles.linkMuted, { color: businessColors.textSecondary, textAlign: 'center' }]}>
                    {usePasswordLogin
                      ? t('login.switchToOtp', 'התחברות עם קוד SMS')
                      : t('login.switchToPassword', 'כניסת מנהל / סיסמה')}
                  </Text>
                </TouchableOpacity>

                {usePasswordLogin ? (
                  <TouchableOpacity onPress={() => setIsForgotOpen(true)} hitSlop={{ top: 10, bottom: 10 }}>
                    <Text style={[styles.linkMuted, { color: businessColors.textSecondary, textAlign: 'center' }]}>
                      {t('login.forgotPassword', 'שכחת סיסמה?')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                </View>

                <View style={[styles.registerRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.registerText, { color: businessColors.textSecondary }]}>
                    {t('login.noAccount', 'אין לך חשבון?')}
                  </Text>
                  <Link href="/register" asChild>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={[styles.registerAction, { color: primary }]}>
                        {t('login.signUpNow', 'הרשם עכשיו')}
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </Animated.View>
          </Pressable>
        </KeyboardAwareScreenScroll>
      </SafeAreaView>

      {/* ── Forgot Password Modal ────────────────────────────────────────── */}
      {isForgotOpen && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            {/* Colored top stripe */}
            <LinearGradient
              colors={[shiftHex(primary, 40), primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalStripe}
            />

            <KeyboardAwareScreenScroll
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalBody}
            >
              <Text style={[styles.modalTitle, { color: businessColors.text }]}>
                {t('login.reset.title', 'איפוס סיסמה')}
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                ]}
              >
                {t('login.reset.subtitle', 'הכנס טלפון ומייל כפי שמופיעים בחשבון שלך')}
              </Text>

              <Text
                style={[
                  styles.modalFieldLabel,
                  { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                ]}
              >
                {t('login.field.phone', 'טלפון')}
              </Text>
              <View
                style={[
                  styles.modalInputRow,
                  { marginBottom: 14, flexDirection: isRtl ? 'row-reverse' : 'row' },
                ]}
              >
                <Phone size={18} color={businessColors.textSecondary} strokeWidth={1.65} />
                <TextInput
                  style={[
                    styles.modalInput,
                    { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                  ]}
                  placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                  placeholderTextColor={hexToRgba(businessColors.textSecondary, 0.55)}
                  value={forgotPhone}
                  onChangeText={setForgotPhone}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>

              <Text
                style={[
                  styles.modalFieldLabel,
                  { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                ]}
              >
                {t('login.reset.emailLabel', 'מייל')}
              </Text>
              <View
                style={[styles.modalInputRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
              >
                <Mail size={18} color={businessColors.textSecondary} strokeWidth={1.65} />
                <TextInput
                  style={[
                    styles.modalInput,
                    { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                  ]}
                  placeholder={t('profile.edit.emailPlaceholder', 'כתובת מייל')}
                  placeholderTextColor={hexToRgba(businessColors.textSecondary, 0.55)}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
              </View>

              <View
                style={[
                  styles.modalActions,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' },
                ]}
              >
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn, { borderColor: hexToRgba(businessColors.border, 0.35) }]}
                  onPress={() => setIsForgotOpen(false)}
                  disabled={isSendingReset}
                >
                  <Text style={[styles.cancelBtnText, { color: businessColors.textSecondary }]}>
                    {t('cancel', 'ביטול')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { overflow: 'hidden' }]}
                  onPress={handleForgotSubmit}
                  disabled={isSendingReset}
                >
                  <LinearGradient
                    colors={[shiftHex(primary, 14), primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {isSendingReset ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>{t('confirm', 'אישור')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScreenScroll>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Root & scaffold ──
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screenHeader: {},
  screenHeaderInner: {
    minHeight: LOGIN_HEADER_CONTENT_H,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  screenHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  dismissKeyboardArea: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
  },

  // ── FORM ZONE ──
  formZone: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 26,
    paddingTop: 24,
    minHeight: SH * 0.6,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },

  // ── Fields ──
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  fieldLabelPhoneWrap: {
    width: '100%',
    marginBottom: 8,
  },
  fieldLabelPhoneWrapRtl: {
    direction: 'rtl',
    alignItems: 'flex-start',
  },
  fieldLabelPhoneWrapLtr: {
    direction: 'ltr',
    alignItems: 'flex-end',
  },
  fieldLabelPhoneText: {
    marginBottom: 0,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 2,
    borderWidth: 1,
    gap: 11,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  lockBanner: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── CTA Button ──
  btnWrap: {
    marginTop: 10,
  },
  btnOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnOuterDisabled: {
    opacity: 0.46,
  },
  btn: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Links ──
  linksWrap: {
    alignItems: 'center',
    marginTop: 20,
    gap: 12,
  },
  linkMuted: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  dividerRow: {
    width: '44%',
    alignItems: 'center',
    marginVertical: 2,
  },
  divider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5E5',
  },
  registerRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
    rowGap: 4,
  },
  registerText: {
    fontSize: 14,
  },
  registerAction: {
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Forgot Password Modal ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 9, 7, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  modalStripe: {
    height: 4,
    width: '100%',
  },
  modalBody: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    backgroundColor: '#F7F7F7',
    gap: 10,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F4F4F4',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
