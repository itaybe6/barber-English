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
  Easing,
  InteractionManager
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, getBusinessId, BusinessProfile } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { businessProfileApi } from '@/lib/api/businessProfile';
import GradientBackground from '@/components/GradientBackground';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

// Local palette (male, dark-neutral accents)
const palette = {
  primary: '#000000',
  secondary: '#1C1C1E',
  accent: '#111111',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  inputBg: 'rgba(255,255,255,0.7)',
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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!name.trim()) {
      newErrors.name = 'Full name is required';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (phone.length < 10) {
      newErrors.phone = 'Invalid phone number';
    }

    // Email required and must be valid
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else {
      const emailRegex = /^(?:[a-zA-Z0-9_'^&+%!-]+(?:\.[a-zA-Z0-9_'^&+%!-]+)*)@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = 'Invalid email address';
      }
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (!validatePassword(password)) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      // Check if user already exists by phone in the same business
      const businessId = getBusinessId();
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone.trim())
        .eq('business_id', businessId)
        .single();

      if (existingUser) {
        Alert.alert('Phone number already exists', 'This phone number is already registered in the system. Please use a different phone number or sign in to your existing account.');
        return;
      }

      // Create new user in custom table with chosen password
      const newUser = await usersApi.createUserWithPassword({
        name: name.trim(),
        user_type: 'client', // כל ההרשמות החדשות הן לקוחות
        phone: phone.trim(),
        email: email.trim(),
      } as any, password);

      if (!newUser) {
        Alert.alert('Error', 'An error occurred creating the account. Please try again.');
        return;
      }

      // Success!
      Alert.alert(
        'Registration successful!', 
        `Your account was created successfully.\n\nYou can now sign in with your phone number and chosen password.\n\nPhone number: ${phone.trim()}`,
        [
          {
            text: 'OK',
            onPress: () => router.push('/login')
          }
        ]
      );
      
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'A system error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (error: string) => {
    if (error.includes('User already registered') || error.includes('phone number already exists')) {
      return 'This phone number is already registered in the system';
    }
    if (error.includes('Invalid email')) {
      return 'Invalid email address';
    }
    if (error.includes('Password should be at least 6 characters')) {
      return 'Password must be at least 6 characters';
    }
    return 'An error occurred during registration. Please try again.';
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
                <Text style={[styles.formTitle, { color: businessColors.primary }]}>Sign up now</Text>
                <Text style={styles.formSubtitle}>Fill in your details to register and sign in</Text>
              </View>
              {/* Name Input */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="person-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input]}
                    placeholder="Full name"
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
                    placeholder="Phone number"
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
                    placeholder="Email"
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
                  />
                </View>
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>



              {/* Password Input */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input, styles.inputPassword]}
                    placeholder="Password (at least 6 characters)"
                    placeholderTextColor={palette.textSecondary}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errors.password) {
                        setErrors(prev => ({...prev, password: ''}));
                      }
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textAlign="left"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButtonRight}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={palette.textSecondary} />
                  </TouchableOpacity>
                </View>
                {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              </View>

              {/* Confirm Password Input */}
              <View style={styles.field}>
                <View style={[styles.inputRow, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={palette.textSecondary} style={styles.iconLeft} />
                  <TextInput
                    style={[styles.input, styles.inputPassword]}
                    placeholder="Confirm password"
                    placeholderTextColor={palette.textSecondary}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (errors.confirmPassword) {
                        setErrors(prev => ({...prev, confirmPassword: ''}));
                      }
                    }}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    textAlign="left"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButtonRight}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={palette.textSecondary} />
                  </TouchableOpacity>
                </View>
                {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
              </View>

              {/* Register Button - styled like login CTA */}
              <TouchableOpacity onPress={handleRegister} activeOpacity={0.9} disabled={loading} style={styles.ctaShadow}>
                <View style={styles.ctaRadiusWrap}>
                  <LinearGradient colors={[ businessColors.primary, businessColors.primary ]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                    {loading ? (
                      <ActivityIndicator color={palette.white} size="small" />
                    ) : (
                      <Text style={styles.ctaText}>Register</Text>
                    )}
                  </LinearGradient>
                </View>
              </TouchableOpacity>

              {/* Login Link */}
              <View style={styles.loginSection}>
                <Text style={styles.loginText}>
                  Already have an account? 
                  <Text onPress={() => router.push('/login')} style={[styles.loginLink, styles.loginLinkSpacer]}>Sign in now</Text>
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