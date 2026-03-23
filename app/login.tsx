import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  useSharedValue,
  interpolate,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
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
import { useTranslation } from 'react-i18next';

const { width: SW, height: SH } = Dimensions.get('window');

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
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const login = useAuthStore((state) => state.login);
  const { isAuthenticated, user } = useAuthStore();
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

  const primary = businessColors.primary;

  // ── Keyboard ──
  const keyboard = useAnimatedKeyboard();
  const formLiftStyle = useAnimatedStyle(() => {
    const raw = keyboard.height.value;
    const offset = Math.max(raw - insets.bottom, 0);
    return {
      transform: [{ translateY: withTiming(raw > 0 ? -(offset * 0.3) : 0, { duration: 220 }) }],
    };
  });

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

  useEffect(() => {}, [isAuthenticated, user]);

  // ── Login handler ──
  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert(t('error.generic', 'שגיאה'), t('login.fillAll', 'יש למלא את כל השדות'));
      return;
    }
    setIsLoading(true);
    try {
      if (superAdminApi.verifySuperAdmin(phone.trim(), password)) {
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
          Alert.alert(t('account.blocked', 'חשבון חסום'), t('login.blockedCannotSignIn', 'החשבון שלך חסום. פנה למנהל.'));
          return;
        }
        if (!isValidUserType(authUser.user_type)) {
          Alert.alert(t('error.generic', 'שגיאה'), t('login.invalidUserType', 'סוג משתמש לא תקין'));
          return;
        }
        const appUser = {
          id: authUser.id, phone: authUser.phone,
          type: authUser.user_type, name: authUser.name,
          email: authUser.email ?? null, image_url: authUser.image_url ?? null,
          user_type: authUser.user_type, block: (authUser as any)?.block ?? false,
        } as any;
        login(appUser);
        router.replace(appUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
      } else {
        const businessId = getBusinessId();
        const { data: other } = await supabase.from('users').select('*')
          .eq('phone', phone.trim()).neq('business_id', businessId).single();
        if (other) {
          Alert.alert(t('error.generic', 'שגיאה'), t('login.incorrectCredentials', 'טלפון או סיסמה שגויים'));
          return;
        }
        const demoUser = findUserByCredentials(phone.trim(), password);
        if (demoUser) {
          login(demoUser);
          router.replace(demoUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
        } else {
          Alert.alert(t('error.generic', 'שגיאה'), t('login.incorrectCredentials', 'טלפון או סיסמה שגויים'));
        }
      }
    } catch {
      const demoUser = findUserByCredentials(phone.trim(), password);
      if (demoUser) {
        login(demoUser);
        router.replace(demoUser.type === 'admin' ? '/(tabs)' : '/(client-tabs)');
      } else {
        Alert.alert(t('error.generic', 'שגיאה'), t('login.incorrectCredentials', 'טלפון או סיסמה שגויים'));
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
          color={hexToRgba(primary, 0.22)}
          driftMs={5000} delayMs={0} driftX={50} driftY={40}
        />
        <DriftingCircle
          size={260} left={SW * 0.5} top={SH * 0.05}
          color={hexToRgba(shiftHex(primary, 30), 0.18)}
          driftMs={6200} delayMs={700} driftX={-45} driftY={55}
        />
        <DriftingCircle
          size={200} left={-40} top={SH * 0.3}
          color={hexToRgba(shiftHex(primary, -20), 0.16)}
          driftMs={4800} delayMs={1200} driftX={60} driftY={-35}
        />
        <DriftingCircle
          size={150} left={SW * 0.65} top={SH * 0.38}
          color={hexToRgba(shiftHex(primary, 50), 0.14)}
          driftMs={5500} delayMs={400} driftX={-30} driftY={-50}
        />
        <DriftingCircle
          size={100} left={SW * 0.2} top={SH * 0.55}
          color={hexToRgba(primary, 0.12)}
          driftMs={4200} delayMs={1800} driftX={40} driftY={30}
        />
      </View>

      {/* ── Content (no BlurView — fixes Android keyboard / focus) ─────── */}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >

          {/* Logo top section */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.logoSection}>
            <Animated.View style={logoFloatStyle}>
              {/* Glow behind logo */}
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
          </Animated.View>

          {/* ── Light form card (solid View — TextInput focus works everywhere) ─ */}
          <Animated.View
            style={[styles.cardWrapper, formLiftStyle]}
            entering={FadeInUp.delay(200).springify()}
          >
            <View style={[styles.card, { paddingBottom: bottomPad + 8 }]}>
              {/* Top accent line */}
              <View style={[styles.accentLine, { backgroundColor: hexToRgba(primary, 0.8) }]} />

              {/* Header */}
              <Animated.View entering={FadeIn.delay(380)} style={styles.header}>
                <Text style={styles.titleText}>
                  {t('login.form.title', 'כניסה לחשבון')}
                </Text>
                <Text style={styles.subtitleText}>
                  {t('login.form.subtitle', 'הכנס את הפרטים שלך כדי להמשיך')}
                </Text>
              </Animated.View>

              {/* Phone field */}
              <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.fieldWrap}>
                <View style={[
                  styles.inputRow,
                  phoneFocused && {
                    borderColor: primary,
                    borderWidth: 1.8,
                    shadowColor: primary,
                    shadowOpacity: 0.35,
                    shadowRadius: 10,
                    elevation: 6,
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
                    editable
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                </View>
              </Animated.View>

              {/* Password field */}
              <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.fieldWrap}>
                <View style={[
                  styles.inputRow,
                  passFocused && {
                    borderColor: primary,
                    borderWidth: 1.8,
                    shadowColor: primary,
                    shadowOpacity: 0.35,
                    shadowRadius: 10,
                    elevation: 6,
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
                    editable
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
              </Animated.View>

              {/* Login button */}
              <Animated.View
                entering={FadeInUp.delay(700).springify()}
                style={btnAnimStyle}
              >
                <TouchableOpacity
                  onPressIn={() => { btnScale.value = withTiming(0.96, { duration: 80 }); }}
                  onPressOut={() => { btnScale.value = withSpring(1, { damping: 12, stiffness: 220 }); }}
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={1}
                >
                  <View style={styles.btnOuter}>
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
                          : t('login.cta.signIn', 'כניסה')}
                      </Text>
                    </LinearGradient>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Links */}
              <Animated.View entering={FadeIn.delay(820)} style={styles.linksWrap}>
                <TouchableOpacity onPress={() => setIsForgotOpen(true)} hitSlop={{ top: 8, bottom: 8 }}>
                  <Text style={[styles.forgotText, { color: '#6B7280' }]}>
                    {t('login.forgotPassword', 'שכחת סיסמה?')}
                  </Text>
                </TouchableOpacity>

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
              </Animated.View>

            </View>
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Forgot Password Modal ────────────────────────────────────────── */}
      {isForgotOpen && (
        <Animated.View style={styles.modalOverlay} entering={FadeIn.duration(200)}>
          <Animated.View style={styles.modalCard} entering={FadeInUp.delay(60).springify()}>

            {/* Colored top stripe */}
            <LinearGradient
              colors={[shiftHex(primary, 40), primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalStripe}
            />

            <View style={styles.modalBody}>
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
            </View>
          </Animated.View>
        </Animated.View>
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
    justifyContent: 'flex-end',
  },

  // ── Logo ──
  logoSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 18,
    paddingTop: 20,
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

  // ── Light card ──
  cardWrapper: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  card: {
    paddingHorizontal: 24,
    paddingTop: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
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
