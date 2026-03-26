import React, { useState, useEffect, useMemo } from 'react';
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
  Easing,
  runOnJS,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

const { width: SW, height: SH } = Dimensions.get('window');

/** Toast motion (Y = off-screen above). Kept name stable for Reanimated worklets / Metro cache. */
const PHONE_NOT_REGISTERED_TOAST_HIDE_Y = -140;
const PHONE_NOT_REGISTERED_TOAST_VISIBLE_MS = 3000;

type LoginSmsToastKind = 'phone_required' | 'phone_not_registered';

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

/** Same idea as admin pick-primary-color: full-screen brand gradient. */
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
  /** Top toast for SMS login (empty phone / not registered). */
  const [loginSmsToast, setLoginSmsToast] = useState<LoginSmsToastKind | null>(null);

  const login = useAuthStore((state) => state.login);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('he') ?? true;

  const primary = businessColors.primary;

  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.62)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.28)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.22)';
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const ctaGlassBg = useLightFg ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.1)';
  const ctaGlassBorder = useLightFg ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.18)';
  const ctaTextCol = useLightFg ? '#FFFFFF' : '#111111';
  /** Solid light CTA on dark gradients — avoids “muddy” translucent orange. */
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : ctaGlassBg;
  const ctaElevatedLabel = useLightFg ? '#141414' : ctaTextCol;
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : ctaGlassBorder;

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

  // ── Button press ──
  const btnScale = useSharedValue(1);
  const btnScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const loginSmsToastY = useSharedValue(PHONE_NOT_REGISTERED_TOAST_HIDE_Y);
  const loginSmsToastOpacity = useSharedValue(0);
  const loginSmsToastStyle = useAnimatedStyle(() => ({
    opacity: loginSmsToastOpacity.value,
    transform: [{ translateY: loginSmsToastY.value }],
  }));

  useEffect(() => {
    if (!loginSmsToast) {
      loginSmsToastOpacity.value = withTiming(0, { duration: 180 });
      loginSmsToastY.value = withTiming(PHONE_NOT_REGISTERED_TOAST_HIDE_Y, {
        duration: 260,
        easing: Easing.in(Easing.cubic),
      });
      return;
    }
    loginSmsToastY.value = PHONE_NOT_REGISTERED_TOAST_HIDE_Y;
    loginSmsToastOpacity.value = 0;
    loginSmsToastY.value = withSpring(0, {
      damping: 19,
      stiffness: 280,
      mass: 0.85,
    });
    loginSmsToastOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    const id = setTimeout(() => {
      loginSmsToastOpacity.value = withTiming(0, {
        duration: 220,
        easing: Easing.in(Easing.quad),
      });
      loginSmsToastY.value = withTiming(
        PHONE_NOT_REGISTERED_TOAST_HIDE_Y,
        { duration: 300, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setLoginSmsToast)(null);
        },
      );
    }, PHONE_NOT_REGISTERED_TOAST_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [loginSmsToast, loginSmsToastY, loginSmsToastOpacity]);

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
      setLoginSmsToast('phone_required');
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
    const registered = await usersApi.hasUserWithPhoneForBusiness(phone.trim());
    if (registered === false) {
      setLoginSmsToast('phone_not_registered');
      return;
    }
    setIsLoading(true);
    try {
      const res = await authPhoneOtpApi.sendLoginOtp(phone.trim());
      if (!res.ok) {
        if (res.error === 'phone_not_registered') {
          setLoginSmsToast('phone_not_registered');
        } else {
          setLoginSmsToast(null);
          Alert.alert(t('error.generic', 'שגיאה'), otpErrorMessage(t, res.error));
        }
        return;
      }
      setLoginSmsToast(null);
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

      {loginSmsToast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.phoneNotRegisteredToastWrap,
            { paddingTop: insets.top + 10 },
            loginSmsToastStyle,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.phoneNotRegisteredToastPill}>
            <View style={styles.phoneNotRegisteredToastRow}>
              <View
                style={[styles.phoneNotRegisteredToastDot, { backgroundColor: businessColors.error }]}
                accessibilityElementsHidden
              />
              <Text style={styles.phoneNotRegisteredToastText}>
                {loginSmsToast === 'phone_required'
                  ? t('login.otp.tagPhoneRequired', 'אנא הזינו מספר טלפון תקין')
                  : t('login.otp.tagPhoneNotRegistered', 'מספר הטלפון אינו רשום אצלנו')}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAwareScreenScroll
          style={[styles.keyboardAvoid, { backgroundColor: 'transparent' }]}
          contentContainerStyle={[
            styles.scroll,
            { backgroundColor: 'transparent', justifyContent: 'center', paddingVertical: 16 },
          ]}
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
              {
                minHeight: Math.max(SH - insets.top - insets.bottom, 480),
                justifyContent: 'center',
              },
            ]}
            onPress={Keyboard.dismiss}
          >
            {/* ── FORM ZONE (staggered fade-in-down per block) ── */}
            <View
              style={[styles.formZone, { paddingBottom: bottomPad + 32, paddingTop: 8 }]}
              collapsable={false}
            >
              <LoginEntranceSection delayMs={0} style={styles.header}>
                <Text style={[styles.titleText, { color: heroText }]}>
                  {t('login.form.title', 'נתראה בפנים')}
                </Text>
                <Text style={[styles.subtitleText, { color: heroMuted }]}>
                  {usePasswordLogin
                    ? t('login.form.subtitle', 'הכנס את הפרטים שלך כדי להמשיך')
                    : t('login.otp.subtitlePhone', 'הזינו נייד — נשלח קוד אימות ב-SMS')}
                </Text>
              </LoginEntranceSection>

              <LoginEntranceSection delayMs={260} style={styles.fieldWrap}>
                <View
                  style={[
                    styles.phoneOpenRow,
                    /** `row` (not row-reverse): with app RTL, flex-start is on the right — Phone first → icon on the right, flush with the field. */
                    { flexDirection: 'row' },
                    {
                      borderBottomColor: phoneFocused ? phoneBorderFocus : phoneBorderUnfocus,
                      borderBottomWidth: phoneFocused ? 2.5 : 1.5,
                    },
                  ]}
                >
                  <View style={styles.phoneOpenIconSlot} accessible={false}>
                    <Phone
                      size={18}
                      color={phoneFocused ? phoneBorderFocus : heroFaint}
                      strokeWidth={1.5}
                    />
                  </View>
                  <TextInput
                    style={[
                      styles.phoneOpenInput,
                      { textAlign: isRtl ? 'right' : 'left', color: heroText },
                    ]}
                    accessibilityLabel={t('login.field.phone', 'טלפון')}
                    placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                    placeholderTextColor={heroFaint}
                    value={phone}
                    onChangeText={(v) => {
                      setPhone(v);
                      setLoginSmsToast(null);
                    }}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    textContentType="telephoneNumber"
                    showSoftInputOnFocus
                    editable={!isLoginLocked}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                </View>
              </LoginEntranceSection>

              {usePasswordLogin ? (
                <LoginEntranceSection delayMs={480} style={styles.fieldWrap}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: heroMuted, textAlign: isRtl ? 'right' : 'left' },
                    ]}
                  >
                    {t('login.field.password', 'סיסמה')}
                  </Text>
                  <View
                    style={[
                      styles.inputRow,
                      { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      useLightFg
                        ? {
                            borderColor: passFocused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.32)',
                            backgroundColor: passFocused ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
                          }
                        : {
                            borderColor: passFocused ? primary : 'rgba(0,0,0,0.1)',
                            backgroundColor: passFocused ? hexToRgba(primary, 0.06) : '#F7F7F7',
                          },
                    ]}
                  >
                    <View accessible={false}>
                      <Lock
                        size={19}
                        color={passFocused ? (useLightFg ? '#FFFFFF' : primary) : useLightFg ? heroFaint : '#ABABAB'}
                        strokeWidth={1.7}
                      />
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        { textAlign: isRtl ? 'right' : 'left', color: heroText },
                      ]}
                      placeholder={t('login.passwordPlaceholder', 'סיסמה')}
                      placeholderTextColor={useLightFg ? 'rgba(255,255,255,0.45)' : '#C0C0C0'}
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
                        <EyeOff
                          size={19}
                          color={passFocused ? (useLightFg ? '#FFFFFF' : primary) : useLightFg ? heroFaint : '#ABABAB'}
                          strokeWidth={1.7}
                        />
                      ) : (
                        <Eye
                          size={19}
                          color={passFocused ? (useLightFg ? '#FFFFFF' : primary) : useLightFg ? heroFaint : '#ABABAB'}
                          strokeWidth={1.7}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </LoginEntranceSection>
              ) : null}

              {isLoginLocked ? (
                <LoginEntranceSection delayMs={560}>
                  <Text
                    style={[
                      styles.lockBanner,
                      { color: businessColors.warning, textAlign: isRtl ? 'right' : 'left' },
                    ]}
                  >
                    {t('login.lockedHint', 'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.')}
                  </Text>
                </LoginEntranceSection>
              ) : null}

              {/* CTA: entrance layer → press-scale layer → button content */}
              <LoginEntranceSection delayMs={740} style={styles.btnWrap}>
                <Animated.View style={btnScaleStyle}>
                  <TouchableOpacity
                    onPressIn={() => { btnScale.value = withTiming(0.97, { duration: 90 }); }}
                    onPressOut={() => { btnScale.value = withSpring(1, { damping: 16, stiffness: 280 }); }}
                    onPress={handleLogin}
                    disabled={isLoading || isLoginLocked}
                    activeOpacity={1}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isLoading || isLoginLocked }}
                  >
                    <View
                      style={[
                        styles.btnOuter,
                        useLightFg ? styles.btnOuterElevated : null,
                        (isLoading || isLoginLocked) && styles.btnOuterDisabled,
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
                          {isLoginLocked
                            ? t('login.cta.locked', 'התחברות חסומה')
                            : usePasswordLogin
                              ? t('login.cta.signIn', 'כניסה')
                              : t('login.cta.sendOtp', 'שלח קוד ב-SMS')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              </LoginEntranceSection>

              <LoginEntranceSection delayMs={980} style={styles.linksWrap}>
                <TouchableOpacity
                  onPress={() => {
                    setUsePasswordLogin((v) => !v);
                    setLoginSmsToast(null);
                  }}
                  hitSlop={{ top: 10, bottom: 10 }}
                >
                  <Text style={[styles.linkMuted, { color: heroMuted, textAlign: 'center' }]}>
                    {usePasswordLogin
                      ? t('login.switchToOtp', 'התחברות עם קוד SMS')
                      : t('login.switchToPassword', 'כניסת מנהל / סיסמה')}
                  </Text>
                </TouchableOpacity>

                {usePasswordLogin ? (
                  <TouchableOpacity onPress={() => setIsForgotOpen(true)} hitSlop={{ top: 10, bottom: 10 }}>
                    <Text style={[styles.linkMuted, { color: heroMuted, textAlign: 'center' }]}>
                      {t('login.forgotPassword', 'שכחת סיסמה?')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.dividerRow}>
                  <View
                    style={[
                      styles.divider,
                      {
                        backgroundColor: useLightFg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)',
                      },
                    ]}
                  />
                </View>

                <View style={styles.registerRow}>
                  <Text style={[styles.registerText, { color: heroMuted, textAlign: 'center' }]}>
                    {t('login.noAccount', 'אין לך חשבון?')}{' '}
                    <Text
                      onPress={() => router.push('/register')}
                      accessibilityRole="link"
                      style={[styles.registerAction, { color: useLightFg ? '#FFFFFF' : primary }]}
                      suppressHighlighting={false}
                    >
                      {t('login.signUpNow', 'להרשמה')}
                    </Text>
                  </Text>
                </View>
              </LoginEntranceSection>
            </View>
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
  },
  phoneNotRegisteredToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 50,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  phoneNotRegisteredToastPill: {
    alignSelf: 'center',
    maxWidth: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  phoneNotRegisteredToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: '100%',
  },
  phoneNotRegisteredToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  phoneNotRegisteredToastText: {
    flexShrink: 1,
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
    paddingHorizontal: 26,
    /** Height follows content so vertical centering in the scroll works. */
    width: '100%',
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 14,
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
  /** Phone: open “canvas” — underline only, no boxed fill */
  phoneOpenRow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 1,
    minHeight: 48,
    gap: 6,
  },
  phoneOpenIconSlot: {
    paddingBottom: 1,
    opacity: 0.95,
  },
  phoneOpenInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 0.2,
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: 0,
    margin: 0,
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
    minHeight: 54,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    /**
     * NO overflow:hidden here — combining overflow:hidden with shadow and transform
     * forces extra compositing layers that cause stutter on entry animation.
     * Corner clipping is handled by borderRadius alone.
     */
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  /** Light lift for white CTA on gradient — kept soft to avoid heavy halo */
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
