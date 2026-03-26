import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  MAX_LOGIN_FAILURES,
  normalizePhoneKey,
  readLoginFailures,
  writeLoginFailures,
} from '@/lib/login/loginPhoneFailure';
import { otpErrorMessage } from '@/lib/login/otpErrorMessage';
import { isValidUserType } from '@/constants/auth';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import {
  OtpPasscodeKeypad,
  type OtpKeyId,
} from '@/components/login/OtpPasscodeKeypad';

const { width: WINDOW_WIDTH } = Dimensions.get('window');

const PASSCODE_LENGTH = 6;

const LOGIN_OTP_RESEND_TOAST_HIDE_Y = -140;
const LOGIN_OTP_RESEND_TOAST_VISIBLE_MS = 3000;

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

function parsePhoneParam(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return '';
}

export default function LoginOtpScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string | string[] }>();
  const phone = useMemo(() => parsePhoneParam(phoneParam), [phoneParam]);

  const login = useAuthStore((state) => state.login);
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

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

  const [passcode, setPasscode] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  /** Increment on each successful resend so the same animation runs every time (matches login toast behavior). */
  const [resendToastTick, setResendToastTick] = useState(0);
  const verifyInFlight = useRef(false);

  const shakeX = useSharedValue(0);
  const shakeDotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const triggerErrorShake = useCallback(() => {
    const step = { duration: 42, easing: Easing.linear };
    shakeX.value = withSequence(
      withTiming(-9, step),
      withTiming(9, step),
      withTiming(-7, step),
      withTiming(7, step),
      withTiming(0, { duration: 48, easing: Easing.out(Easing.quad) }),
    );
  }, [shakeX]);

  const resendToastY = useSharedValue(LOGIN_OTP_RESEND_TOAST_HIDE_Y);
  const resendToastOpacity = useSharedValue(0);
  const resendToastStyle = useAnimatedStyle(() => ({
    opacity: resendToastOpacity.value,
    transform: [{ translateY: resendToastY.value }],
  }));

  useEffect(() => {
    if (resendToastTick === 0) return;

    resendToastY.value = LOGIN_OTP_RESEND_TOAST_HIDE_Y;
    resendToastOpacity.value = 0;
    resendToastY.value = withSpring(0, {
      damping: 19,
      stiffness: 280,
      mass: 0.85,
    });
    resendToastOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });

    const id = setTimeout(() => {
      resendToastOpacity.value = withTiming(0, {
        duration: 220,
        easing: Easing.in(Easing.quad),
      });
      resendToastY.value = withTiming(LOGIN_OTP_RESEND_TOAST_HIDE_Y, {
        duration: 300,
        easing: Easing.in(Easing.cubic),
      });
    }, LOGIN_OTP_RESEND_TOAST_VISIBLE_MS);

    return () => clearTimeout(id);
  }, [resendToastTick, resendToastY, resendToastOpacity]);

  const phoneKey = normalizePhoneKey(phone);
  const isLoginLocked = phoneKey.length > 0 && loginFailureCount >= MAX_LOGIN_FAILURES;

  useEffect(() => {
    if (!phone) {
      router.replace('/login');
    }
  }, [phone]);

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

  const runVerify = useCallback(
    async (digits: string) => {
      if (digits.length !== PASSCODE_LENGTH || !phone) return;
      if (verifyInFlight.current) return;
      verifyInFlight.current = true;
      setBusy(true);
      const key = normalizePhoneKey(phone);
      try {
        const existingFailures = await readLoginFailures(key);
        if (existingFailures >= MAX_LOGIN_FAILURES) {
          setLoginFailureCount(existingFailures);
          Alert.alert(
            t('login.tooManyAttemptsTitle', 'התחברות נחסמה'),
            t(
              'login.tooManyAttemptsMessage',
              'בוצעו יותר מדי ניסיונות התחברות שגויים למספר זה. לא ניתן להתחבר כעת.',
            ),
          );
          return;
        }
        const res = await authPhoneOtpApi.verifyLoginOtp(phone, digits);
        if (!res.ok || !res.user) {
          const next = (await readLoginFailures(key)) + 1;
          await writeLoginFailures(key, next);
          setLoginFailureCount(next);
          setPasscode([]);
          triggerErrorShake();
          if (next >= MAX_LOGIN_FAILURES) {
            Alert.alert(
              t('login.tooManyAttemptsTitle', 'התחברות נחסמה'),
              t(
                'login.tooManyAttemptsMessage',
                'בוצעו יותר מדי ניסיונות התחברות שגויים למספר זה. לא ניתן להתחבר כעת.',
              ),
            );
          } else {
            const remaining = MAX_LOGIN_FAILURES - next;
            Alert.alert(
              t('error.generic', 'שגיאה'),
              `${otpErrorMessage(t, res.error)}\n\n${t('login.attemptsRemaining', 'נותרו {{n}} ניסיונות.', { n: remaining })}`,
            );
          }
          return;
        }
        const authUser = res.user;
        if (authUser.block) {
          await writeLoginFailures(key, 0);
          Alert.alert(
            t('account.blocked', 'חשבון חסום'),
            t('login.blockedCannotSignIn', 'החשבון שלך חסום. פנה למנהל.'),
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
        setBusy(false);
        verifyInFlight.current = false;
      }
    },
    [phone, t, login, triggerErrorShake],
  );

  const passcodeStr = passcode.join('');
  useEffect(() => {
    if (passcodeStr.length !== PASSCODE_LENGTH || !phone) return;
    void runVerify(passcodeStr);
  }, [passcodeStr, phone, runVerify]);

  const handleKey = (key: OtpKeyId) => {
    if (busy || isLoginLocked) return;
    if (key === 'delete') {
      setPasscode((p) => (p.length === 0 ? p : p.slice(0, -1)));
      return;
    }
    if (key === 'space') return;
    if (passcode.length >= PASSCODE_LENGTH) return;
    setPasscode((p) => [...p, key as number]);
  };

  const handleResend = async () => {
    if (!phone || busy || otpCooldownSec > 0 || isLoginLocked) return;
    setBusy(true);
    try {
      const res = await authPhoneOtpApi.sendLoginOtp(phone);
      if (!res.ok) {
        if (res.error === 'phone_not_registered') {
          const msg = otpErrorMessage(t, res.error);
          Alert.alert(t('login.otp.phoneNotRegisteredTitle', 'מספר לא רשום'), msg, [
            { text: t('ok', 'אישור'), onPress: () => router.replace('/login') },
          ]);
          return;
        }
        Alert.alert(t('error.generic', 'שגיאה'), otpErrorMessage(t, res.error));
        return;
      }
      setOtpCooldownSec(45);
      setPasscode([]);
      setResendToastTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const dividerLeft = useLightFg
    ? (['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.4)'] as const)
    : (['rgba(0,0,0,0)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.14)'] as const);
  const dividerRight = useLightFg
    ? (['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(0,0,0,0.14)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0)'] as const);

  if (!phone) {
    return null;
  }

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

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Pressable
          style={[styles.flex, { minHeight: Math.max(Dimensions.get('window').height - insets.top - insets.bottom, 480) }]}
          onPress={() => {}}
          accessible={false}
        >
          <View style={[styles.body, { paddingBottom: bottomPad }]}>
            <LoginEntranceSection delayMs={0} style={styles.headerBlock}>
              <Text style={[styles.heroTitle, { color: heroText }]} numberOfLines={2} accessibilityRole="header">
                {t('login.otp.heroTitle', 'רק עוד צעד קטן')}
              </Text>
              <Text style={[styles.hint, { color: heroMuted }]} numberOfLines={4}>
                {t('login.otp.passcodeHint', 'הזן את הקוד בן 6 הספרות שנשלח ב-SMS')}
              </Text>
            </LoginEntranceSection>

            <LoginEntranceSection delayMs={220} style={styles.keypadBlock}>
              <OtpPasscodeKeypad
                passcode={passcode}
                onKey={handleKey}
                busy={busy}
                disabled={busy || isLoginLocked}
                useLightFg={useLightFg}
                primary={primary}
                heroText={heroText}
                heroFaint={heroFaint}
                shakeDotsStyle={shakeDotsStyle}
                deleteA11yLabel={t('login.otp.a11y.delete', 'מחק')}
              />
            </LoginEntranceSection>

            <LoginEntranceSection delayMs={420} style={styles.footerActions}>
              <TouchableOpacity
                onPress={handleResend}
                disabled={busy || otpCooldownSec > 0 || isLoginLocked}
                style={styles.resendWrap}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.resendText,
                    {
                      color:
                        otpCooldownSec > 0 || isLoginLocked ? heroMuted : useLightFg ? '#FFFFFF' : primary,
                    },
                  ]}
                >
                  {otpCooldownSec > 0
                    ? t('login.otp.resendWait', 'שלח שוב בעוד {{s}} שניות', { s: otpCooldownSec })
                    : t('login.otp.resend', 'שלח קוד מחדש')}
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerOrnament} accessibilityElementsHidden>
                <LinearGradient
                  colors={[...dividerLeft]}
                  locations={[0, 0.65, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.dividerGrad}
                />
                <View
                  style={[
                    styles.dividerGem,
                    {
                      borderColor: primary,
                      backgroundColor: useLightFg ? 'rgba(255,255,255,0.2)' : '#FFFFFF',
                    },
                  ]}
                />
                <LinearGradient
                  colors={[...dividerRight]}
                  locations={[0, 0.35, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.dividerGrad}
                />
              </View>

              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.changePhoneWrap}
                hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel={t('login.otp.changePhone', 'שינוי מספר טלפון')}
              >
                <Text style={[styles.changePhoneText, { color: useLightFg ? '#FFFFFF' : primary }]}>
                  {t('login.otp.changePhone', 'שינוי מספר טלפון')}
                </Text>
              </TouchableOpacity>
            </LoginEntranceSection>

            {isLoginLocked ? (
              <Text style={[styles.lockBanner, { color: businessColors.warning }]}>{t('login.lockedHint', 'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.')}</Text>
            ) : null}
          </View>
        </Pressable>
      </SafeAreaView>

      {/* Last in tree + high z-index/elevation so it draws above BlurView / SafeArea (same pattern as login). */}
      <Animated.View
        pointerEvents="none"
        collapsable={false}
        style={[styles.resendToastWrap, styles.resendToastWrapOnTop, { paddingTop: insets.top + 10 }, resendToastStyle]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <View style={styles.resendToastPill}>
          <View style={styles.resendToastRow}>
            <View
              style={[styles.resendToastDot, { backgroundColor: businessColors.success }]}
              accessibilityElementsHidden
            />
            <Text style={styles.resendToastText} key={resendToastTick}>
              {t('login.otp.resendSuccessTag', 'קוד נשלח מחדש בהצלחה')}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  resendToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  resendToastWrapOnTop: {
    zIndex: 9999,
    ...Platform.select({
      android: { elevation: 24 },
      default: {},
    }),
  },
  resendToastPill: {
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
  resendToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: '100%',
  },
  resendToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  resendToastText: {
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
  flex: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 12,
    width: '100%',
    maxWidth: WINDOW_WIDTH,
    alignSelf: 'center',
  },
  headerBlock: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  keypadBlock: {
    width: '100%',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    lineHeight: 30,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  hint: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  footerActions: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  resendWrap: {
    paddingVertical: 10,
  },
  resendText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  dividerOrnament: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 280,
    marginVertical: 6,
    gap: 12,
  },
  dividerGrad: {
    flex: 1,
    height: 1.5,
    maxHeight: 1.5,
    borderRadius: 1,
  },
  dividerGem: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  changePhoneWrap: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  changePhoneText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  lockBanner: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
});
