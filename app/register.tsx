import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Phone, User, Calendar, Camera, RotateCcw } from 'lucide-react-native';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '@/lib/i18nLocale';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/authStore';
import { isValidUserType } from '@/constants/auth';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import { OtpPasscodeKeypad, type OtpKeyId } from '@/components/login/OtpPasscodeKeypad';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { parseIsraeliMobileNational10 } from '@/lib/login/israeliMobilePhone';
import { businessProfileApi, isClientApprovalRequired } from '@/lib/api/businessProfile';
import { PendingApprovalAnimatedModal } from '@/components/login/PendingApprovalAnimatedModal';
import { shouldDenyClientSession } from '@/lib/utils/clientApproval';

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
  const [otpPasscode, setOtpPasscode] = useState<number[]>([]);
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
  const [nameFocused, setNameFocused] = useState(false);
  const [registerPhoneToast, setRegisterPhoneToast] = useState<RegisterPhoneToastKind | null>(null);
  const [pendingApprovalUi, setPendingApprovalUi] = useState<{
    visible: boolean;
    phone: string;
    key: number;
  }>({ visible: false, phone: '', key: 0 });
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isRtl = isRtlLanguage(i18n.language);

  const primary = businessColors.primary;
  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.86)' : 'rgba(17,24,39,0.74)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.42)' : 'rgba(17,24,39,0.52)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(17,24,39,0.38)';
  /** Pastel `primary` on a light gradient: raw primary is illegible for links, placeholders, icons. */
  const accentInk = useMemo(() => (useLightFg ? '#FFFFFF' : darkenHex(primary, 0.52)), [useLightFg, primary]);
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : accentInk;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  const btnScale = useSharedValue(1);
  const btnScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const verifyRegisterOtpInFlight = useRef(false);
  const registerOtpShakeX = useSharedValue(0);
  const registerOtpShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: registerOtpShakeX.value }],
  }));
  const triggerRegisterOtpShake = useCallback(() => {
    const step = { duration: 42, easing: Easing.linear };
    registerOtpShakeX.value = withSequence(
      withTiming(-9, step),
      withTiming(9, step),
      withTiming(-7, step),
      withTiming(7, step),
      withTiming(0, { duration: 48, easing: Easing.out(Easing.quad) }),
    );
  }, [registerOtpShakeX]);

  const registerOtpDividerLeft = useLightFg
    ? (['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.4)'] as const)
    : (['rgba(0,0,0,0)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.14)'] as const);
  const registerOtpDividerRight = useLightFg
    ? (['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(0,0,0,0.14)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0)'] as const);

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
      if (res.warning === 'sender_same_as_recipient') {
        Alert.alert(
          t('register.otp.sameNumberAsSenderTitle', 'אותו מספר שולח ונמען'),
          t(
            'register.otp.sameNumberAsSenderMessage',
            'ביקשת קוד למספר הטלפון של העסק (ממנו נשלחות הודעות ה-SMS). רשתות נייד לרוב חוסמות הודעה כשהשולח והנמען זהים. נסה ממספר אחר, או בקש מפולסים שולח ייעודי.',
          ),
        );
      }
      // Fresh SMS round: drop any stale profile-completion session from a previous attempt
      setProfileSetupToken('');
      setPendingUserId(null);
      setRegisterStep('otp');
      setOtpPasscode([]);
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

  const runRegisterVerifyOtp = useCallback(
    async (digits: string) => {
      if (digits.length !== 6 || verifyRegisterOtpInFlight.current) return;
      verifyRegisterOtpInFlight.current = true;
      setLoading(true);
      try {
        const res = await authPhoneOtpApi.verifyRegisterOtp({
          phone: parseIsraeliMobileNational10(phone) ?? phone.trim(),
          code: digits,
        });
        if (!res.ok || !res.profileSetupToken || !res.user?.id) {
          setOtpPasscode([]);
          triggerRegisterOtpShake();
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
        setOtpPasscode([]);
      } catch (error) {
        console.error('verifyRegisterOtp', error);
        setOtpPasscode([]);
        triggerRegisterOtpShake();
        Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
      } finally {
        setLoading(false);
        verifyRegisterOtpInFlight.current = false;
      }
    },
    [phone, t, triggerRegisterOtpShake],
  );

  useEffect(() => {
    if (registerStep !== 'otp') return;
    const digits = otpPasscode.join('');
    if (digits.length !== 6) return;
    void runRegisterVerifyOtp(digits);
  }, [otpPasscode, registerStep, runRegisterVerifyOtp]);

  const handleRegisterOtpKey = (key: OtpKeyId) => {
    if (loading) return;
    if (key === 'delete') {
      setOtpPasscode((p) => (p.length === 0 ? p : p.slice(0, -1)));
      return;
    }
    if (key === 'space') return;
    if (otpPasscode.length >= 6) return;
    setOtpPasscode((p) => [...p, key as number]);
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

  const openBirthPicker = useCallback(() => {
    setPickerTempDate(birthDate ?? defaultBirthDate());
    if (Platform.OS === 'android') {
      setShowAndroidBirthPicker(true);
    } else {
      setShowBirthModal(true);
    }
  }, [birthDate]);

  const profileBirthParts = useMemo(() => {
    if (!hasBirthDate || !birthDate) return { d: '', m: '', y: '' };
    return {
      d: String(birthDate.getDate()).padStart(2, '0'),
      m: String(birthDate.getMonth() + 1).padStart(2, '0'),
      y: String(birthDate.getFullYear()),
    };
  }, [hasBirthDate, birthDate]);

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

      const profile = await businessProfileApi.getProfile();
      if (shouldDenyClientSession(isClientApprovalRequired(profile), authUser)) {
        setPendingApprovalUi((s) => ({
          visible: true,
          phone: authUser.phone ?? '',
          key: s.key + 1,
        }));
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
        language: authUser.language ?? null,
        ...(birthIsoForStore ? { birth_date: birthIsoForStore } : {}),
      } as any;

      login(appUser);
      router.replace('/(client-tabs)/index' as any);
    } catch (e) {
      console.error('completeRegisterProfile', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
    } finally {
      setLoading(false);
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
                      <OtpPasscodeKeypad
                        passcode={otpPasscode}
                        onKey={handleRegisterOtpKey}
                        busy={loading}
                        disabled={loading}
                        useLightFg={useLightFg}
                        primary={primary}
                        heroText={heroText}
                        heroFaint={heroFaint}
                        shakeDotsStyle={registerOtpShakeStyle}
                        deleteA11yLabel={t('login.otp.a11y.delete', 'מחק')}
                      />
                      <View style={styles.registerOtpFooter}>
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
                                  otpCooldownSec > 0 ? heroMuted : accentInk,
                              },
                            ]}
                          >
                            {otpCooldownSec > 0
                              ? t('register.otp.resendWait', 'שליחה חוזרת בעוד {{s}} שניות', { s: otpCooldownSec })
                              : t('register.otp.resend', 'שלחו שוב')}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.dividerOrnament} accessibilityElementsHidden>
                          <LinearGradient
                            colors={[...registerOtpDividerLeft]}
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
                            colors={[...registerOtpDividerRight]}
                            locations={[0, 0.35, 1]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.dividerGrad}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            setRegisterStep('phone');
                            setOtpPasscode([]);
                            setCodeSentBanner(false);
                            setProfileSetupToken('');
                            setPendingUserId(null);
                          }}
                          style={styles.linkBtn}
                        >
                          <Text style={[styles.linkText, { color: accentInk }]}>
                            {t('register.otp.editPhone', 'שינוי מספר טלפון')}
                          </Text>
                        </TouchableOpacity>
                      </View>
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

                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={pickAvatar}
                        style={[
                          styles.profileAvatarZone,
                          {
                            borderColor: useLightFg ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.1)',
                            backgroundColor: useLightFg ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.78)',
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          avatarLocalUri
                            ? t('register.profile.photoChange', 'החלפת תמונה')
                            : t('register.profile.photoAdd', 'הוספת תמונה')
                        }
                        accessibilityHint={t('register.profile.photoOptional', 'לא חובה')}
                      >
                        <View style={styles.profileOptionalTagWrap} pointerEvents="none">
                          <View
                            style={[
                              styles.profileOptionalPill,
                              {
                                borderColor: useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.1)',
                                backgroundColor: useLightFg ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.92)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.profileOptionalPillText,
                                { color: useLightFg ? 'rgba(255,255,255,0.92)' : palette.textSecondary },
                              ]}
                            >
                              {t('register.profile.photoOptional', 'לא חובה')}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.profileAvatarTap} pointerEvents="none">
                          <View
                            style={[
                              styles.avatarRing,
                              {
                                borderColor: useLightFg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.12)',
                                backgroundColor: useLightFg ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)',
                              },
                            ]}
                          >
                            {avatarLocalUri ? (
                              <Image source={{ uri: avatarLocalUri }} style={styles.avatarImageFill} />
                            ) : (
                              <View
                                style={[
                                  styles.avatarInner,
                                  {
                                    backgroundColor: useLightFg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)',
                                  },
                                ]}
                              >
                                <Camera
                                  size={28}
                                  color={useLightFg ? 'rgba(255,255,255,0.75)' : heroFaint}
                                  strokeWidth={1.45}
                                />
                              </View>
                            )}
                          </View>
                          <Text
                            style={[styles.avatarCaption, { color: useLightFg ? 'rgba(255,255,255,0.95)' : accentInk }]}
                          >
                            {avatarLocalUri
                              ? t('register.profile.photoChange', 'החלפת תמונה')
                              : t('register.profile.photoAdd', 'הוספת תמונה')}
                          </Text>
                        </View>
                      </TouchableOpacity>

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
                          <User
                            size={18}
                            color={nameFocused ? phoneBorderFocus : heroFaint}
                            strokeWidth={1.6}
                          />
                        </View>
                        <TextInput
                          style={[
                            styles.phoneOpenInput,
                            { textAlign: isRtl ? 'right' : 'left', color: heroText },
                          ]}
                          placeholder={t('register.profile.namePlaceholder', 'כתוב/י שם מלא')}
                          placeholderTextColor={heroFaint}
                          value={profileName}
                          onChangeText={(text) => {
                            setProfileName(text);
                            if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                          }}
                          autoCorrect={false}
                          onFocus={() => setNameFocused(true)}
                          onBlur={() => setNameFocused(false)}
                          accessibilityLabel={t('register.profile.nameLabel', 'שם מלא')}
                          accessibilityHint={t('register.profile.nameRequiredA11y', 'שדה חובה')}
                        />
                        <Text
                          style={[styles.profileNameRequiredStar, { color: businessColors.error }]}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        >
                          *
                        </Text>
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

                      <View style={styles.profileBirthBlock}>
                        <View style={styles.profileOptionalTagWrap}>
                          <View
                            style={[
                              styles.profileOptionalPill,
                              {
                                borderColor: useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.1)',
                                backgroundColor: useLightFg ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.92)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.profileOptionalPillText,
                                { color: useLightFg ? 'rgba(255,255,255,0.92)' : palette.textSecondary },
                              ]}
                            >
                              {t('register.profile.birthOptional', 'לא חובה')}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.profileBirthOpenRow}>
                          <TouchableOpacity
                            onPress={openBirthPicker}
                            style={styles.phoneOpenIconSlot}
                            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={t('register.profile.birthPick', 'בחירת תאריך')}
                            accessibilityHint={t('register.profile.birthOptional', 'לא חובה')}
                          >
                            <Calendar
                              size={18}
                              color={
                                hasBirthDate && birthDate
                                  ? useLightFg
                                    ? phoneBorderFocus
                                    : accentInk
                                  : heroFaint
                              }
                              strokeWidth={1.6}
                            />
                          </TouchableOpacity>
                          <View style={styles.profileBirthSegments}>
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={openBirthPicker}
                              style={[
                                styles.profileBirthSegment,
                                {
                                  borderBottomColor: phoneBorderUnfocus,
                                  borderBottomWidth: 1.5,
                                },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${t('register.profile.birthLabel', 'תאריך לידה')}: ${t('register.profile.birthDayPlaceholder', 'יום')}`}
                            >
                              <Text
                                style={[
                                  styles.profileBirthSegmentText,
                                  {
                                    color: profileBirthParts.d ? heroText : heroFaint,
                                    fontWeight: profileBirthParts.d ? '600' : '400',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {profileBirthParts.d ||
                                  t('register.profile.birthDayPlaceholder', 'יום')}
                              </Text>
                            </TouchableOpacity>
                            <View
                              style={[
                                styles.profileBirthSep,
                                {
                                  backgroundColor: useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
                                },
                              ]}
                            />
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={openBirthPicker}
                              style={[
                                styles.profileBirthSegment,
                                {
                                  borderBottomColor: phoneBorderUnfocus,
                                  borderBottomWidth: 1.5,
                                },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${t('register.profile.birthLabel', 'תאריך לידה')}: ${t('register.profile.birthMonthPlaceholder', 'חודש')}`}
                            >
                              <Text
                                style={[
                                  styles.profileBirthSegmentText,
                                  {
                                    color: profileBirthParts.m ? heroText : heroFaint,
                                    fontWeight: profileBirthParts.m ? '600' : '400',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {profileBirthParts.m ||
                                  t('register.profile.birthMonthPlaceholder', 'חודש')}
                              </Text>
                            </TouchableOpacity>
                            <View
                              style={[
                                styles.profileBirthSep,
                                {
                                  backgroundColor: useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
                                },
                              ]}
                            />
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={openBirthPicker}
                              style={[
                                styles.profileBirthSegmentYear,
                                {
                                  borderBottomColor: phoneBorderUnfocus,
                                  borderBottomWidth: 1.5,
                                },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${t('register.profile.birthLabel', 'תאריך לידה')}: ${t('register.profile.birthYearPlaceholder', 'שנה')}`}
                            >
                              <Text
                                style={[
                                  styles.profileBirthSegmentText,
                                  {
                                    color: profileBirthParts.y ? heroText : heroFaint,
                                    fontWeight: profileBirthParts.y ? '600' : '400',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {profileBirthParts.y ||
                                  t('register.profile.birthYearPlaceholder', 'שנה')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {hasBirthDate ? (
                          <TouchableOpacity
                            style={[
                              styles.profileBirthClearChip,
                              {
                                borderColor: useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.12)',
                                backgroundColor: useLightFg ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.94)',
                              },
                            ]}
                            onPress={() => {
                              setHasBirthDate(false);
                              setBirthDate(null);
                            }}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={t('register.profile.birthClear', 'ללא תאריך')}
                          >
                            <Text
                              style={[
                                styles.profileBirthClearChipText,
                                { color: useLightFg ? 'rgba(255,255,255,0.95)' : palette.textPrimary },
                              ]}
                            >
                              {t('register.profile.birthClear', 'ללא תאריך')}
                            </Text>
                            <RotateCcw
                              size={15}
                              color={useLightFg ? 'rgba(255,255,255,0.88)' : accentInk}
                              strokeWidth={2.2}
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                </LoginEntranceSection>

                {registerStep !== 'otp' ? (
                  <LoginEntranceSection
                    delayMs={420}
                    style={[styles.btnWrap, registerStep === 'profile' && styles.profileBtnWrap]}
                  >
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
                                : t('register.profile.cta', 'סיום הרשמה')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  </LoginEntranceSection>
                ) : null}

                {registerStep !== 'profile' ? (
                  <LoginEntranceSection
                    delayMs={560}
                    style={[styles.linksWrap, registerStep === 'otp' && styles.linksWrapOtp]}
                  >
                    <View style={styles.registerRow}>
                      <Text style={[styles.footerMerged, { color: heroMuted, textAlign: 'center' }]}>
                        {t('register.haveAccount', 'כבר יש לך חשבון?')}{' '}
                        <Text
                          onPress={() => router.push('/login')}
                          accessibilityRole="link"
                          style={[styles.footerAction, { color: accentInk }]}
                          suppressHighlighting={false}
                        >
                          {t('auth.signInNow', 'התחבר/י עכשיו')}
                        </Text>
                      </Text>
                    </View>
                  </LoginEntranceSection>
                ) : null}
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

      <PendingApprovalAnimatedModal
        visible={pendingApprovalUi.visible}
        replayKey={pendingApprovalUi.key}
        variant="register"
        phone={pendingApprovalUi.phone}
        accentColor={primary}
        onDismiss={() => {
          setPendingApprovalUi((s) => ({ ...s, visible: false }));
          router.replace('/login');
        }}
      />
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
  profileNameRequiredStar: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    paddingBottom: 6,
    marginLeft: 4,
    marginRight: 4,
  },
  profileBirthBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 14,
  },
  profileBirthOpenRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 48,
    gap: 8,
    paddingTop: 2,
    paddingBottom: 1,
  },
  profileBirthSegments: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 0,
    /** Always day → month → year left-to-right, even when the screen is RTL */
    direction: 'ltr',
  },
  profileBirthSegment: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 5,
    alignItems: 'center',
  },
  profileBirthSegmentYear: {
    flex: 1.2,
    minWidth: 0,
    paddingBottom: 5,
    alignItems: 'center',
  },
  profileBirthSep: {
    width: StyleSheet.hairlineWidth * 2,
    height: 22,
    marginHorizontal: 5,
    marginBottom: 10,
    borderRadius: 1,
    opacity: 0.95,
  },
  profileBirthSegmentText: {
    fontSize: 17,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingVertical: Platform.OS === 'ios' ? 7 : 6,
    width: '100%',
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
  registerOtpFooter: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingBottom: 4,
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
  profileOptionalTagWrap: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  profileOptionalPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  profileOptionalPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  profileAvatarZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  profileAvatarTap: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImageFill: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  avatarInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCaption: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  profileBirthClearChip: {
    alignSelf: 'center',
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  profileBirthClearChipText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
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
  },
  /** Extra separation from OTP actions (resend / change phone) so “have account” reads as its own block */
  linksWrapOtp: {
    marginTop: 52,
    paddingTop: 20,
  },
  registerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footerMerged: {
    fontSize: 14,
    lineHeight: 22,
    flexShrink: 1,
  },
  footerAction: {
    fontWeight: '700',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 2,
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
