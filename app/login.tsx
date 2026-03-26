import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  useSharedValue,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import { usersApi } from '@/lib/api/users';
import { supabase, getBusinessId } from '@/lib/supabase';
import { findUserByCredentials, isValidUserType, UserType } from '@/constants/auth';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { superAdminApi } from '@/lib/api/superAdmin';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW, height: SH } = Dimensions.get('window');

const MAX_LOGIN_FAILURES = 5;
const loginFailuresStorageKey = (phoneKey: string) => `@login_failures:${phoneKey}`;

function normalizePhoneKey(phone: string): string {
  return phone.trim().replace(/\s+/g, '');
}

async function readLoginFailures(phoneKey: string): Promise<number> {
  if (!phoneKey) return 0;
  const raw = await AsyncStorage.getItem(loginFailuresStorageKey(phoneKey));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function writeLoginFailures(phoneKey: string, count: number): Promise<void> {
  if (!phoneKey) return;
  if (count <= 0) {
    await AsyncStorage.removeItem(loginFailuresStorageKey(phoneKey));
  } else {
    await AsyncStorage.setItem(loginFailuresStorageKey(phoneKey), String(count));
  }
}

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

// ─── Animated drifting circle ─────────────────────────────────────────────────
interface CircleProps {
  size: number;
  left: number;
  top: number;
  color: string;
  driftMs: number;
  delayMs: number;
  driftX: number;
  driftY: number;
}

function DriftingCircle({ size, left, top, color, driftMs, delayMs, driftX, driftY }: CircleProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0.15);

  useEffect(() => {
    tx.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(driftX, { duration: driftMs, easing: Easing.inOut(Easing.ease) }),
          withTiming(-driftX * 0.6, { duration: driftMs * 0.8, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: driftMs * 0.7, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    ty.value = withDelay(
      delayMs + 400,
      withRepeat(
        withSequence(
          withTiming(-driftY, { duration: driftMs * 0.9, easing: Easing.inOut(Easing.ease) }),
          withTiming(driftY * 0.7, { duration: driftMs, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: driftMs * 0.8, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    op.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: driftMs * 1.1, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.12, { duration: driftMs * 1.1, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const s = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        left,
        top,
      }, s]}
    />
  );
}

// ─── Button shimmer ───────────────────────────────────────────────────────────
function ButtonShimmer() {
  const x = useSharedValue(-160);

  useEffect(() => {
    const run = () => {
      x.value = -160;
      x.value = withDelay(1800, withTiming(SW + 160, { duration: 700, easing: Easing.linear }));
    };
    run();
    const id = setInterval(run, 2800);
    return () => clearInterval(id);
  }, []);

  const s = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, s]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: 160, height: '100%' }}
      />
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'code'>('phone');
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const [loginFailureCount, setLoginFailureCount] = useState(0);

  const login = useAuthStore((state) => state.login);
  const { isAuthenticated, user } = useAuthStore();
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

  const primary = businessColors.primary;

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

  useEffect(() => {
    if (otpCooldownSec <= 0) return;
    const id = setInterval(() => setOtpCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpCooldownSec]);

  useEffect(() => {
    if (usePasswordLogin) {
      setLoginStep('phone');
      setOtpCode('');
    }
  }, [usePasswordLogin]);

  // ── Logo float ──
  const logoFloat = useSharedValue(0);
  const logoGlow = useSharedValue(0);

  useEffect(() => {
    logoFloat.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
    logoGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
  }, []);

  const logoFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(logoFloat.value, [0, 1], [0, -10]) }],
  }));
  const logoGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logoGlow.value, [0, 1], [0.08, 0.45]),
    transform: [{ scale: interpolate(logoGlow.value, [0, 1], [0.9, 1.25]) }],
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

  const otpErrorMessage = (code: string | undefined): string => {
    switch (code) {
      case 'pulseem_not_configured':
        return t(
          'login.otp.errorPulseem',
          'שליחת SMS לא הוגדרה: נדרשים מזהה משתמש, סיסמה ומספר שולח פולסים (Web Service). מפתח API בלבד לא מספיק — הגדר בסופר־אדמין.',
        );
      case 'business_not_found':
        return t(
          'login.otp.errorBusiness',
          'מזהה העסק לא נמצא במסד. בדוק BUSINESS_ID ב-.env.',
        );
      case 'db_error':
      case 'server_error':
        return t(
          'login.otp.errorServer',
          'שגיאת שרת. ודא מיגרציית OTP והפונקציה auth-phone-otp ב-Supabase.',
        );
      case 'invoke_network':
        return t(
          'login.otp.errorInvoke',
          'לא ניתן להגיע לשרת (Edge Function). בדוק פריסה ואינטרנט.',
        );
      case 'rate_limit_sends':
        return t('login.otp.errorRateLimit', 'נשלחו יותר מדי קודים לשעה. נסה שוב מאוחר יותר.');
      case 'sms_send_failed':
        return t('login.otp.errorSms', 'שליחת ה-SMS נכשלה. נסה שוב.');
      case 'wrong_code':
      case 'no_active_code':
        return t('login.otp.errorWrongCode', 'קוד שגוי או שפג תוקפו. בקש קוד חדש.');
      case 'too_many_attempts':
        return t('login.otp.errorTooMany', 'יותר מדי ניסיונות שגויים. בקש קוד חדש.');
      case 'phone_registered':
        return t('register.phoneExists.message', 'מספר זה כבר רשום.');
      default:
        return code && code !== 'send_failed'
          ? `${t('common.retry', 'נסה שוב')} (${code})`
          : t('common.tryAgain', 'נסה שוב');
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
        Alert.alert(t('error.generic', 'שגיאה'), otpErrorMessage(res.error));
        return;
      }
      setLoginStep('code');
      setOtpCode('');
      setOtpCooldownSec(45);
      Alert.alert(
        t('login.otp.sentTitle', 'קוד נשלח'),
        t(
          'login.otp.sentBody',
          'אם המספר רשום אצלנו, תקבל הודעת SMS עם קוד אימות. הזן אותו למטה.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyLoginOtp = async () => {
    const digits = otpCode.replace(/\D/g, '');
    if (digits.length !== 6) {
      Alert.alert(t('error.generic', 'שגיאה'), t('login.otp.enterSix', 'הזן את 6 הספרות שנשלחו ב-SMS'));
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
      const res = await authPhoneOtpApi.verifyLoginOtp(phone.trim(), digits);
      if (!res.ok || !res.user) {
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
          Alert.alert(
            t('error.generic', 'שגיאה'),
            `${otpErrorMessage(res.error)}\n\n${t('login.attemptsRemaining', 'נותרו {{n}} ניסיונות.', { n: remaining })}`
          );
        }
        return;
      }
      const authUser = res.user;
      if (authUser.block) {
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
        id: authUser.id,
        phone: authUser.phone,
        type: authUser.user_type,
        name: authUser.name,
        email: authUser.email ?? null,
        image_url: authUser.image_url ?? null,
        user_type: authUser.user_type,
        block: authUser.block ?? false,
        client_approved: authUser.client_approved !== false,
      } as any;
      login(appUser);
      router.replace(appUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!usePasswordLogin) {
      if (loginStep === 'phone') {
        await handleSendLoginOtp();
      } else {
        await handleVerifyLoginOtp();
      }
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

      {/* ── White background + drifting circles (pointerEvents none) ───── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#FFFFFF', '#FAFAFA', '#F5F5F5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <DriftingCircle
          size={320} left={-80} top={-60}
          color={hexToRgba(primary, 0.48)}
          driftMs={5000} delayMs={0} driftX={50} driftY={40}
        />
        <DriftingCircle
          size={260} left={SW * 0.5} top={SH * 0.05}
          color={hexToRgba(shiftHex(primary, 30), 0.42)}
          driftMs={6200} delayMs={700} driftX={-45} driftY={55}
        />
        <DriftingCircle
          size={200} left={-40} top={SH * 0.3}
          color={hexToRgba(shiftHex(primary, -20), 0.38)}
          driftMs={4800} delayMs={1200} driftX={60} driftY={-35}
        />
        <DriftingCircle
          size={150} left={SW * 0.65} top={SH * 0.38}
          color={hexToRgba(shiftHex(primary, 50), 0.35)}
          driftMs={5500} delayMs={400} driftX={-30} driftY={-50}
        />
        <DriftingCircle
          size={100} left={SW * 0.2} top={SH * 0.55}
          color={hexToRgba(primary, 0.32)}
          driftMs={4200} delayMs={1800} driftX={40} driftY={30}
        />
      </View>

      {/* ── Content — same pattern as register.tsx for reliable keyboard focus ─ */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <KeyboardAwareScreenScroll
          style={styles.keyboardAvoid}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'none' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          removeClippedSubviews={false}
        >
          {/* Centered login block: logo + card */}
          <View style={styles.centeredBlock} pointerEvents="box-none">
            {/* Logo — plain View (no Reanimated entering — can break TextInput focus) */}
            <View style={styles.logoSection} pointerEvents="box-none">
              <Animated.View style={logoFloatStyle} pointerEvents="box-none">
                <Animated.View
                  pointerEvents="none"
                  style={[styles.logoGlow, { backgroundColor: hexToRgba(primary, 1) }, logoGlowStyle]}
                />
                <Image
                  source={getCurrentClientLogo()}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </Animated.View>
            </View>

            {/* Form card — plain View + collapsable={false} for Android touch */}
            <View style={styles.cardWrapper} collapsable={false}>
            <View style={[styles.card, { paddingBottom: bottomPad + 8 }]}>
              <View style={[styles.accentLine, { backgroundColor: hexToRgba(primary, 0.8) }]} />

              <View style={styles.header}>
                <Text style={styles.titleText}>
                  {usePasswordLogin
                    ? t('login.form.title', 'כניסה לחשבון')
                    : loginStep === 'code'
                      ? t('login.otp.title', 'קוד אימות')
                      : t('login.form.title', 'כניסה לחשבון')}
                </Text>
                <Text style={styles.subtitleText}>
                  {usePasswordLogin
                    ? t('login.form.subtitle', 'הכנס את הפרטים שלך כדי להמשיך')
                    : loginStep === 'code'
                      ? t('login.otp.subtitle', 'הזן את הקוד בן 6 הספרות שנשלח ב-SMS')
                      : t('login.otp.subtitlePhone', 'הזן מספר טלפון — נשלח אליך קוד ב-SMS')}
                </Text>
              </View>

              {/* Phone field — avoid elevation/shadow on focus (breaks keyboard on Android) */}
              <View style={styles.fieldWrap} collapsable={false}>
                <View style={[
                  styles.inputRow,
                  phoneFocused && {
                    borderColor: primary,
                    borderWidth: 1.8,
                  },
                ]}>
                  <Ionicons
                    name="call-outline"
                    size={19}
                    color={phoneFocused ? primary : '#9CA3AF'}
                    style={styles.iconLeft}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                    placeholderTextColor="#B0B8C4"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    textAlign="left"
                    showSoftInputOnFocus={true}
                    editable={
                      !isLoginLocked &&
                      (usePasswordLogin || loginStep === 'phone')
                    }
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                </View>
              </View>

              {/* OTP code (SMS) */}
              {!usePasswordLogin && loginStep === 'code' ? (
                <View style={styles.fieldWrap} collapsable={false}>
                  <View style={[
                    styles.inputRow,
                    otpFocused && {
                      borderColor: primary,
                      borderWidth: 1.8,
                    },
                  ]}>
                    <Ionicons
                      name="keypad-outline"
                      size={19}
                      color={otpFocused ? primary : '#9CA3AF'}
                      style={styles.iconLeft}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t('login.otp.placeholder', 'קוד 6 ספרות')}
                      placeholderTextColor="#B0B8C4"
                      value={otpCode}
                      onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoCorrect={false}
                      textAlign="left"
                      showSoftInputOnFocus={true}
                      editable={!isLoginLocked}
                      onFocus={() => setOtpFocused(true)}
                      onBlur={() => setOtpFocused(false)}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setLoginStep('phone');
                      setOtpCode('');
                    }}
                    style={styles.otpBackRow}
                    hitSlop={{ top: 8, bottom: 8 }}
                  >
                    <Text style={[styles.otpBackText, { color: primary }]}>
                      {t('login.otp.changePhone', 'שינוי מספר טלפון')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSendLoginOtp}
                    disabled={isLoading || otpCooldownSec > 0 || isLoginLocked}
                    style={styles.otpBackRow}
                    hitSlop={{ top: 8, bottom: 8 }}
                  >
                    <Text style={[styles.otpBackText, { color: otpCooldownSec > 0 ? '#9CA3AF' : primary }]}>
                      {otpCooldownSec > 0
                        ? t('login.otp.resendWait', 'שלח שוב בעוד {{s}} שניות', { s: otpCooldownSec })
                        : t('login.otp.resend', 'שלח קוד מחדש')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Password field — super admin / legacy */}
              {usePasswordLogin ? (
                <View style={styles.fieldWrap} collapsable={false}>
                  <View style={[
                    styles.inputRow,
                    passFocused && {
                      borderColor: primary,
                      borderWidth: 1.8,
                    },
                  ]}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={19}
                      color={passFocused ? primary : '#9CA3AF'}
                      style={styles.iconLeft}
                    />
                    <TextInput
                      style={[styles.input, styles.inputPass]}
                      placeholder={t('login.passwordPlaceholder', 'סיסמה')}
                      placeholderTextColor="#B0B8C4"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textAlign="left"
                      showSoftInputOnFocus={true}
                      editable={!isLoginLocked}
                      onFocus={() => setPassFocused(true)}
                      onBlur={() => setPassFocused(false)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      style={styles.eyeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={19}
                        color={passFocused ? primary : '#9CA3AF'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {isLoginLocked && (
                <Text style={styles.lockBanner}>
                  {t('login.lockedHint', 'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.')}
                </Text>
              )}

              {/* Login button */}
              <Animated.View style={btnAnimStyle}>
                <TouchableOpacity
                  onPressIn={() => { btnScale.value = withTiming(0.96, { duration: 80 }); }}
                  onPressOut={() => { btnScale.value = withSpring(1, { damping: 12, stiffness: 220 }); }}
                  onPress={handleLogin}
                  disabled={isLoading || isLoginLocked}
                  activeOpacity={1}
                >
                  <View style={[styles.btnOuter, (isLoading || isLoginLocked) && styles.btnOuterDisabled]}>
                    <LinearGradient
                      colors={[shiftHex(primary, 40), primary, shiftHex(primary, -40)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.btn}
                    >
                      <ButtonShimmer />
                      <Text style={styles.btnText}>
                        {isLoading
                          ? t('login.cta.signingIn', 'מתחבר...')
                          : isLoginLocked
                            ? t('login.cta.locked', 'התחברות חסומה')
                            : usePasswordLogin
                              ? t('login.cta.signIn', 'כניסה')
                              : loginStep === 'code'
                                ? t('login.cta.verifyOtp', 'אמת קוד והתחבר')
                                : t('login.cta.sendOtp', 'שלח קוד ב-SMS')}
                      </Text>
                    </LinearGradient>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Links */}
              <View style={styles.linksWrap}>
                <TouchableOpacity
                  onPress={() => setUsePasswordLogin((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8 }}
                >
                  <Text style={[styles.forgotText, { color: '#6B7280' }]}>
                    {usePasswordLogin
                      ? t('login.switchToOtp', 'התחברות עם קוד SMS')
                      : t('login.switchToPassword', 'כניסת מנהל / סיסמה')}
                  </Text>
                </TouchableOpacity>

                {usePasswordLogin ? (
                  <TouchableOpacity onPress={() => setIsForgotOpen(true)} hitSlop={{ top: 8, bottom: 8 }}>
                    <Text style={[styles.forgotText, { color: '#6B7280' }]}>
                      {t('login.forgotPassword', 'שכחת סיסמה?')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                </View>

                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>
                    {t('login.noAccount', 'אין לך חשבון?')}
                  </Text>
                  <Link href="/register" asChild>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Text style={[styles.registerAction, { color: primary }]}>
                        {' '}{t('login.signUpNow', 'הרשם עכשיו')}
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>

            </View>
          </View>
          </View>
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
              <Text style={[styles.modalTitle, { color: primary }]}>
                {t('login.reset.title', 'איפוס סיסמה')}
              </Text>
              <Text style={styles.modalSubtitle}>
                {t('login.reset.subtitle', 'הכנס טלפון ומייל כפי שמופיעים בחשבון שלך')}
              </Text>

              {/* Phone */}
              <View style={[styles.modalInputRow, { marginBottom: 12 }]}>
                <Ionicons name="call-outline" size={18} color="#9CA3AF" style={styles.iconLeft} />
                <TextInput
                  style={styles.modalInput}
                  placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                  placeholderTextColor="#B0B8C4"
                  value={forgotPhone}
                  onChangeText={setForgotPhone}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  textAlign="left"
                />
              </View>

              {/* Email */}
              <View style={styles.modalInputRow}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.iconLeft} />
                <TextInput
                  style={styles.modalInput}
                  placeholder={t('profile.edit.emailPlaceholder', 'כתובת מייל')}
                  placeholderTextColor="#B0B8C4"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn]}
                  onPress={() => setIsForgotOpen(false)}
                  disabled={isSendingReset}
                >
                  <Text style={styles.cancelBtnText}>{t('cancel', 'ביטול')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { overflow: 'hidden' }]}
                  onPress={handleForgotSubmit}
                  disabled={isSendingReset}
                >
                  <LinearGradient
                    colors={[shiftHex(primary, 30), primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.confirmBtnText}>
                    {isSendingReset ? t('login.reset.sending', 'שולח...') : t('confirm', 'אישור')}
                  </Text>
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
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 32,
  },

  // ── Centered block (logo + card) ──
  centeredBlock: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },

  // ── Logo ──
  logoSection: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    alignSelf: 'center',
    top: -40,
  },
  logo: {
    width: SW * 0.65,
    height: 115,
    alignSelf: 'center',
  },

  // ── Centered card (rounded on all corners) ──
  cardWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  card: {
    paddingHorizontal: 24,
    paddingTop: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
  },

  // ── Accent line top of card ──
  accentLine: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 24,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titleText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 13.5,
    color: '#6B7280',
    textAlign: 'center',
  },

  // ── Input ──
  fieldWrap: {
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  iconLeft: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  inputPass: {
    paddingRight: 38,
  },
  lockBanner: {
    fontSize: 13,
    color: '#B45309',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  eyeBtn: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },

  // ── Button ──
  btnOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  btnOuterDisabled: {
    opacity: 0.55,
  },
  btn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Links ──
  linksWrap: {
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  otpBackRow: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  otpBackText: {
    fontSize: 14,
    fontWeight: '600',
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dividerRow: {
    width: '50%',
    alignItems: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  registerText: {
    color: '#6B7280',
    fontSize: 14,
  },
  registerAction: {
    fontWeight: '800',
    fontSize: 14,
  },

  // ── Modal ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  modalStripe: {
    height: 5,
    width: '100%',
  },
  modalBody: {
    padding: 20,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8A9AB2',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 19,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  modalInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  modalBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
