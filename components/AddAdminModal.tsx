import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { X, User, Phone, Mail, Lock } from 'lucide-react-native';
import { usersApi } from '@/lib/api/users';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import Colors from '@/constants/colors';

interface AddAdminModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddAdminModal({ visible, onClose, onSuccess }: AddAdminModalProps) {
  const { colors: businessColors } = useBusinessColors();
  const [isLoading, setIsLoading] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Wizard step state (0: basic, 1: email, 2: password, 3: review)
  const [step, setStep] = useState(0);
  const maxStep = 3;
  const translateX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current; // 0..1
  const { width } = Dimensions.get('window');
  const [viewportWidth, setViewportWidth] = useState<number>(width);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setStep(0);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return false;
    }
    
    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return false;
    }
    
    // Phone validation (US format only)
    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    const usPhoneRegex = /^[0-9]{10}$/; // 10 digits for US
    
    if (!usPhoneRegex.test(cleanPhone)) {
      Alert.alert('Error', 'Please enter a valid phone number (US: (555) 123-4567)');
      return false;
    }
    
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return false;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }
    
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return false;
    }
    
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    
    return true;
  };

  // Per-step lightweight validation (no alerts) to enable Next button
  const canProceed = useMemo(() => {
    if (step === 0) {
      const hasName = name.trim().length > 0;
      const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
      const isUsPhone = /^[0-9]{10}$/.test(cleanPhone);
      return hasName && isUsPhone;
    }
    if (step === 1) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email.trim());
    }
    if (step === 2) {
      return password.trim().length >= 6 && password === confirmPassword && !!password;
    }
    return true;
  }, [step, name, phone, email, password, confirmPassword]);

  const goToStep = (next: number, animate: boolean = true) => {
    const clamped = Math.max(0, Math.min(maxStep, next));
    setStep(clamped);
    if (animate) {
      Animated.timing(translateX, {
        toValue: -clamped * (viewportWidth || width),
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.timing(progressAnim, {
        toValue: clamped / maxStep,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      translateX.setValue(-clamped * (viewportWidth || width));
      progressAnim.setValue(clamped / maxStep);
    }
  };
  const goNext = () => goToStep(step + 1);
  const goBack = () => goToStep(step - 1);

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      const newAdmin = await usersApi.createUserWithPassword({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        user_type: 'admin',
        business_id: '', // Will be set automatically by the API
      }, password);

      if (newAdmin) {
        Alert.alert(
          'Success',
          'Admin user added successfully',
          [
            {
              text: 'OK',
              onPress: () => {
                handleClose();
                onSuccess();
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', 'Error creating user. Phone number may already exist in the system');
      }
    } catch (error) {
      console.error('Error creating admin user:', error);
      Alert.alert('Error', 'Error creating user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={step === 0 ? handleClose : () => goBack()}>
            <X size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]}>add employee</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.bodyWrapper}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Stepper */}
          <View style={styles.stepperContainer}>
            <View style={styles.stepperTrack}>
              <Animated.View
                style={[styles.stepperProgress, { backgroundColor: businessColors.primary, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
              />
            </View>
            <View style={styles.stepperLabels}>
              {['Basic','Email','Password','Review'].map((label, idx) => (
                <View key={label} style={styles.stepperLabelWrap}>
                  <View style={[styles.stepDot, { borderColor: idx <= step ? businessColors.primary : '#D1D1D6', backgroundColor: idx < step ? businessColors.primary : '#FFFFFF' }]} />
                  <Text style={[styles.stepLabelText, { color: idx <= step ? businessColors.primary : '#8E8E93' }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Animated steps viewport */}
          <View style={styles.groupCard}>
            <View style={styles.stepsViewport} onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && w > 0) {
                setViewportWidth(w);
                translateX.setValue(-step * w);
              }
            }}>
              <Animated.View style={[styles.stepsContainer, { width: (viewportWidth || width) * 4, transform: [{ translateX }] }]}> 
                <View style={[styles.stepPane, { width: viewportWidth || width }]}> 
                  {/* Step 0: Basic */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Full Name *</Text>
                    <View style={styles.inputContainer}>
                      <User size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder="Enter full name"
                        placeholderTextColor="#999"
                        textAlign="left"
                        returnKeyType="next"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Phone Number *</Text>
                    <View style={styles.inputContainer}>
                      <Phone size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="(555) 123-4567"
                        placeholderTextColor="#999"
                        keyboardType="phone-pad"
                        textAlign="left"
                        returnKeyType="done"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}> 
                  {/* Step 1: Email */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email Address *</Text>
                    <View style={styles.inputContainer}>
                      <Mail size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="example@email.com"
                        placeholderTextColor="#999"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        textAlign="left"
                        returnKeyType="done"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}> 
                  {/* Step 2: Password */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password *</Text>
                    <View style={styles.inputContainer}>
                      <Lock size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter password"
                        placeholderTextColor="#999"
                        secureTextEntry
                        textAlign="left"
                        returnKeyType="next"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                    <Text style={styles.helperText}>* Minimum 6 characters</Text>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Confirm Password *</Text>
                    <View style={styles.inputContainer}>
                      <Lock size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Confirm password"
                        placeholderTextColor="#999"
                        secureTextEntry
                        textAlign="left"
                        returnKeyType="done"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}> 
                  {/* Step 3: Review */}
                  <Text style={[styles.label, { marginBottom: 12 }]}>Review</Text>
                  <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Name</Text><Text style={styles.reviewValue}>{name.trim()}</Text></View>
                  <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Phone</Text><Text style={styles.reviewValue}>{phone.trim()}</Text></View>
                  <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Email</Text><Text style={styles.reviewValue}>{email.trim()}</Text></View>
                </View>
              </Animated.View>
            </View>

            {/* Navigation controls */}
            <View style={styles.stepNavRow}>
              <TouchableOpacity onPress={goBack} disabled={step === 0} style={[styles.stepNavButton, step === 0 && styles.stepNavButtonDisabled]}>
                <Text style={[styles.stepNavText, step === 0 && styles.stepNavTextDisabled]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={step < maxStep ? goNext : handleSubmit}
                disabled={(step < maxStep && !canProceed) || isLoading}
                style={[styles.stepNavPrimary, { backgroundColor: businessColors.primary }, ((step < maxStep && !canProceed) || isLoading) && { opacity: 0.6 }]}
              >
                <Text style={styles.stepNavPrimaryText}>{step < maxStep ? 'Next' : (isLoading ? 'Saving...' : 'Done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bodyWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    zIndex: 10,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 50,
  },
  stepperContainer: {
    marginBottom: 12,
  },
  stepperTrack: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  stepperProgress: {
    height: '100%',
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stepperLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  stepLabelText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepsViewport: {
    overflow: 'hidden',
  },
  stepsContainer: {
    flexDirection: 'row',
  },
  stepPane: {
    paddingRight: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'left',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputIcon: {
    marginLeft: 4,
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    backgroundColor: 'transparent',
  },
  helperText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
    marginLeft: 4,
  },
  keyboardSpacer: {
    height: 100,
  },
  stepNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  stepNavButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  stepNavButtonDisabled: {
    opacity: 0.6,
  },
  stepNavText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
  },
  stepNavTextDisabled: {
    color: '#8E8E93',
  },
  stepNavPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  stepNavPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  reviewLabel: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'left',
    marginRight: 12,
  },
  reviewValue: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
});
