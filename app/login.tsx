import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '@/stores/authStore';
import { usersApi } from '@/lib/api/users';
import { supabase, getBusinessId, BusinessProfile } from '@/lib/supabase';
import { findUserByCredentials, isValidUserType } from '@/constants/auth';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import GradientBackground from '@/components/GradientBackground';
import { useTranslation } from 'react-i18next';

// Static colors for UI elements that don't change with business theme
const staticColors = {
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.8)',
  inputBg: 'rgba(0,0,0,0.2)',
  inputBorder: 'rgba(255,255,255,0.3)',
  white: '#FFFFFF',
  backgroundStart: '#FFFFFF',
  backgroundEnd: '#F5F5F5',
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const bottomWhiteHeight = Math.max(insets.bottom, 20);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const login = useAuthStore((state) => state.login);
  const { isAuthenticated, user } = useAuthStore();
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

  // Effect to monitor authentication changes
  useEffect(() => {
    // Authentication state monitoring
  }, [isAuthenticated, user]);

  // Load business profile for login background
  useEffect(() => {
    const loadBusinessProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const profile = await businessProfileApi.getProfile();
        setBusinessProfile(profile);
      } catch (error) {
        console.error('Failed to load business profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadBusinessProfile();
  }, []);

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('login.fillAll', 'Please fill in all fields'));
      return;
    }

    setIsLoading(true);
    
    try {
      // Try authenticating via the real API
      const user = await usersApi.authenticateUserByPhone(phone.trim(), password);
      
      if (user) {
        // Blocked user cannot log in
        if ((user as any)?.block) {
          Alert.alert(t('account.blocked', 'Account Blocked'), t('login.blockedCannotSignIn', 'Your account is blocked and cannot sign in. Please contact the manager.'));
          return;
        }
        // Validate user type
        if (!isValidUserType(user.user_type)) {
          Alert.alert(t('error.generic', 'Error'), t('login.invalidUserType', 'Invalid user type'));
          return;
        }
        
        // Convert Supabase user to app user format for the store
        const appUser = {
          id: user.id,
          phone: user.phone,
          type: user.user_type,
          name: user.name,
          email: user.email ?? null,
          image_url: user.image_url ?? null,
          user_type: user.user_type,
          block: (user as any)?.block ?? false,
        } as any;
        login(appUser);
        // Force navigation to the appropriate screen
        if (appUser.type === 'admin') {
          router.replace('/(tabs)');
        } else {
          router.replace('/(client-tabs)');
        }
      } else {
        // Check if user exists in different business
        const businessId = getBusinessId();
        const { data: userInOtherBusiness } = await supabase
          .from('users')
          .select('*')
          .eq('phone', phone.trim())
          .neq('business_id', businessId)
          .single();

        if (userInOtherBusiness) {
          // Don't reveal that user exists in another business - just show generic error
          Alert.alert(t('error.generic', 'Error'), t('login.incorrectCredentials', 'Incorrect phone or password'));
          return;
        }

        // If API fails, try demo users
        const demoUser = findUserByCredentials(phone.trim(), password);
        if (demoUser) {
          login(demoUser);
          // Force navigation to the appropriate screen
          if (demoUser.type === 'admin') {
            router.replace('/(tabs)');
          } else {
            router.replace('/(client-tabs)');
          }
        } else {
          Alert.alert(t('error.generic', 'Error'), t('login.incorrectCredentials', 'Incorrect phone or password'));
        }
      }
    } catch (error) {
      console.error('API Login error:', error);
      
      // If API fails, try demo users
      try {
        const demoUser = findUserByCredentials(phone.trim(), password);
        if (demoUser) {
          login(demoUser);
          // Force navigation to the appropriate screen
          if (demoUser.type === 'admin') {
            router.replace('/(tabs)');
          } else {
            router.replace('/(client-tabs)');
          }
        } else {
          Alert.alert(t('error.generic', 'Error'), t('login.incorrectCredentials', 'Incorrect phone or password'));
        }
      } catch (demoError) {
        console.error('Demo login error:', demoError);
        Alert.alert(t('error.generic', 'Error'), t('login.signInError', 'An error occurred during sign-in'));
      }
    } finally {
      setIsLoading(false);
    }
  };


  const handleForgotSubmit = async () => {
    const e = (forgotEmail || '').trim();
    if (!e) { Alert.alert(t('error.generic', 'Error'), t('login.enterEmail', 'Please enter an email')); return; }
    setIsSendingReset(true);
    try {
      // 1) Try Edge Function first
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('reset-password', {
        body: { email: e },
      });
      if (fnErr) {
        // 2) Fallback: call Supabase Auth directly from client
        console.warn('[ForgotPassword] edge failed, falling back to auth.resetPasswordForEmail', fnErr);
        const { error: rpErr } = await supabase.auth.resetPasswordForEmail(e);
        if (rpErr) {
          const msg = (rpErr as any)?.message || t('login.resetError', 'Error requesting password reset');
          Alert.alert(t('error.generic', 'Error'), String(msg));
          return;
        }
      }

      Alert.alert(t('login.emailSent.title', 'Email Sent'), t('login.emailSent.message', 'We sent you a password reset email. Check your inbox.'), [
        { text: t('ok', 'OK'), onPress: () => setIsForgotOpen(false) },
      ]);
    } catch (err) {
      console.error('Forgot password error (invoke/catch):', err);
      // Last resort fallback just in case invoke threw before returning error
      try {
        const { error: rpErr } = await supabase.auth.resetPasswordForEmail(e);
        if (rpErr) {
          Alert.alert(t('error.generic', 'Error'), String((rpErr as any)?.message || t('common.tryAgain', 'An error occurred. Please try again.')));
          return;
        }
        Alert.alert(t('login.emailSent.title', 'Email Sent'), t('login.emailSent.message', 'We sent you a password reset email. Check your inbox.'), [
          { text: t('ok', 'OK'), onPress: () => setIsForgotOpen(false) },
        ]);
      } catch (subErr) {
        console.error('Forgot password fallback error:', subErr);
        Alert.alert(t('error.generic', 'Error'), t('common.tryAgain', 'An error occurred. Please try again.'));
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Custom login background image */}
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
          {/* modern subtle gradient beams instead of circular blobs */}
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
      
      {/* Dark overlay for better text readability when using custom background */}
      {businessProfile?.login_img && !isLoadingProfile && (
        <View style={styles.darkOverlay} />
      )}
      <SafeAreaView style={styles.fullSafe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Branding at top (logo + optional business name) */}
            <View style={styles.titleContainer}>
              <Image source={getCurrentClientLogo()} style={styles.logoImage} resizeMode="contain" />
            </View>

            {/* Bottom sheet form container (like register) with slight blur and crisp rounded corners */}
            <View style={styles.formWrapper}>
              <BlurView intensity={18} tint="light" style={styles.formContainer}>
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: businessColors.primary }]}>Sign in your account</Text>
                <Text style={styles.formSubtitle}>Enter your details to access your account</Text>
              </View>

              {/* Phone */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: '#E5E7EB' }]}>
                  <Ionicons name="call-outline" size={18} color="#6B7280" style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input, { color: '#4B5563' }]}
                    placeholder="Phone number"
                    placeholderTextColor="#6B7280"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    textAlign="left"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: '#E5E7EB' }]}>
                  <Ionicons name="lock-closed-outline" size={18} color="#6B7280" style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input, styles.inputPassword, { color: '#4B5563' }]}
                    placeholder="Password"
                    placeholderTextColor="#6B7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textAlign="left"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButtonRight}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* CTA */}
              <TouchableOpacity onPress={handleLogin} activeOpacity={0.9} disabled={isLoading} style={styles.ctaShadow}>
                <View style={styles.ctaRadiusWrap}>
                  <View style={[styles.cta, styles.ctaOutlined, { backgroundColor: businessColors.primary }]}>
                    <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>{isLoading ? 'Signing in…' : 'Sign In'}</Text>
                  </View>
                </View>
              </TouchableOpacity>

                {/* Links */}
                <TouchableOpacity style={styles.forgotPasswordButton} onPress={() => setIsForgotOpen(true)}>
                  <Text style={styles.forgotPasswordText}>Forgot password</Text>
                </TouchableOpacity>
                <Text style={styles.registerLine}>
                  Don't have an account? 
                  <Link href="/register" asChild>
                    <Text style={[styles.registerAction, { color: businessColors.primary }]}>Sign up now</Text>
                  </Link>
                </Text>
              </BlurView>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Forgot Password Modal */}
      {isForgotOpen && (
        <View style={styles.forgotOverlay}>
          <View style={styles.forgotCard}>
            <Text style={styles.forgotTitle}>Reset Password</Text>
            <Text style={styles.forgotSubtitle}>Enter phone and email as they appear on your account</Text>
            <View style={{ height: 10 }} />
            <View style={[styles.inputRow, { backgroundColor: '#F8F8F8', borderColor: '#E0E0E0' }]}> 
              <Ionicons name="call-outline" size={18} color="#666666" style={styles.iconLeft} />
              <TextInput
                style={[styles.input, { color: '#000000' }]}
                placeholder="Phone number"
                placeholderTextColor="#999999"
                value={forgotPhone}
                onChangeText={setForgotPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
                textAlign="left"
              />
            </View>
            <View style={{ height: 10 }} />
            <View style={[styles.inputRow, { backgroundColor: '#F8F8F8', borderColor: '#E0E0E0' }]}> 
              <Ionicons name="mail-outline" size={18} color="#666666" style={styles.iconLeft} />
              <TextInput
                style={[styles.input, { color: '#000000' }]}
                placeholder="Email"
                placeholderTextColor="#999999"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="left"
              />
            </View>
            <View style={{ height: 14 }} />
            <View style={styles.forgotActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setIsForgotOpen(false)} disabled={isSendingReset}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn, { backgroundColor: businessColors.primary }]} onPress={handleForgotSubmit} disabled={isSendingReset}>
                <Text style={[styles.saveBtnText, { color: '#FFFFFF' }]}>{isSendingReset ? 'Sending…' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {/* Bottom white safe-area inset to match register screen */}
      <View pointerEvents="none" style={[styles.bottomWhiteInset, { height: bottomWhiteHeight }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.white,
  },
  backgroundImage: {
    position: 'absolute',
    top: -20, // Extend beyond safe area
    left: 0,
    right: 0,
    bottom: -20, // Extend beyond safe area
    width: '100%',
    height: '110%', // Slightly taller
    flex: 1, // Ensure it takes full available space
  },
  darkOverlay: {
    position: 'absolute',
    top: -50, // Extend beyond safe area
    left: 0,
    right: 0,
    bottom: -50, // Extend beyond safe area
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  bgGradient: {
    position: 'absolute',
    top: -50, // Extend beyond safe area
    left: 0,
    right: 0,
    bottom: -50, // Extend beyond safe area
    width: '100%',
    height: '120%', // Ensure full coverage
  },
  fullSafe: {
    flex: 1,
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 8,
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
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '85%',
    height: 120,
    marginBottom: 12,
    alignSelf: 'center',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: staticColors.textPrimary,
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 14,
    color: staticColors.textSecondary,
    opacity: 1,
    marginBottom: 14,
  },
  businessName: {
    fontSize: 22,
    fontWeight: '800',
    color: staticColors.textPrimary,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 8,
  },
  safeBottom: {
    flex: 1,
    backgroundColor: staticColors.white,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  titleContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  formWrapper: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: '70%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 2,
  },
  formContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    minHeight: '70%',
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  bottomWhiteInset: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 24,
    marginTop: 0,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  field: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    height: 52,
    paddingHorizontal: 12,
    borderWidth: 1,
    position: 'relative',
  },
  iconRight: {
    position: 'absolute',
    right: 12,
    zIndex: 1,
  },
  iconLeft: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: staticColors.textPrimary,
    paddingHorizontal: 8,
    paddingLeft: 36,
    paddingRight: 36,
    textAlign: 'left',
  },
  inputPassword: {
    paddingRight: 36, // space for eye icon on right
    paddingLeft: 36,  // space for lock icon on left
  },
  eyeButton: {
    padding: 6,
    marginLeft: 0,
    marginRight: 8,
    position: 'absolute',
    left: 8,
    zIndex: 1,
  },
  eyeButtonRight: {
    padding: 6,
    marginLeft: 0,
    marginRight: 8,
    position: 'absolute',
    right: 8,
    zIndex: 1,
  },
  ctaShadow: {
    marginTop: 12,
    borderRadius: 24,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  ctaRadiusWrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cta: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOutlined: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 24,
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: 14,
  },
  forgotPasswordText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  registerLine: {
    marginTop: 8,
    textAlign: 'center',
    color: '#000000',
    fontSize: 14,
  },
  registerAction: {
    fontWeight: '700',
    fontSize: 16,
    marginRight: 4,
  },
  // Reuse modal button styles similar to other screens
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelBtnText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: staticColors.textPrimary, // Will be overridden by inline style
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  forgotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  forgotCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  forgotTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 6,
  },
  forgotSubtitle: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
  },
  forgotActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
});