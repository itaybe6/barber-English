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
  ActivityIndicator,
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
import { Phone, Lock, KeyRound, Mail, Eye, EyeOff } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
          withTiming(0.32, { duration: driftMs * 1.1, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.08, { duration: driftMs * 1.1, easing: Easing.inOut(Easing.ease) }),
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
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('he') ?? true;

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
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
    logoGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3600, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
  }, []);

  const logoFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(logoFloat.value, [0, 1], [0, -6]) }],
  }));
  const logoGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logoGlow.value, [0, 1], [0.06, 0.22]),
    transform: [{ scale: interpolate(logoGlow.value, [0, 1], [0.94, 1.08]) }],
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
      if (authUser.user_type === 'client' && authUser.client_approved === false) {
        await writeLoginFailures(key, 0);
        Alert.alert(
          t('login.pendingApprovalTitle', 'Awaiting approval'),
          t('login.pendingApprovalMessage', 'Your account is waiting for the business to approve it. You will be able to sign in once approved.')
        );
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
        if (authUser.user_type === 'client' && (authUser as any).client_approved === false) {
          await writeLoginFailures(key, 0);
          Alert.alert(
            t('login.pendingApprovalTitle', 'Awaiting approval'),
            t('login.pendingApprovalMessage', 'Your account is waiting for the business to approve it. You will be able to sign in once approved.')
          );
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

      {/* ── Warm editorial background — soft orbs, restrained motion (UI/UX Pro Max) ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#FDFCFA', '#F7F4F0', '#F2EFE9']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[hexToRgba(primary, 0.07), 'transparent']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.9, y: 0.45 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <DriftingCircle
          size={380}
          left={-120}
          top={-100}
          color={hexToRgba(shiftHex(primary, 15), 0.22)}
          driftMs={14000}
          delayMs={0}
          driftX={28}
          driftY={22}
        />
        <DriftingCircle
          size={280}
          left={SW * 0.35}
          top={SH * 0.42}
          color={hexToRgba(shiftHex(primary, -25), 0.18)}
          driftMs={16000}
          delayMs={900}
          driftX={-22}
          driftY={26}
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

            {/* Form — glass card, visible labels, RTL-aware (register parity) */}
            <View style={styles.cardWrapper} collapsable={false}>
              <BlurView intensity={Platform.OS === 'ios' ? 42 : 24} tint="light" style={styles.cardBlur}>
                <View style={[styles.cardInner, { paddingBottom: bottomPad + 12 }]}>
                  <View style={[styles.accentCapsule, { backgroundColor: hexToRgba(primary, 0.55) }]} />

                  <View style={styles.header}>
                    <Text style={[styles.titleText, { color: businessColors.text }]}>
                      {usePasswordLogin
                        ? t('login.form.title', 'כניסה לחשבון')
                        : loginStep === 'code'
                          ? t('login.otp.title', 'קוד אימות')
                          : t('login.form.title', 'כניסה לחשבון')}
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
                        : loginStep === 'code'
                          ? t('login.otp.subtitle', 'הזן את הקוד בן 6 הספרות שנשלח ב-SMS')
                          : t('login.otp.subtitlePhone', 'הזן מספר טלפון — נשלח אליך קוד ב-SMS')}
                    </Text>
                  </View>

                  <View style={styles.fieldWrap} collapsable={false}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                      ]}
                    >
                      {t('login.field.phone', 'טלפון')}
                    </Text>
                    <View
                      style={[
                        styles.inputRow,
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                        {
                          borderColor: phoneFocused ? primary : hexToRgba(businessColors.border, 0.35),
                          backgroundColor: hexToRgba(businessColors.surface, 0.65),
                        },
                      ]}
                    >
                      <View accessible={false}>
                        <Phone
                          size={20}
                          color={phoneFocused ? primary : businessColors.textSecondary}
                          strokeWidth={1.65}
                        />
                      </View>
                      <TextInput
                        style={[
                          styles.input,
                          { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                        ]}
                        placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                        placeholderTextColor={hexToRgba(businessColors.textSecondary, 0.55)}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        autoCorrect={false}
                        textContentType="telephoneNumber"
                        showSoftInputOnFocus
                        editable={
                          !isLoginLocked && (usePasswordLogin || loginStep === 'phone')
                        }
                        onFocus={() => setPhoneFocused(true)}
                        onBlur={() => setPhoneFocused(false)}
                      />
                    </View>
                  </View>

                  {!usePasswordLogin && loginStep === 'code' ? (
                    <View style={styles.fieldWrap} collapsable={false}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: businessColors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                        ]}
                      >
                        {t('login.field.otp', 'קוד אימות')}
                      </Text>
                      <View
                        style={[
                          styles.inputRow,
                          { flexDirection: isRtl ? 'row-reverse' : 'row' },
                          {
                            borderColor: otpFocused ? primary : hexToRgba(businessColors.border, 0.35),
                            backgroundColor: hexToRgba(businessColors.surface, 0.65),
                          },
                        ]}
                      >
                        <View accessible={false}>
                          <KeyRound
                            size={20}
                            color={otpFocused ? primary : businessColors.textSecondary}
                            strokeWidth={1.65}
                          />
                        </View>
                        <TextInput
                          style={[
                            styles.input,
                            { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                          ]}
                          placeholder={t('login.otp.placeholder', 'קוד 6 ספרות')}
                          placeholderTextColor={hexToRgba(businessColors.textSecondary, 0.55)}
                          value={otpCode}
                          onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          maxLength={6}
                          autoCorrect={false}
                          showSoftInputOnFocus
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
                        <Text
                          style={[
                            styles.otpBackText,
                            {
                              color:
                                otpCooldownSec > 0
                                  ? businessColors.textSecondary
                                  : primary,
                            },
                          ]}
                        >
                          {otpCooldownSec > 0
                            ? t('login.otp.resendWait', 'שלח שוב בעוד {{s}} שניות', {
                                s: otpCooldownSec,
                              })
                            : t('login.otp.resend', 'שלח קוד מחדש')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

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
                            borderColor: passFocused ? primary : hexToRgba(businessColors.border, 0.35),
                            backgroundColor: hexToRgba(businessColors.surface, 0.65),
                          },
                        ]}
                      >
                        <View accessible={false}>
                          <Lock
                            size={20}
                            color={passFocused ? primary : businessColors.textSecondary}
                            strokeWidth={1.65}
                          />
                        </View>
                        <TextInput
                          style={[
                            styles.input,
                            { textAlign: isRtl ? 'right' : 'left', color: businessColors.text },
                          ]}
                          placeholder={t('login.passwordPlaceholder', 'סיסמה')}
                          placeholderTextColor={hexToRgba(businessColors.textSecondary, 0.55)}
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
                              size={20}
                              color={passFocused ? primary : businessColors.textSecondary}
                              strokeWidth={1.65}
                            />
                          ) : (
                            <Eye
                              size={20}
                              color={passFocused ? primary : businessColors.textSecondary}
                              strokeWidth={1.65}
                            />
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
                      {t(
                        'login.lockedHint',
                        'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.',
                      )}
                    </Text>
                  ) : null}

                  <Animated.View style={btnAnimStyle}>
                    <TouchableOpacity
                      onPressIn={() => {
                        btnScale.value = withTiming(0.97, { duration: 90 });
                      }}
                      onPressOut={() => {
                        btnScale.value = withSpring(1, { damping: 16, stiffness: 280 });
                      }}
                      onPress={handleLogin}
                      disabled={isLoading || isLoginLocked}
                      activeOpacity={1}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isLoading || isLoginLocked }}
                    >
                      <View
                        style={[
                          styles.btnOuter,
                          (isLoading || isLoginLocked) && styles.btnOuterDisabled,
                        ]}
                      >
                        <LinearGradient
                          colors={[
                            shiftHex(primary, 18),
                            primary,
                            shiftHex(primary, -22),
                          ]}
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
                                  : loginStep === 'code'
                                    ? t('login.cta.verifyOtp', 'אמת קוד והתחבר')
                                    : t('login.cta.sendOtp', 'שלח קוד ב-SMS')}
                            </Text>
                          )}
                        </LinearGradient>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>

                  <View style={styles.linksWrap}>
                    <TouchableOpacity
                      onPress={() => setUsePasswordLogin((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10 }}
                    >
                      <Text
                        style={[
                          styles.linkMuted,
                          { color: businessColors.textSecondary },
                          { textAlign: 'center' },
                        ]}
                      >
                        {usePasswordLogin
                          ? t('login.switchToOtp', 'התחברות עם קוד SMS')
                          : t('login.switchToPassword', 'כניסת מנהל / סיסמה')}
                      </Text>
                    </TouchableOpacity>

                    {usePasswordLogin ? (
                      <TouchableOpacity
                        onPress={() => setIsForgotOpen(true)}
                        hitSlop={{ top: 10, bottom: 10 }}
                      >
                        <Text
                          style={[
                            styles.linkMuted,
                            { color: businessColors.textSecondary },
                            { textAlign: 'center' },
                          ]}
                        >
                          {t('login.forgotPassword', 'שכחת סיסמה?')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <View style={styles.dividerRow}>
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: hexToRgba(businessColors.border, 0.25) },
                        ]}
                      />
                    </View>

                    <View
                      style={[
                        styles.registerRow,
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      ]}
                    >
                      <Text
                        style={[styles.registerText, { color: businessColors.textSecondary }]}
                      >
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
                </View>
              </BlurView>
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
  root: {
    flex: 1,
    backgroundColor: '#FDFCFA',
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
    paddingVertical: 28,
    paddingBottom: 32,
  },

  centeredBlock: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 22,
  },

  logoSection: {
    alignItems: 'center',
    paddingBottom: 22,
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
    width: SW * 0.62,
    height: 108,
    alignSelf: 'center',
  },

  cardWrapper: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(45, 42, 38, 0.08)',
    shadowColor: '#1a1208',
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  cardBlur: {
    width: '100%',
  },
  cardInner: {
    paddingHorizontal: 22,
    paddingTop: 4,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.78)' : 'transparent',
  },

  accentCapsule: {
    width: 36,
    height: 3,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 20,
  },

  header: {
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  titleText: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },

  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.15,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
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

  btnOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    marginTop: 4,
  },
  btnOuterDisabled: {
    opacity: 0.5,
  },
  btn: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 20,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.25,
  },

  linksWrap: {
    alignItems: 'center',
    marginTop: 22,
    gap: 12,
  },
  otpBackRow: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  otpBackText: {
    fontSize: 14,
    fontWeight: '600',
  },
  linkMuted: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  dividerRow: {
    width: '42%',
    alignItems: 'center',
    marginVertical: 4,
  },
  divider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
  },
  registerRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    rowGap: 4,
  },
  registerText: {
    fontSize: 14,
  },
  registerAction: {
    fontWeight: '700',
    fontSize: 14,
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 18, 12, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FDFCFA',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(45, 42, 38, 0.08)',
    shadowColor: '#1a1208',
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  modalStripe: {
    height: 4,
    width: '100%',
  },
  modalBody: {
    padding: 22,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.12,
  },
  modalInputRow: {
    alignItems: 'center',
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(45, 42, 38, 0.1)',
    backgroundColor: 'rgba(255,255,255,0.85)',
    gap: 10,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  modalActions: {
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
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
