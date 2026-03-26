import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Keyboard,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Phone, User, Hash, Calendar, Camera } from 'lucide-react-native';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/authStore';
import { isValidUserType } from '@/constants/auth';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { parseIsraeliMobileNational10 } from '@/lib/login/israeliMobilePhone';

const { height: SH } = Dimensions.get('window');

const REGISTER_PHONE_TOAST_HIDE_Y = -140;
const REGISTER_PHONE_TOAST_VISIBLE_MS = 3000;

type RegisterPhoneToastKind = 'invalid' | 'already_registered';

const palette = {
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  white: '#FFFFFF',
  success: '#059669',
};

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

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r + g + b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

type RegisterStep = 'phone' | 'otp' | 'profile';

function guessMimeFromUri(uriOrName: string): string {
  const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let outputLength = (clean.length / 4) * 3;
  if (clean.endsWith('==')) outputLength -= 2;
  else if (clean.endsWith('=')) outputLength -= 1;
  const bytes = new Uint8Array(outputLength);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = chars.indexOf(clean.charAt(i));
    const enc2 = chars.indexOf(clean.charAt(i + 1));
    const enc3 = chars.indexOf(clean.charAt(i + 2));
    const enc4 = chars.indexOf(clean.charAt(i + 3));
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    bytes[p++] = chr1;
    if (enc3 !== 64) bytes[p++] = chr2;
    if (enc4 !== 64) bytes[p++] = chr3;
  }
  return bytes;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d;
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();

  const [registerStep, setRegisterStep] = useState<RegisterStep>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [codeSentBanner, setCodeSentBanner] = useState(false);

  const [profileSetupToken, setProfileSetupToken] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [hasBirthDate, setHasBirthDate] = useState(false);
  const [pickerTempDate, setPickerTempDate] = useState(defaultBirthDate);
  const [showBirthModal, setShowBirthModal] = useState(false);
  const [showAndroidBirthPicker, setShowAndroidBirthPicker] = useState(false);

  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [registerPhoneToast, setRegisterPhoneToast] = useState<RegisterPhoneToastKind | null>(null);
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
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
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  const btnScale = useSharedValue(1);
  const btnScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const registerPhoneToastY = useSharedValue(REGISTER_PHONE_TOAST_HIDE_Y);
  const registerPhoneToastOpacity = useSharedValue(0);
  const registerPhoneToastStyle = useAnimatedStyle(() => ({
    opacity: registerPhoneToastOpacity.value,
    transform: [{ translateY: registerPhoneToastY.value }],
  }));

  useEffect(() => {
    if (!registerPhoneToast) {
      registerPhoneToastOpacity.value = withTiming(0, { duration: 180 });
      registerPhoneToastY.value = withTiming(REGISTER_PHONE_TOAST_HIDE_Y, {
        duration: 260,
        easing: Easing.in(Easing.cubic),
      });
      return;
    }
    registerPhoneToastY.value = REGISTER_PHONE_TOAST_HIDE_Y;
    registerPhoneToastOpacity.value = 0;
    registerPhoneToastY.value = withSpring(0, {
      damping: 19,
      stiffness: 280,
      mass: 0.85,
    });
    registerPhoneToastOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    const id = setTimeout(() => {
      registerPhoneToastOpacity.value = withTiming(0, {
        duration: 220,
        easing: Easing.in(Easing.quad),
      });
      registerPhoneToastY.value = withTiming(
        REGISTER_PHONE_TOAST_HIDE_Y,
        { duration: 300, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setRegisterPhoneToast)(null);
        },
      );
    }, REGISTER_PHONE_TOAST_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [registerPhoneToast, registerPhoneToastY, registerPhoneToastOpacity]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (otpCooldownSec <= 0) return;
    const id = setInterval(() => setOtpCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpCooldownSec]);

  const validateProfileStep = () => {
    const next: Record<string, string> = {};
    if (!profileName.trim()) {
      next.name = t('register.error.nameRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const registerOtpError = (code: string | undefined): string => {
    switch (code) {
      case 'pulseem_not_configured':
        return t(
          'login.otp.errorPulseem',
          'שליחת SMS לא הוגדרה: נדרשים מזהה משתמש, סיסמה ומספר שולח פולסים (Web Service) בעסק.',
        );
      case 'business_not_found':
        return t('login.otp.errorBusiness', 'מזהה העסק לא נמצא במסד.');
      case 'db_error':
      case 'server_error':
        return t('login.otp.errorServer', 'שגיאת שרת. נסו שוב מאוחר יותר.');
      case 'invoke_network':
        return t('login.otp.errorInvoke', 'לא ניתן להגיע לשרת. בדקו חיבור לאינטרנט.');
      case 'rate_limit_sends':
        return t('login.otp.errorRateLimit', 'נשלחו יותר מדי קודים. נסו שוב מאוחר יותר.');
      case 'sms_send_failed':
        return t('login.otp.errorSms', 'שליחת ה-SMS נכשלה.');
      case 'phone_registered':
        return t('register.phoneExists.message', 'מספר הטלפון כבר רשום במערכת.');
      case 'invalid_token':
      case 'token_expired':
        return t('register.error.sessionExpired', 'פג תוקף ההרשמה. התחילו מחדש.');
      case 'token_used':
        return t('register.error.tokenUsed', 'ההרשמה כבר הושלמה. התחברו עם הטלפון.');
      case 'invalid_birth_date':
        return t('register.error.birthInvalid', 'תאריך לידה לא תקין.');
      case 'update_failed':
        return t('register.error.updateFailed', 'שמירת הפרופיל נכשלה. נסו שוב.');
      case 'create_user_failed':
        return t('register.error.createUserFailed', 'יצירת החשבון נכשלה. נסו שוב.');
      case 'missing_user_payload':
        return t('register.error.sessionPayload', 'ההרשמה הצליחה אך לא התקבלו פרטי משתמש. התחברו עם הטלפון.');
      case 'missing_name':
        return t('register.error.nameRequired', 'נא להזין שם מלא');
      default:
        return code && code !== 'send_failed'
          ? `${t('common.retry', 'נסו שוב')} (${code})`
          : t('common.tryAgain', 'משהו השתבש. נסו שוב.');
    }
  };

  const handleSendRegisterOtp = async () => {
    const canonical = parseIsraeliMobileNational10(phone);
    if (!canonical) {
      setRegisterPhoneToast('invalid');
      return;
    }
    setPhone(canonical);
    setRegisterPhoneToast(null);
    setLoading(true);
    setCodeSentBanner(false);
    try {
      const alreadyRegistered = await usersApi.hasUserWithPhoneForBusiness(canonical);
      if (alreadyRegistered === true) {
        setRegisterPhoneToast('already_registered');
        return;
      }
      if (alreadyRegistered === null) {
        Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
        return;
      }
      const res = await authPhoneOtpApi.sendRegisterOtp(canonical);
      if (!res.ok) {
        if (res.error === 'phone_registered') {
          setRegisterPhoneToast('already_registered');
        } else {
          Alert.alert(t('error.generic', 'שגיאה'), registerOtpError(res.error));
        }
        return;
      }
      setRegisterStep('otp');
      setOtpCode('');
      setOtpCooldownSec(45);
      setCodeSentBanner(true);
      setTimeout(() => setCodeSentBanner(false), 4000);
    } catch (e) {
      console.error('sendRegisterOtp', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndContinue = async () => {
    const digits = otpCode.replace(/\D/g, '');
    if (digits.length !== 6) {
      Alert.alert(t('error.generic', 'שגיאה'), t('login.otp.enterSix', 'הזינו קוד בן 6 ספרות'));
      return;
    }
    setLoading(true);
    try {
      const res = await authPhoneOtpApi.verifyRegisterOtp({
        phone: parseIsraeliMobileNational10(phone) ?? phone.trim(),
        code: digits,
      });
      if (!res.ok || !res.profileSetupToken || !res.user?.id) {
        Alert.alert(
          t('error.generic', 'שגיאה'),
          res.error === 'wrong_code' || res.error === 'no_active_code'
            ? t('login.otp.errorWrongCode', 'קוד שגוי או שפג תוקפו.')
            : res.error === 'too_many_attempts'
              ? t('login.otp.errorTooMany', 'יותר מדי ניסיונות שגויים.')
              : registerOtpError(res.error),
        );
        return;
      }
      setProfileSetupToken(res.profileSetupToken);
      setPendingUserId(res.user.id);
      setRegisterStep('profile');
      setProfileName('');
      setBirthDate(null);
      setHasBirthDate(false);
      setAvatarLocalUri(null);
      setAvatarBase64(null);
      setAvatarMime(null);
    } catch (error) {
      console.error('verifyRegisterOtp', error);
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
    } finally {
      setLoading(false);
    }
  };

  const uploadRegisterAvatar = async (
    userId: string,
    asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null },
  ): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;
      if (asset.base64) {
        fileBody = base64ToUint8Array(asset.base64);
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const fetched = await response.blob();
        fileBody = fetched;
        contentType = fetched.type || contentType;
      }
      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase().split(';')[0];
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `${userId}/reg_${Date.now()}_${randomId()}.${extGuess}`;
      let bucketUsed = 'avatars';
      const first = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, {
        contentType,
        upsert: false,
      });
      if (first.error) {
        const msg = String((first.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          bucketUsed = 'designs';
          const retry = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, {
            contentType,
            upsert: false,
          });
          if (retry.error) return null;
        } else return null;
      }
      const { data } = supabase.storage.from(bucketUsed).getPublicUrl(filePath);
      return data.publicUrl;
    } catch {
      return null;
    }
  };

  const pickAvatar = async () => {
    if (!pendingUserId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('profile.permissionRequired', 'נדרש אישור'),
        t('profile.permissionGallery', 'אנא אשרו גישה לגלריה'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: false,
      quality: 0.85,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0] as {
      uri: string;
      base64?: string | null;
      mimeType?: string | null;
      fileName?: string | null;
    };
    setAvatarLocalUri(a.uri);
    setAvatarBase64(a.base64 ?? null);
    setAvatarMime(a.mimeType ?? null);
  };

  const handleCompleteProfile = async () => {
    if (!validateProfileStep() || !profileSetupToken || !pendingUserId) return;
    setLoading(true);
    try {
      let imageUrl: string | null = null;
      if (avatarLocalUri) {
        const uploaded = await uploadRegisterAvatar(pendingUserId, {
          uri: avatarLocalUri,
          base64: avatarBase64,
          mimeType: avatarMime,
          fileName: null,
        });
        if (!uploaded) {
          Alert.alert(t('error.generic', 'שגיאה'), t('profile.uploadFailed', 'העלאת התמונה נכשלה'));
          setLoading(false);
          return;
        }
        imageUrl = uploaded;
      }

      const birthIso = hasBirthDate && birthDate ? toISODate(birthDate) : null;
      const res = await authPhoneOtpApi.completeRegisterProfile({
        profileSetupToken,
        name: profileName.trim(),
        birthDate: birthIso,
        imageUrl,
      });
      if (!res.ok || !res.user) {
        Alert.alert(t('error.generic', 'שגיאה'), registerOtpError(res.error));
        return;
      }

      const authUser = res.user;
      if (authUser.block) {
        Alert.alert(t('account.blocked', 'חשבון חסום'), t('login.blockedCannotSignIn', 'החשבון שלך חסום. פנה למנהל.'));
        return;
      }
      if (!isValidUserType(authUser.user_type)) {
        Alert.alert(t('error.generic', 'שגיאה'), t('login.invalidUserType', 'סוג משתמש לא תקין'));
        return;
      }

      const birthIsoForStore = hasBirthDate && birthDate ? toISODate(birthDate) : null;
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
        ...(birthIsoForStore ? { birth_date: birthIsoForStore } : {}),
      } as any;

      login(appUser);
      router.replace('/(client-tabs)');
    } catch (e) {
      console.error('completeRegisterProfile', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
    } finally {
      setLoading(false);
    }
  };

  const boxedFieldStyle = (focused: boolean) =>
    useLightFg
      ? {
          borderColor: focused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.32)',
          backgroundColor: focused ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
        }
      : {
          borderColor: focused ? primary : 'rgba(0,0,0,0.1)',
          backgroundColor: focused ? hexToRgba(primary, 0.06) : '#F7F7F7',
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

      {registerPhoneToast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.registerPhoneToastWrap,
            { paddingTop: insets.top + 10 },
            registerPhoneToastStyle,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.registerPhoneToastPill}>
            <View style={styles.registerPhoneToastRow}>
              <View
                style={[styles.registerPhoneToastDot, { backgroundColor: businessColors.error }]}
                accessibilityElementsHidden
              />
              <Text style={styles.registerPhoneToastText}>
                {registerPhoneToast === 'invalid'
                  ? t('register.phone.toastInvalid', 'המספר שהוזן אינו תקין')
                  : t('register.phone.toastAlreadyRegistered', 'מספר הטלפון הזה כבר רשום למערכת')}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAwareScreenScroll
          style={[styles.keyboardAvoid, { backgroundColor: 'transparent' }]}
          contentContainerStyle={[
            styles.scrollContainer,
            {
              backgroundColor: 'transparent',
              justifyContent: 'center',
              paddingVertical: 16,
            },
            isKeyboardVisible ? styles.scrollContainerCompact : null,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          removeClippedSubviews={false}
        >
          <View style={[styles.rtlRoot, { direction: isRtl ? 'rtl' : 'ltr' }]}>
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
              <View style={[styles.formZone, { paddingBottom: bottomPad + 32 }]}>
                <LoginEntranceSection key={registerStep} delayMs={0} style={styles.stepBody}>
                  {registerStep === 'phone' ? (
                    <>
                      <Text style={[styles.heroTitle, { color: heroText }]}>
                        {t('register.phone.title', 'מה מספר הטלפון שלך?')}
                      </Text>
                      <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                        {t('register.phone.subtitle', 'נשלח אליך קוד אימות ב-SMS כדי להשלים את ההרשמה.')}
                      </Text>
                      <View
                        style={[
                          styles.phoneOpenRow,
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
                          placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                          placeholderTextColor={heroFaint}
                          value={phone}
                          onChangeText={(text) => {
                            setPhone(text);
                            setRegisterPhoneToast(null);
                          }}
                          keyboardType="phone-pad"
                          autoCorrect={false}
                          onFocus={() => setPhoneFocused(true)}
                          onBlur={() => setPhoneFocused(false)}
                        />
                      </View>
                      <Text style={[styles.softHint, { color: heroMuted }]}>
                        {t('register.phone.hint', 'הקוד יגיע תוך שניות לנייד')}
                      </Text>
                    </>
                  ) : null}

                  {registerStep === 'otp' ? (
                    <>
                      <Text style={[styles.heroTitle, { color: heroText }]}>
                        {t('register.otp.title', 'הזינו את הקוד')}
                      </Text>
                      <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                        {t('register.otp.subtitle', 'שלחנו קוד בן 6 ספרות ל־{{phone}}', {
                          phone: phone.trim(),
                        })}
                      </Text>
                      {codeSentBanner ? (
                        <View
                          style={[
                            styles.bannerOk,
                            {
                              backgroundColor: useLightFg ? 'rgba(255,255,255,0.16)' : 'rgba(5, 150, 105, 0.12)',
                            },
                          ]}
                        >
                          <Ionicons name="checkmark-circle" size={18} color={palette.success} />
                          <Text style={[styles.bannerOkText, { color: heroText }]}>{t('register.otp.sentToast', 'הקוד נשלח בהצלחה')}</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.inputRow,
                          { flexDirection: isRtl ? 'row-reverse' : 'row' },
                          boxedFieldStyle(otpFocused),
                        ]}
                      >
                        <Hash
                          size={19}
                          color={
                            otpFocused
                              ? useLightFg
                                ? '#FFFFFF'
                                : primary
                              : useLightFg
                                ? heroFaint
                                : '#ABABAB'
                          }
                          strokeWidth={1.7}
                        />
                        <TextInput
                          style={[styles.input, styles.otpInput, { textAlign: isRtl ? 'right' : 'left', color: heroText }]}
                          placeholder="______"
                          placeholderTextColor={heroFaint}
                          value={otpCode}
                          onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          maxLength={6}
                          autoCorrect={false}
                          onFocus={() => setOtpFocused(true)}
                          onBlur={() => setOtpFocused(false)}
                        />
                      </View>
                      <TouchableOpacity onPress={() => setRegisterStep('phone')} style={styles.linkBtn}>
                        <Text style={[styles.linkText, { color: useLightFg ? '#FFFFFF' : primary }]}>
                          {t('register.otp.editPhone', 'שינוי מספר טלפון')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSendRegisterOtp}
                        disabled={loading || otpCooldownSec > 0}
                        style={styles.linkBtn}
                      >
                        <Text
                          style={[
                            styles.linkText,
                            {
                              color:
                                otpCooldownSec > 0 ? heroMuted : useLightFg ? '#FFFFFF' : primary,
                            },
                          ]}
                        >
                          {otpCooldownSec > 0
                            ? t('register.otp.resendWait', 'שליחה חוזרת בעוד {{s}} שניות', { s: otpCooldownSec })
                            : t('register.otp.resend', 'שלחו שוב')}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {registerStep === 'profile' ? (
                    <>
                      <Text style={[styles.heroTitle, { color: heroText }]}>
                        {t('register.profile.title', 'כמה פרטים אחרונים')}
                      </Text>
                      <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                        {t('register.profile.subtitle', 'כך נזהה אותך ונוכל לתת שירות מדויק יותר.')}
                      </Text>

                      <Text
                        style={[
                          styles.fieldLabelHero,
                          { color: heroMuted, textAlign: isRtl ? 'right' : 'left' },
                        ]}
                      >
                        {t('register.profile.nameLabel', 'שם מלא')} <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <View
                        style={[
                          styles.inputRow,
                          { flexDirection: isRtl ? 'row-reverse' : 'row' },
                          boxedFieldStyle(nameFocused),
                        ]}
                      >
                        <User
                          size={19}
                          color={
                            nameFocused
                              ? useLightFg
                                ? '#FFFFFF'
                                : primary
                              : useLightFg
                                ? heroFaint
                                : '#ABABAB'
                          }
                          strokeWidth={1.7}
                        />
                        <TextInput
                          style={[styles.input, { textAlign: isRtl ? 'right' : 'left', color: heroText }]}
                          placeholder={t('register.profile.namePlaceholder', 'למשל: יוסי כהן')}
                          placeholderTextColor={heroFaint}
                          value={profileName}
                          onChangeText={(text) => {
                            setProfileName(text);
                            if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                          }}
                          autoCorrect={false}
                          onFocus={() => setNameFocused(true)}
                          onBlur={() => setNameFocused(false)}
                        />
                      </View>
                      {errors.name ? (
                        <Text
                          style={[
                            styles.errorOnHero,
                            { color: businessColors.error, textAlign: isRtl ? 'right' : 'left' },
                          ]}
                        >
                          {errors.name}
                        </Text>
                      ) : null}

                      <Text
                        style={[
                          styles.fieldLabelHero,
                          { color: heroMuted, textAlign: isRtl ? 'right' : 'left' },
                        ]}
                      >
                        {t('register.profile.birthLabel', 'תאריך לידה')}{' '}
                        <Text style={styles.optionalOnHero}>({t('register.profile.birthOptional', 'לא חובה')})</Text>
                      </Text>
                      <View style={[styles.rowActions, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                        <TouchableOpacity
                          style={[
                            styles.secondaryBtn,
                            {
                              borderColor: useLightFg ? 'rgba(255,255,255,0.55)' : primary,
                              backgroundColor: useLightFg ? 'rgba(255,255,255,0.1)' : 'transparent',
                            },
                          ]}
                          onPress={() => {
                            setPickerTempDate(birthDate ?? defaultBirthDate());
                            if (Platform.OS === 'android') {
                              setShowAndroidBirthPicker(true);
                            } else {
                              setShowBirthModal(true);
                            }
                          }}
                        >
                          <Calendar
                            size={18}
                            color={useLightFg ? '#FFFFFF' : primary}
                            strokeWidth={1.8}
                          />
                          <Text
                            style={[
                              styles.secondaryBtnText,
                              { color: useLightFg ? '#FFFFFF' : primary },
                            ]}
                          >
                            {hasBirthDate && birthDate
                              ? birthDate.toLocaleDateString('he-IL')
                              : t('register.profile.birthPick', 'בחירת תאריך')}
                          </Text>
                        </TouchableOpacity>
                        {hasBirthDate ? (
                          <TouchableOpacity
                            style={styles.textGhostBtn}
                            onPress={() => {
                              setHasBirthDate(false);
                              setBirthDate(null);
                            }}
                          >
                            <Text style={[styles.textGhost, { color: heroMuted }]}>
                              {t('register.profile.birthClear', 'ללא תאריך')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.fieldLabelHero,
                          { marginTop: 18, color: heroMuted, textAlign: isRtl ? 'right' : 'left' },
                        ]}
                      >
                        {t('register.profile.photoLabel', 'תמונת פרופיל')}{' '}
                        <Text style={styles.optionalOnHero}>({t('register.profile.photoOptional', 'לא חובה')})</Text>
                      </Text>
                      <TouchableOpacity style={styles.avatarCard} onPress={pickAvatar} activeOpacity={0.85}>
                        {avatarLocalUri ? (
                          <Image source={{ uri: avatarLocalUri }} style={styles.avatarPreview} />
                        ) : (
                          <View
                            style={[
                              styles.avatarPlaceholder,
                              {
                                backgroundColor: useLightFg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)',
                                borderColor: useLightFg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)',
                              },
                            ]}
                          >
                            <Camera
                              size={36}
                              color={useLightFg ? heroFaint : palette.textSecondary}
                              strokeWidth={1.5}
                            />
                          </View>
                        )}
                        <Text style={[styles.avatarHint, { color: useLightFg ? '#FFFFFF' : primary }]}>
                          {avatarLocalUri
                            ? t('register.profile.photoChange', 'החלפת תמונה')
                            : t('register.profile.photoAdd', 'הוספת תמונה')}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </LoginEntranceSection>

                <LoginEntranceSection delayMs={420} style={styles.btnWrap}>
                  <Animated.View style={btnScaleStyle}>
                    <TouchableOpacity
                      onPressIn={() => {
                        btnScale.value = withTiming(0.97, { duration: 90 });
                      }}
                      onPressOut={() => {
                        btnScale.value = withSpring(1, { damping: 16, stiffness: 280 });
                      }}
                      onPress={() => {
                        if (registerStep === 'phone') handleSendRegisterOtp();
                        else if (registerStep === 'otp') handleVerifyOtpAndContinue();
                        else handleCompleteProfile();
                      }}
                      disabled={loading}
                      activeOpacity={1}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: loading }}
                    >
                      <View
                        style={[
                          styles.btnOuter,
                          useLightFg ? styles.btnOuterElevated : null,
                          loading && styles.btnOuterDisabled,
                          {
                            backgroundColor: ctaElevatedBg,
                            borderWidth: useLightFg ? 1 : StyleSheet.hairlineWidth * 2,
                            borderColor: ctaElevatedBorder,
                          },
                        ]}
                      >
                        {loading ? (
                          <ActivityIndicator color={ctaElevatedLabel} size="small" />
                        ) : (
                          <Text style={[styles.btnText, { color: ctaElevatedLabel }]}>
                            {registerStep === 'phone'
                              ? t('register.phone.cta', 'שלחו לי קוד')
                              : registerStep === 'otp'
                                ? t('register.otp.cta', 'אמתו והמשיכו')
                                : t('register.profile.cta', 'סיום הרשמה')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                </LoginEntranceSection>

                <LoginEntranceSection delayMs={560} style={styles.linksWrap}>
                  <View style={[styles.registerRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                    <Text style={[styles.footerMuted, { color: heroMuted }]}>
                      {t('register.haveAccount', 'כבר יש לך חשבון?')}
                    </Text>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} onPress={() => router.push('/login')}>
                      <Text style={[styles.footerAction, { color: useLightFg ? '#FFFFFF' : primary }]}>
                        {t('auth.signInNow', 'התחברות')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </LoginEntranceSection>
              </View>
            </Pressable>
          </View>
        </KeyboardAwareScreenScroll>
      </SafeAreaView>

      <Modal visible={showBirthModal} transparent animationType="fade" onRequestClose={() => setShowBirthModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowBirthModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('register.profile.birthLabel', 'תאריך לידה')}</Text>
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={pickerTempDate}
                mode="date"
                display="spinner"
                themeVariant="light"
                textColor={palette.textPrimary}
                locale="he-IL"
                maximumDate={new Date()}
                minimumDate={new Date(1920, 0, 1)}
                onChange={(_, d) => {
                  if (d) setPickerTempDate(d);
                }}
              />
            </View>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: businessColors.primary }]}
              onPress={() => {
                setBirthDate(pickerTempDate);
                setHasBirthDate(true);
                setShowBirthModal(false);
              }}
            >
              <Text style={styles.modalPrimaryBtnText}>{t('register.profile.pickerDone', 'סיום')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowBirthModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>{t('register.profile.pickerCancel', 'ביטול')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {Platform.OS === 'android' && showAndroidBirthPicker ? (
        <DateTimePicker
          value={pickerTempDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          onChange={(event, date) => {
            setShowAndroidBirthPicker(false);
            if (event.type === 'set' && date) {
              setBirthDate(date);
              setHasBirthDate(true);
              setPickerTempDate(date);
            }
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  registerPhoneToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 50,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  registerPhoneToastPill: {
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
  registerPhoneToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: '100%',
  },
  registerPhoneToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  registerPhoneToastText: {
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
  rtlRoot: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: 8 },
  scrollContainerCompact: { flexGrow: 0 },
  dismissKeyboardArea: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
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
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  fieldLabelHero: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
    alignSelf: 'stretch',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  reqStar: { color: '#DC2626' },
  optionalOnHero: { fontWeight: '500', fontSize: 13 },
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
    borderWidth: 1,
    width: '100%',
    alignSelf: 'center',
    gap: 11,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  otpInput: {
    fontSize: 22,
    letterSpacing: 4,
    fontWeight: '700',
  },
  softHint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
  },
  errorOnHero: {
    fontSize: 13,
    marginTop: 6,
    width: '100%',
  },
  bannerOk: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  bannerOkText: { fontSize: 14, fontWeight: '600', marginRight: 8 },
  linkBtn: { marginTop: 10, alignSelf: 'center' },
  linkText: { fontSize: 15, fontWeight: '600' },
  rowActions: { alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  secondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', marginRight: 8 },
  textGhostBtn: { paddingVertical: 8 },
  textGhost: { fontSize: 14, fontWeight: '600' },
  avatarCard: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  avatarPreview: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarHint: { marginTop: 10, fontSize: 15, fontWeight: '700' },
  btnWrap: {
    marginTop: 10,
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
  },
  registerRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
    rowGap: 4,
  },
  footerMuted: {
    fontSize: 14,
  },
  footerAction: {
    fontWeight: '700',
    fontSize: 14,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    color: palette.textPrimary,
  },
  datePickerWrap: { alignItems: 'center' },
  modalPrimaryBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalCancelBtn: { marginTop: 12, paddingVertical: 8 },
  modalCancelText: { textAlign: 'center', color: palette.textSecondary, fontWeight: '600', fontSize: 15 },
});
