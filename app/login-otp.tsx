import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { MotiView } from 'moti';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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

const { width: WINDOW_WIDTH } = Dimensions.get('window');

const LOGIN_HEADER_CONTENT_H = 52;
const PASSCODE_LENGTH = 6;

type KeyId = number | 'space' | 'delete';

/** Phone-style 3×4 grid; `direction: 'ltr'` on container avoids RTL flexWrap bugs. */
const KEYPAD_ROWS: KeyId[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['space', 0, 'delete'],
];

function parsePhoneParam(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return '';
}

export default function LoginOtpScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 20);
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string | string[] }>();
  const phone = useMemo(() => parsePhoneParam(phoneParam), [phoneParam]);

  const login = useAuthStore((state) => state.login);
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

  const primary = businessColors.primary;
  const onPrimary = readableOnHex(primary);

  const [passcode, setPasscode] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const verifyInFlight = useRef(false);

  const shakeX = useSharedValue(0);
  const shakeDotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  /** One-shot shake on wrong code — avoids Moti replaying on every passcode re-render. */
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

  /** Body uses paddingHorizontal 26 — keypad fills that inner width */
  const keypadInnerW = WINDOW_WIDTH - 52;
  const colGap = 12;
  const keyW = Math.floor((keypadInnerW - 2 * colGap) / 3);
  const keyH = Math.min(56, Math.round(keyW * 0.95));
  const dotGap = 10;
  const dotSize = Math.min(
    46,
    (WINDOW_WIDTH - 52 - dotGap * (PASSCODE_LENGTH - 1)) / PASSCODE_LENGTH,
  );

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

  const handleKey = (key: KeyId) => {
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
        Alert.alert(t('error.generic', 'שגיאה'), otpErrorMessage(t, res.error));
        return;
      }
      setOtpCooldownSec(45);
      setPasscode([]);
      Alert.alert(
        t('login.otp.sentTitle', 'קוד נשלח'),
        t(
          'login.otp.sentBody',
          'אם המספר רשום אצלנו, תקבל הודעת SMS עם קוד אימות. הזן אותו למטה.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!phone) {
    return null;
  }

  return (
    <View style={styles.root}>
      <StatusBar style={onPrimary === '#FFFFFF' ? 'light' : 'dark'} />

      <View style={[styles.screenHeader, { backgroundColor: primary, paddingTop: insets.top }]}>
        <View style={styles.screenHeaderInner}>
          <Text style={[styles.screenHeaderTitle, { color: onPrimary }]} numberOfLines={1}>
            {t('login.otp.title', 'קוד אימות')}
          </Text>
        </View>
      </View>

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Pressable style={styles.flex} onPress={() => {}} accessible={false}>
          <View style={[styles.body, { paddingBottom: bottomPad }]}>
            <Text
              style={[styles.heroTitle, { color: businessColors.text }]}
              numberOfLines={2}
              accessibilityRole="header"
            >
              {t('login.otp.heroTitle', 'רק עוד צעד קטן')}
            </Text>
            <View style={[styles.heroAccent, { backgroundColor: primary }]} />
            <Text
              style={[styles.hint, { color: businessColors.textSecondary }]}
              numberOfLines={3}
            >
              {t('login.otp.passcodeHint', 'הזן את הקוד בן 6 הספרות שנשלח ב-SMS')}
            </Text>

            <Animated.View style={[styles.dotsRow, shakeDotsStyle, { gap: dotGap }]}>
              {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
                <View
                  key={`slot-${i}`}
                  style={[
                    styles.dotOuter,
                    {
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotSize / 2,
                    },
                  ]}
                >
                  {passcode[i] !== undefined && (
                    <MotiView
                      from={{ scale: 0.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: 'timing',
                        duration: 220,
                        easing: Easing.out(Easing.back(1.2)),
                      }}
                      style={[
                        styles.dotInner,
                        {
                          backgroundColor: primary,
                          borderRadius: dotSize / 2,
                        },
                      ]}
                    >
                      <Text style={[styles.dotDigit, { fontSize: dotSize * 0.42 }]}>
                        {String(passcode[i])}
                      </Text>
                    </MotiView>
                  )}
                </View>
              ))}
            </Animated.View>

            {busy ? (
              <ActivityIndicator style={styles.spinner} color={primary} />
            ) : (
              <View style={{ height: 36 }} />
            )}

            <View style={[styles.keypad, { width: keypadInnerW }]}>
              {KEYPAD_ROWS.map((row, rowIndex) => (
                <View
                  key={`row-${rowIndex}`}
                  style={[
                    styles.keypadRow,
                    {
                      width: keypadInnerW,
                      marginBottom: rowIndex < KEYPAD_ROWS.length - 1 ? 8 : 0,
                      gap: colGap,
                    },
                  ]}
                >
                  {row.map((key, colIndex) => {
                    if (key === 'space') {
                      return (
                        <View
                          key={`sp-${rowIndex}-${colIndex}`}
                          style={{ width: keyW, height: keyH }}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        />
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={`${rowIndex}-${String(key)}`}
                        onPress={() => handleKey(key)}
                        disabled={busy || isLoginLocked}
                        style={[styles.keyCell, { width: keyW, height: keyH }]}
                        accessibilityRole="keyboardkey"
                        accessibilityLabel={
                          key === 'delete'
                            ? t('login.otp.a11y.delete', 'מחק')
                            : String(key)
                        }
                      >
                        {key === 'delete' ? (
                          <MaterialCommunityIcons
                            name="keyboard-backspace"
                            size={34}
                            color="rgba(0,0,0,0.38)"
                          />
                        ) : (
                          <Text style={styles.keyText}>{key}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.footerActions}>
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
                        otpCooldownSec > 0 || isLoginLocked
                          ? businessColors.textSecondary
                          : primary,
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
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.14)']}
                  locations={[0, 0.65, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.dividerGrad}
                />
                <View style={[styles.dividerGem, { borderColor: primary }]} />
                <LinearGradient
                  colors={['rgba(0,0,0,0.14)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0)']}
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
                <Text style={[styles.changePhoneText, { color: primary }]}>
                  {t('login.otp.changePhone', 'שינוי מספר טלפון')}
                </Text>
              </TouchableOpacity>
            </View>

            {isLoginLocked ? (
              <Text style={[styles.lockBanner, { color: businessColors.warning }]}>
                {t('login.lockedHint', 'התחברות למספר טלפון זה חסמה עקב ניסיונות שגויים חוזרים.')}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 28,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.35,
    lineHeight: 32,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  heroAccent: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
    opacity: 0.92,
  },
  hint: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    // RTL app: first digit must appear in leftmost slot (index 0 = visual left)
    direction: 'ltr',
  },
  dotOuter: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dotInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDigit: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  spinner: {
    marginVertical: 8,
  },
  keypad: {
    marginTop: 8,
    alignSelf: 'center',
    // Force standard dial-pad order on Hebrew RTL screens
    direction: 'ltr',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  keyCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  keyText: {
    color: '#111',
    fontSize: 28,
    fontWeight: '700',
  },
  footerActions: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
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
    backgroundColor: '#FFFFFF',
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
