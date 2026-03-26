import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
  Modal,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BusinessProfile, supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { businessProfileApi } from '@/lib/api/businessProfile';
import GradientBackground from '@/components/GradientBackground';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { authPhoneOtpApi } from '@/lib/api/authPhoneOtp';

const palette = {
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  inputBg: 'rgba(255, 255, 255, 0.92)',
  inputBorder: 'rgba(17, 24, 39, 0.08)',
  sheetBg: 'rgba(255, 255, 255, 0.72)',
  white: '#FFFFFF',
  success: '#059669',
};

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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
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
  const router = useRouter();
  const isRtl = i18n.language?.startsWith('he') ?? true;

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

  useEffect(() => {
    const loadBusinessProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const profile = await businessProfileApi.getProfile();
        setBusinessProfile(profile);
      } catch (error) {
        console.error('Failed to load business profile (register):', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };
    loadBusinessProfile();
  }, []);

  const validatePhoneStep = () => {
    const next: Record<string, string> = {};
    if (!phone.trim()) {
      next.phone = t('register.error.phoneRequired');
    } else if (phone.replace(/\D/g, '').length < 9) {
      next.phone = t('register.error.phoneInvalid');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

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
      case 'missing_name':
        return t('register.error.nameRequired', 'נא להזין שם מלא');
      default:
        return code && code !== 'send_failed'
          ? `${t('common.retry', 'נסו שוב')} (${code})`
          : t('common.tryAgain', 'משהו השתבש. נסו שוב.');
    }
  };

  const handleSendRegisterOtp = async () => {
    if (!validatePhoneStep()) return;
    setLoading(true);
    setCodeSentBanner(false);
    try {
      const res = await authPhoneOtpApi.sendRegisterOtp(phone.trim());
      if (!res.ok) {
        Alert.alert(t('error.generic', 'שגיאה'), registerOtpError(res.error));
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
        phone: phone.trim(),
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
      if (!res.ok) {
        Alert.alert(t('error.generic', 'שגיאה'), registerOtpError(res.error));
        return;
      }

      Alert.alert(t('register.success.title'), t('register.success.pendingApprovalOtp', { phone: phone.trim() }), [
        { text: t('ok'), onPress: () => router.replace('/login') },
      ]);
    } catch (e) {
      console.error('completeRegisterProfile', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('common.tryAgain', 'נסו שוב.'));
    } finally {
      setLoading(false);
    }
  };

  const goBackWithinFlow = () => {
    if (registerStep === 'phone') {
      router.back();
      return;
    }
    if (registerStep === 'otp') {
      setRegisterStep('phone');
      setOtpCode('');
      setCodeSentBanner(false);
      return;
    }
    Alert.alert(
      t('register.profile.abortTitle', 'לצאת מההרשמה?'),
      t(
        'register.profile.abortMessage',
        'ההרשמה עדיין לא הושלמה — אפשר יהיה להמשיך מאותו מספר טלפון. אם תצאו עכשיו, השם והתמונה לא יישמרו.',
      ),
      [
        { text: t('register.profile.abortStay', 'המשך למלא'), style: 'cancel' },
        { text: t('register.profile.abortLeave', 'יציאה'), onPress: () => router.replace('/login') },
      ],
    );
  };

  const stepIndex = registerStep === 'phone' ? 0 : registerStep === 'otp' ? 1 : 2;

  const renderProgress = () => (
    <View style={styles.progressWrap} accessibilityRole="header">
      {[0, 1, 2].map((i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <View
              style={[
                styles.progressLine,
                { backgroundColor: i <= stepIndex ? businessColors.primary : palette.textMuted },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.progressDot,
              {
                backgroundColor: i <= stepIndex ? businessColors.primary : 'transparent',
                borderColor: i <= stepIndex ? businessColors.primary : palette.textMuted,
              },
            ]}
          >
            {i < stepIndex ? (
              <Ionicons name="checkmark" size={14} color={palette.white} />
            ) : (
              <Text style={[styles.progressDotText, { color: i === stepIndex ? palette.white : palette.textMuted }]}>
                {i + 1}
              </Text>
            )}
          </View>
        </React.Fragment>
      ))}
    </View>
  );

  const renderStepLabels = () => (
    <View style={[styles.stepLabels, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.stepLabel, stepIndex === 0 && { color: businessColors.primary, fontWeight: '800' }]}>
        {t('register.steps.phone', 'טלפון')}
      </Text>
      <Text style={[styles.stepLabel, stepIndex === 1 && { color: businessColors.primary, fontWeight: '800' }]}>
        {t('register.steps.code', 'קוד')}
      </Text>
      <Text style={[styles.stepLabel, stepIndex === 2 && { color: businessColors.primary, fontWeight: '800' }]}>
        {t('register.steps.profile', 'פרופיל')}
      </Text>
    </View>
  );

  return (
    <View style={styles.gradient}>
      {businessProfile?.login_img && !isLoadingProfile ? (
        businessProfile.login_img === 'gradient-background' ||
        businessProfile.login_img === 'solid-blue-background' ||
        businessProfile.login_img === 'solid-purple-background' ||
        businessProfile.login_img === 'solid-green-background' ||
        businessProfile.login_img === 'solid-orange-background' ||
        businessProfile.login_img === 'light-silver-background' ||
        businessProfile.login_img === 'light-white-background' ||
        businessProfile.login_img === 'light-gray-background' ||
        businessProfile.login_img === 'light-pink-background' ||
        businessProfile.login_img === 'light-cyan-background' ||
        businessProfile.login_img === 'light-lavender-background' ||
        businessProfile.login_img === 'light-coral-background' ||
        businessProfile.login_img === 'dark-black-background' ||
        businessProfile.login_img === 'dark-charcoal-background' ? (
          <GradientBackground style={styles.backgroundImage} backgroundType={businessProfile.login_img} />
        ) : (
          <Image source={{ uri: businessProfile.login_img }} style={styles.backgroundImage} resizeMode="cover" />
        )
      ) : (
        <LinearGradient
          colors={['#FFFFFF', '#F6F6F6', '#EFEFEF']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.bgGradient}
        >
          <LinearGradient
            colors={['#00000022', '#00000000']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.beamRight}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['#00000026', '#FFFFFF00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.beamTop}
            pointerEvents="none"
          />
        </LinearGradient>
      )}
      {businessProfile?.login_img && !isLoadingProfile ? <View style={styles.darkOverlay} /> : null}

      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAwareScreenScroll
          style={styles.keyboardAvoid}
          contentContainerStyle={[
            styles.scrollContainer,
            isKeyboardVisible ? styles.scrollContainerCompact : null,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          <View style={[styles.rtlRoot, { direction: isRtl ? 'rtl' : 'ltr' }]}>
            <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.backButton} onPress={goBackWithinFlow} accessibilityLabel={t('back', 'חזרה')}>
                <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.titleContainer}>
              <Image source={getCurrentClientLogo()} style={styles.logoImage} resizeMode="contain" />
            </View>

            <Animated.View style={[styles.formWrapper, styles.formWrapperFill, { opacity: fadeAnim }]} collapsable={false}>
              <BlurView intensity={28} tint="light" style={styles.formContainer}>
                {renderProgress()}
                {renderStepLabels()}

                {registerStep === 'phone' ? (
                  <>
                    <Text style={styles.heroTitle}>{t('register.phone.title', 'מה מספר הטלפון שלך?')}</Text>
                    <Text style={styles.heroSubtitle}>
                      {t('register.phone.subtitle', 'נשלח אליך קוד אימות ב-SMS כדי להשלים את ההרשמה.')}
                    </Text>
                    <View
                      style={[
                        styles.inputRow,
                        { borderColor: palette.inputBorder, backgroundColor: palette.inputBg },
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      ]}
                    >
                      <Ionicons name="call-outline" size={20} color={palette.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
                        placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                        placeholderTextColor={palette.textMuted}
                        value={phone}
                        onChangeText={(text) => {
                          setPhone(text);
                          if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
                        }}
                        keyboardType="phone-pad"
                        autoCorrect={false}
                      />
                    </View>
                    {errors.phone ? (
                      <Text style={[styles.errorText, { textAlign: isRtl ? 'right' : 'left' }]}>{errors.phone}</Text>
                    ) : null}
                    <Text style={styles.softHint}>{t('register.phone.hint', 'הקוד יגיע תוך שניות לנייד')}</Text>
                  </>
                ) : null}

                {registerStep === 'otp' ? (
                  <>
                    <Text style={styles.heroTitle}>{t('register.otp.title', 'הזינו את הקוד')}</Text>
                    <Text style={styles.heroSubtitle}>
                      {t('register.otp.subtitle', 'שלחנו קוד בן 6 ספרות ל־{{phone}}', { phone: phone.trim() })}
                    </Text>
                    {codeSentBanner ? (
                      <View style={styles.bannerOk}>
                        <Ionicons name="checkmark-circle" size={18} color={palette.success} />
                        <Text style={styles.bannerOkText}>{t('register.otp.sentToast', 'הקוד נשלח בהצלחה')}</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.inputRow,
                        { borderColor: palette.inputBorder, backgroundColor: palette.inputBg },
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      ]}
                    >
                      <Ionicons name="keypad-outline" size={20} color={palette.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, styles.otpInput, { textAlign: isRtl ? 'right' : 'left' }]}
                        placeholder="______"
                        placeholderTextColor={palette.textMuted}
                        value={otpCode}
                        onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoCorrect={false}
                      />
                    </View>
                    <TouchableOpacity onPress={() => setRegisterStep('phone')} style={styles.linkBtn}>
                      <Text style={[styles.linkText, { color: businessColors.primary }]}>
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
                          { color: otpCooldownSec > 0 ? palette.textMuted : businessColors.primary },
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
                    <Text style={styles.heroTitle}>{t('register.profile.title', 'כמה פרטים אחרונים')}</Text>
                    <Text style={styles.heroSubtitle}>
                      {t('register.profile.subtitle', 'כך נזהה אותך ונוכל לתת שירות מדויק יותר.')}
                    </Text>

                    <Text style={[styles.fieldLabel, { textAlign: isRtl ? 'right' : 'left' }]}>
                      {t('register.profile.nameLabel', 'שם מלא')} <Text style={styles.reqStar}>*</Text>
                    </Text>
                    <View
                      style={[
                        styles.inputRow,
                        { borderColor: palette.inputBorder, backgroundColor: palette.inputBg },
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                      ]}
                    >
                      <Ionicons name="person-outline" size={20} color={palette.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
                        placeholder={t('register.profile.namePlaceholder', 'למשל: יוסי כהן')}
                        placeholderTextColor={palette.textMuted}
                        value={profileName}
                        onChangeText={(text) => {
                          setProfileName(text);
                          if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                        }}
                        autoCorrect={false}
                      />
                    </View>
                    {errors.name ? (
                      <Text style={[styles.errorText, { textAlign: isRtl ? 'right' : 'left' }]}>{errors.name}</Text>
                    ) : null}

                    <Text style={[styles.fieldLabel, { textAlign: isRtl ? 'right' : 'left' }]}>
                      {t('register.profile.birthLabel', 'תאריך לידה')}{' '}
                      <Text style={styles.optionalTag}>({t('register.profile.birthOptional', 'לא חובה')})</Text>
                    </Text>
                    <View style={[styles.rowActions, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                      <TouchableOpacity
                        style={[styles.secondaryBtn, { borderColor: businessColors.primary }]}
                        onPress={() => {
                          setPickerTempDate(birthDate ?? defaultBirthDate());
                          if (Platform.OS === 'android') {
                            setShowAndroidBirthPicker(true);
                          } else {
                            setShowBirthModal(true);
                          }
                        }}
                      >
                        <Ionicons name="calendar-outline" size={18} color={businessColors.primary} />
                        <Text style={[styles.secondaryBtnText, { color: businessColors.primary }]}>
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
                          <Text style={styles.textGhost}>{t('register.profile.birthClear', 'ללא תאריך')}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Text style={[styles.fieldLabel, { marginTop: 18, textAlign: isRtl ? 'right' : 'left' }]}>
                      {t('register.profile.photoLabel', 'תמונת פרופיל')}{' '}
                      <Text style={styles.optionalTag}>({t('register.profile.photoOptional', 'לא חובה')})</Text>
                    </Text>
                    <TouchableOpacity style={styles.avatarCard} onPress={pickAvatar} activeOpacity={0.85}>
                      {avatarLocalUri ? (
                        <Image source={{ uri: avatarLocalUri }} style={styles.avatarPreview} />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Ionicons name="camera-outline" size={36} color={palette.textSecondary} />
                        </View>
                      )}
                      <Text style={[styles.avatarHint, { color: businessColors.primary }]}>
                        {avatarLocalUri
                          ? t('register.profile.photoChange', 'החלפת תמונה')
                          : t('register.profile.photoAdd', 'הוספת תמונה')}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                <TouchableOpacity
                  onPress={() => {
                    if (registerStep === 'phone') handleSendRegisterOtp();
                    else if (registerStep === 'otp') handleVerifyOtpAndContinue();
                    else handleCompleteProfile();
                  }}
                  activeOpacity={0.9}
                  disabled={loading}
                  style={[styles.ctaShadow, loading ? { opacity: 0.65 } : null]}
                >
                  <View style={styles.ctaRadiusWrap}>
                    <LinearGradient
                      colors={[businessColors.primary, businessColors.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cta}
                    >
                      {loading ? (
                        <ActivityIndicator color={palette.white} size="small" />
                      ) : (
                        <Text style={styles.ctaText}>
                          {registerStep === 'phone'
                            ? t('register.phone.cta', 'שלחו לי קוד')
                            : registerStep === 'otp'
                              ? t('register.otp.cta', 'אמתו והמשיכו')
                              : t('register.profile.cta', 'סיום הרשמה')}
                        </Text>
                      )}
                    </LinearGradient>
                  </View>
                </TouchableOpacity>

                <View style={styles.loginSection}>
                  <Text style={styles.loginText}>
                    {t('register.haveAccount', 'כבר יש לך חשבון?')}{' '}
                    <Text onPress={() => router.push('/login')} style={[styles.loginLink, styles.loginLinkSpacer]}>
                      {t('auth.signInNow', 'התחברות')}
                    </Text>
                  </Text>
                </View>
              </BlurView>
            </Animated.View>
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
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  rtlRoot: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: 8 },
  scrollContainerCompact: { flexGrow: 0 },
  backgroundImage: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    bottom: -20,
    width: '100%',
    height: '110%',
  },
  bgGradient: {
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
    bottom: -50,
    width: '100%',
    height: '120%',
  },
  darkOverlay: {
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
    bottom: -50,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  beamRight: {
    position: 'absolute',
    right: -120,
    top: -40,
    width: 300,
    height: 500,
    transform: [{ rotate: '18deg' }],
    borderRadius: 24,
  },
  beamTop: {
    position: 'absolute',
    left: -80,
    top: -60,
    width: 380,
    height: 240,
    transform: [{ rotate: '-10deg' }],
    borderRadius: 24,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: { paddingHorizontal: 20, marginBottom: 20, alignItems: 'center' },
  logoImage: { width: '78%', height: 88, alignSelf: 'center' },
  formWrapper: {
    backgroundColor: palette.sheetBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    marginHorizontal: 10,
    marginBottom: 8,
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 6 },
    }),
  },
  formWrapperFill: { minHeight: '58%' },
  formContainer: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 28,
    flex: 1,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressLine: { width: 36, height: 3, borderRadius: 2, marginHorizontal: 2 },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotText: { fontSize: 12, fontWeight: '700' },
  stepLabels: {
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  stepLabel: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 8,
    marginTop: 4,
    alignSelf: 'stretch',
  },
  reqStar: { color: '#DC2626' },
  optionalTag: { fontWeight: '500', color: palette.textMuted, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    minHeight: 54,
    paddingHorizontal: 14,
    borderWidth: 1,
    width: '100%',
    alignSelf: 'center',
  },
  inputIcon: { marginHorizontal: 4 },
  input: {
    flex: 1,
    fontSize: 17,
    color: palette.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  otpInput: {
    fontSize: 22,
    letterSpacing: 4,
    fontWeight: '700',
  },
  softHint: {
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 14,
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
  bannerOkText: { fontSize: 14, color: palette.success, fontWeight: '600', marginRight: 8 },
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
  textGhost: { fontSize: 14, color: palette.textSecondary, fontWeight: '600' },
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
    backgroundColor: 'rgba(17,24,39,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.inputBorder,
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
  errorText: {
    color: Colors.error,
    fontSize: 13,
    marginTop: 6,
    width: '100%',
  },
  ctaShadow: {
    marginTop: 22,
    borderRadius: 16,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
    }),
  },
  ctaRadiusWrap: { borderRadius: 16, overflow: 'hidden' },
  cta: { height: 52, alignItems: 'center', justifyContent: 'center', width: '100%' },
  ctaText: { color: palette.white, fontSize: 17, fontWeight: '800' },
  loginSection: {
    marginTop: 22,
    alignItems: 'center',
  },
  loginText: { color: Colors.subtext, fontSize: 15, textAlign: 'center' },
  loginLink: { color: palette.textPrimary, fontWeight: '800' },
  loginLinkSpacer: { marginLeft: 4 },
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
