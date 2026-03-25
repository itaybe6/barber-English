import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image, 
  Keyboard,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BusinessProfile } from '@/lib/supabase';
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

// Local palette (male, dark-neutral accents)
const palette = {
  primary: '#000000',
  secondary: '#1C1C1E',
  accent: '#111111',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  inputBg: 'rgba(255,255,255,0.6)',
  inputBorder: '#E5E7EB',
  white: '#FFFFFF',
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const bottomWhiteHeight = Math.max(insets.bottom, 20);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form');
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const router = useRouter();
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
    // No-op: content is visible by default
  }, []);

  // Load business profile for background like login screen
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

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!name.trim()) {
      newErrors.name = t('register.error.nameRequired', 'Full name is required');
    }

    if (!phone.trim()) {
      newErrors.phone = t('register.error.phoneRequired', 'Phone number is required');
    } else if (phone.replace(/\D/g, '').length < 9) {
      newErrors.phone = t('register.error.phoneInvalid', 'Invalid phone number');
    }

    if (!email.trim()) {
      newErrors.email = t('register.error.emailRequired', 'Email is required');
    } else {
      const emailRegex = /^(?:[a-zA-Z0-9_'^&+%!-]+(?:\.[a-zA-Z0-9_'^&+%!-]+)*)@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = t('register.error.emailInvalid', 'Invalid email address');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const registerOtpError = (code: string | undefined): string => {
    switch (code) {
      case 'pulseem_not_configured':
        return t(
          'login.otp.errorPulseem',
          'שליחת SMS לא הוגדרה: נדרשים מזהה משתמש, סיסמה ומספר שולח פולסים (Web Service) בעסק. מפתח API בלבד לא מספיק.',
        );
      case 'business_not_found':
        return t(
          'login.otp.errorBusiness',
          'מזהה העסק לא נמצא במסד. בדוק ש-BUSINESS_ID ב-.env תואם לעסק שנוצר.',
        );
      case 'db_error':
      case 'server_error':
        return t(
          'login.otp.errorServer',
          'שגיאת שרת. ודא שהרצת את מיגרציית OTP ב-Supabase ושהפונקציה auth-phone-otp פורסמה.',
        );
      case 'invoke_network':
        return t(
          'login.otp.errorInvoke',
          'לא ניתן להגיע ל-Edge Function. בדוק אינטרנט, שפרסת את auth-phone-otp, ושכתובת ה-Supabase ב-.env נכונה.',
        );
      case 'rate_limit_sends':
        return t('login.otp.errorRateLimit', 'Too many codes sent. Try again later.');
      case 'sms_send_failed':
        return t('login.otp.errorSms', 'Failed to send SMS.');
      case 'phone_registered':
        return t('register.phoneExists.message', 'This phone number is already registered.');
      default:
        return code && code !== 'send_failed'
          ? `${t('common.retry', 'נסה שוב')} (${code})`
          : t('common.tryAgain', 'Please try again.');
    }
  };

  const handleSendRegisterOtp = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const res = await authPhoneOtpApi.sendRegisterOtp(phone.trim());
      if (!res.ok) {
        Alert.alert(t('error.generic', 'Error'), registerOtpError(res.error));
        return;
      }
      setRegisterStep('otp');
      setOtpCode('');
      setOtpCooldownSec(45);
      Alert.alert(
        t('login.otp.sentTitle', 'Code sent'),
        t('register.otp.sentBody', 'Enter the 6-digit code sent to your phone by SMS.')
      );
    } catch (e) {
      console.error('sendRegisterOtp', e);
      Alert.alert(t('error.generic', 'Error'), t('common.tryAgain', 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegister = async () => {
    const digits = otpCode.replace(/\D/g, '');
    if (digits.length !== 6) {
      Alert.alert(t('error.generic', 'Error'), t('login.otp.enterSix', 'Enter the 6-digit code from SMS'));
      return;
    }
    setLoading(true);
    try {
      const res = await authPhoneOtpApi.verifyRegisterOtp({
        phone: phone.trim(),
        code: digits,
        name: name.trim(),
        email: email.trim(),
      });
      if (!res.ok) {
        Alert.alert(
          t('error.generic', 'Error'),
          res.error === 'wrong_code' || res.error === 'no_active_code'
            ? t('login.otp.errorWrongCode', 'Wrong or expired code.')
            : res.error === 'too_many_attempts'
              ? t('login.otp.errorTooMany', 'Too many wrong attempts.')
              : registerOtpError(res.error)
        );
        return;
      }

      Alert.alert(
        t('register.success.title', 'Registration successful!'),
        t(
          'register.success.pendingApprovalOtp',
          'Your account was created. The business will review and approve it shortly.\n\nYou can sign in with your phone number and SMS code after approval.\n\nPhone: {{phone}}',
          { phone: phone.trim() }
        ),
        [{ text: t('ok', 'OK'), onPress: () => router.push('/login') }]
      );
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert(t('error.generic', 'Error'), t('common.tryAgain', 'A system error occurred. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (registerStep === 'form') {
      await handleSendRegisterOtp();
    } else {
      await handleCompleteRegister();
    }
  };

  return (
    <View style={styles.gradient}>
      {/* Background image/gradient same as login */}
      {businessProfile?.login_img && !isLoadingProfile ? (
        (businessProfile.login_img === 'gradient-background' || 
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
         businessProfile.login_img === 'dark-charcoal-background') ? (
          <GradientBackground 
            style={styles.backgroundImage}
            backgroundType={businessProfile.login_img}
          />
        ) : (
          <Image 
            source={{ uri: businessProfile.login_img }} 
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        )
      ) : (
        <LinearGradient
          colors={[ '#FFFFFF', '#F6F6F6', '#EFEFEF' ]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.bgGradient}
        >
          <LinearGradient
            colors={[ '#00000022', '#00000000' ]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.beamRight}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[ '#00000026', '#FFFFFF00' ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.beamTop}
            pointerEvents="none"
          />
        </LinearGradient>
      )}
      {businessProfile?.login_img && !isLoadingProfile && (
        <View style={styles.darkOverlay} />
      )}
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView 
          behavior={'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContainer, isKeyboardVisible ? styles.scrollContainerCompact : null]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={isKeyboardVisible}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            automaticallyAdjustKeyboardInsets
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>

            {/* Logo instead of title/subtitle */}
            <View style={styles.titleContainer}>
              <Image source={getCurrentClientLogo()} style={styles.logoImage} resizeMode="contain" />
            </View>

            {/* Form with entrance animation, blurred sheet like login */}
            <Animated.View
              style={[styles.formWrapper, styles.formWrapperFill, { opacity: fadeAnim, transform: [{ translateY }] }]}
              collapsable={false}
            >
              <BlurView intensity={18} tint="light" style={styles.formContainer}>
              {/* Form header text */}
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: businessColors.primary }]}>{t('register.form.title','Sign up now')}</Text>
                <Text style={styles.formSubtitle}>
                  {registerStep === 'otp'
                    ? t('register.form.subtitleOtp', 'Enter the verification code we sent by SMS')
                    : t('register.form.subtitle','Fill in your details — we will send a code by SMS')}
                </Text>
              </View>
              {/* Name Input */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="person-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input]}
                    placeholder={t('profile.edit.namePlaceholder','Full Name')}
                    placeholderTextColor={palette.textSecondary}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) {
                        setErrors(prev => ({...prev, name: ''}));
                      }
                    }}
                    textAlign="left"
                    autoCorrect={false}
                    editable={registerStep === 'form'}
                  />
                </View>
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              {/* Phone Input */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="call-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input]}
                    placeholder={t('profile.edit.phonePlaceholder','Phone number')}
                    placeholderTextColor={palette.textSecondary}
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      if (errors.phone) {
                        setErrors(prev => ({...prev, phone: ''}));
                      }
                    }}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    textAlign="left"
                    editable={registerStep === 'form'}
                  />
                </View>
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>

              {/* Email Input (optional) */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="mail-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input]}
                    placeholder={t('profile.edit.emailPlaceholder','Email')}
                    placeholderTextColor={palette.textSecondary}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) {
                        setErrors(prev => ({...prev, email: ''}));
                      }
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="left"
                    editable={registerStep === 'form'}
                  />
                </View>
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              {registerStep === 'otp' ? (
                <View style={styles.field}>
                  <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                    <Ionicons name="keypad-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('login.otp.placeholder', '6-digit code')}
                      placeholderTextColor={palette.textSecondary}
                      value={otpCode}
                      onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoCorrect={false}
                      textAlign="left"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setRegisterStep('form');
                      setOtpCode('');
                    }}
                    style={{ marginTop: 10 }}
                  >
                    <Text style={{ color: businessColors.primary, fontWeight: '600', fontSize: 14 }}>
                      {t('register.otp.editDetails', 'Edit details')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSendRegisterOtp}
                    disabled={loading || otpCooldownSec > 0}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ color: otpCooldownSec > 0 ? palette.textSecondary : businessColors.primary, fontWeight: '600', fontSize: 14 }}>
                      {otpCooldownSec > 0
                        ? t('login.otp.resendWait', 'Resend in {{s}}s', { s: otpCooldownSec })
                        : t('login.otp.resend', 'Resend code')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Register Button - styled like login CTA */}
              <TouchableOpacity
                onPress={handleRegister}
                activeOpacity={0.9}
                disabled={loading}
                style={[styles.ctaShadow, loading ? { opacity: 0.65 } : null]}
              >
                <View style={styles.ctaRadiusWrap}>
                  <LinearGradient colors={[ businessColors.primary, businessColors.primary ]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                    {loading ? (
                      <ActivityIndicator color={palette.white} size="small" />
                    ) : (
                      <Text style={styles.ctaText}>
                        {registerStep === 'otp'
                          ? t('register.cta.complete', 'Complete registration')
                          : t('register.cta.sendCode', 'Send SMS code')}
                      </Text>
                    )}
                  </LinearGradient>
                </View>
              </TouchableOpacity>

              {/* Login Link */}
              <View style={styles.loginSection}>
                <Text style={styles.loginText}>
                  {t('register.haveAccount','Already have an account?')}{' '}
                  <Text onPress={() => router.push('/login')} style={[styles.loginLink, styles.loginLinkSpacer]}>{t('auth.signInNow','Sign in now')}</Text>
                </Text>
              </View>
              </BlurView>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* No bottom safe-area inset on register screen */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  backgroundImage: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    bottom: -20,
    width: '100%',
    height: '110%',
    flex: 1,
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
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  beamRight: {
    position: 'absolute',
    right: -120,
    top: -40,
    width: 300,
    height: 500,
    transform: [{ rotate: '18deg' }],
    opacity: 1,
    borderRadius: 24,
  },
  beamTop: {
    position: 'absolute',
    left: -80,
    top: -60,
    width: 380,
    height: 240,
    transform: [{ rotate: '-10deg' }],
    opacity: 1,
    borderRadius: 24,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  scrollContainerCompact: {
    flexGrow: 0,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    paddingHorizontal: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    opacity: 0.7,
  },
  logoImage: {
    width: '80%',
    height: 100,
    marginBottom: 8,
    alignSelf: 'center',
  },
  formWrapper: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    minHeight: '70%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 2,
  },
  formWrapperFill: {
    // Ensure the sheet reaches the bottom even without bottom safe-area view
    marginBottom: 0,
    flexGrow: 1,
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
    flex: 1,
    minHeight: '70%',
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  field: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    height: 52,
    paddingHorizontal: 12,
    borderWidth: 1,
    position: 'relative',
    width: '92%',
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: palette.textPrimary,
    textAlign: 'left',
    paddingHorizontal: 6,
    paddingLeft: 32,
    paddingRight: 32,
  },
  inputPassword: {
    paddingRight: 32,
    paddingLeft: 32,
  },
  iconRight: {
    position: 'absolute',
    right: 10,
    zIndex: 1,
  },
  iconLeft: {
    position: 'absolute',
    left: 10,
    zIndex: 1,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 0,
    marginRight: 6,
    position: 'absolute',
    left: 6,
    zIndex: 1,
  },
  eyeButtonRight: {
    padding: 4,
    marginLeft: 6,
    marginRight: 0,
    position: 'absolute',
    right: 6,
    zIndex: 1,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'left',
    width: '92%',
    alignSelf: 'center',
  },
  registerButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  ctaShadow: {
    marginTop: 12,
    borderRadius: 24,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    width: '92%',
    alignSelf: 'center',
  },
  ctaRadiusWrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cta: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  ctaText: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '600',
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginText: {
    color: Colors.subtext,
    fontSize: 16,
  },
  loginLink: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  loginLinkSpacer: {
    marginLeft: 4,
  },
  bottomWhiteInset: {
    // intentionally unused for register screen (no bottom safe area)
  },

});