import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
  Keyboard,
  Dimensions,
  I18nManager,
  ScrollView,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { X, Layers, CreditCard, Clock, ChevronDown, Check } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { createService, updateService } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { LoginEntranceSection } from '@/components/login/LoginEntranceSection';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useAuthStore } from '@/stores/authStore';

const { height: SH } = Dimensions.get('window');

const DURATION_OPTIONS: number[] = Array.from({ length: (180 - 5) / 5 + 1 }, (_, i) => 5 + i * 5);

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

interface AddServiceModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (row: Service) => void;
  nextOrderIndex: number;
}

export default function AddServiceModal({ visible, onClose, onSuccess, nextOrderIndex }: AddServiceModalProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 24);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const activeLang = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isRtl = I18nManager.isRTL || activeLang.startsWith('he');

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isSaving, setIsSaving] = useState(false);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  const [nameFocused, setNameFocused] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  const [durationRowPressed, setDurationRowPressed] = useState(false);

  const primary = businessColors.primary;
  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.72)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.45)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.22)';
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  const btnScale = useSharedValue(1);
  const btnScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const resetForm = useCallback(() => {
    setName('');
    setPrice('');
    setDurationMinutes(60);
    setNameFocused(false);
    setPriceFocused(false);
    setDurationRowPressed(false);
    setDurationPickerOpen(false);
    setIsSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (visible) {
      setName('');
      setPrice('');
      setDurationMinutes(60);
      setDurationPickerOpen(false);
      setNameFocused(false);
      setPriceFocused(false);
      setDurationRowPressed(false);
      setIsSaving(false);
    }
  }, [visible]);

  const inputAlign = isRtl ? 'right' : 'left';

  const formComplete = useMemo(() => {
    return name.trim().length > 0 && durationMinutes >= 5;
  }, [name, durationMinutes]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('settings.services.nameRequired', 'Please enter a service name'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('settings.services.createFailed', 'Failed to create service'));
      return;
    }

    setIsSaving(true);
    try {
      const created = await createService({
        name: name.trim(),
        price: parseFloat(price.replace(/[^0-9.]/g, '')) || 0,
        duration_minutes: durationMinutes,
        is_active: true,
        worker_id: user.id as string,
      } as any);
      if (created) {
        const withOrder = await updateService(created.id, { order_index: nextOrderIndex } as Partial<Service>);
        const row: Service = (withOrder as Service) || { ...created, order_index: nextOrderIndex };
        onSuccess(row);
        handleClose();
      } else {
        Alert.alert(t('error.generic', 'Error'), t('settings.services.createFailed', 'Failed to create service'));
      }
    } catch (e) {
      console.error('AddServiceModal create:', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.services.createFailed', 'Failed to create service'));
    } finally {
      setIsSaving(false);
    }
  };

  const durationBorderActive = durationPickerOpen || durationRowPressed;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
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

        <TouchableOpacity
          style={[
            styles.closeBtn,
            {
              top: insets.top + 8,
              ...(isRtl ? { right: 16 } : { left: 16 }),
              borderColor: useLightFg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)',
              backgroundColor: useLightFg ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)',
            },
          ]}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('close', 'Close')}
        >
          <X size={22} color={heroText} strokeWidth={2.2} />
        </TouchableOpacity>

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAwareScreenScroll
            style={[styles.keyboardAvoid, { backgroundColor: 'transparent' }]}
            contentContainerStyle={[
              styles.scrollContainer,
              {
                backgroundColor: 'transparent',
                paddingVertical: 16,
                paddingBottom: bottomPad + 24,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            bounces={false}
          >
            <View style={[styles.rtlRoot, { direction: isRtl ? 'rtl' : 'ltr' }]}>
              <Pressable
                accessible={false}
                style={[styles.dismissKeyboardArea, { minHeight: Math.max(SH - insets.top - insets.bottom, 420) }]}
                onPress={Keyboard.dismiss}
              >
                <View style={[styles.formZone, { paddingBottom: bottomPad }]}>
                  <LoginEntranceSection delayMs={0} style={styles.stepBody}>
                    <Text style={[styles.heroTitle, { color: heroText }]}>
                      {t('settings.services.newService', 'New service')}
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                      {t('settings.services.addServiceModalSubtitle', 'Set the name, price, and how long the visit takes.')}
                    </Text>
                    <Text style={[styles.heroHintLine, { color: heroMuted }]}>
                      {t('settings.services.addServiceModalHint', 'The service will appear in your booking list.')}
                    </Text>

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
                        <Layers size={18} color={nameFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                      </View>
                      <TextInput
                        style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText }]}
                        placeholder={t('settings.services.enterName', 'Enter service name')}
                        placeholderTextColor={heroFaint}
                        value={name}
                        onChangeText={setName}
                        autoCorrect={false}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => setNameFocused(false)}
                        returnKeyType="next"
                        accessibilityLabel={t('settings.services.name', 'Service name')}
                      />
                    </View>

                    <View
                      style={[
                        styles.phoneOpenRow,
                        { flexDirection: 'row', marginTop: 14 },
                        {
                          borderBottomColor: priceFocused ? phoneBorderFocus : phoneBorderUnfocus,
                          borderBottomWidth: priceFocused ? 2.5 : 1.5,
                        },
                      ]}
                    >
                      <View style={styles.phoneOpenIconSlot} accessible={false}>
                        <CreditCard size={18} color={priceFocused ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                      </View>
                      <TextInput
                        style={[styles.phoneOpenInput, { textAlign: inputAlign, color: heroText, writingDirection: 'ltr' }]}
                        placeholder={t('settings.services.enterPrice', 'Enter price')}
                        placeholderTextColor={heroFaint}
                        value={price}
                        onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        autoCorrect={false}
                        onFocus={() => setPriceFocused(true)}
                        onBlur={() => setPriceFocused(false)}
                        returnKeyType="done"
                        accessibilityLabel={t('settings.services.price', 'Price')}
                      />
                    </View>

                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        setDurationPickerOpen(true);
                      }}
                      onPressIn={() => setDurationRowPressed(true)}
                      onPressOut={() => setDurationRowPressed(false)}
                      style={[
                        styles.phoneOpenRow,
                        { flexDirection: 'row', marginTop: 14 },
                        {
                          borderBottomColor: durationBorderActive ? phoneBorderFocus : phoneBorderUnfocus,
                          borderBottomWidth: durationBorderActive ? 2.5 : 1.5,
                        },
                      ]}
                    >
                      <View style={styles.phoneOpenIconSlot} accessible={false}>
                        <Clock size={18} color={durationBorderActive ? phoneBorderFocus : heroFaint} strokeWidth={1.6} />
                      </View>
                      <View style={styles.durationRowMain}>
                        <Text style={[styles.durationRowLabel, { color: heroText }]}>
                          {durationMinutes} {t('settings.services.minShort', 'min')}
                        </Text>
                        <ChevronDown size={18} color={heroFaint} />
                      </View>
                    </Pressable>
                  </LoginEntranceSection>

                  <LoginEntranceSection delayMs={420} style={[styles.btnWrap, styles.profileBtnWrap]}>
                    <Animated.View style={btnScaleStyle}>
                      <TouchableOpacity
                        onPressIn={() => {
                          btnScale.value = withTiming(0.97, { duration: 90 });
                        }}
                        onPressOut={() => {
                          btnScale.value = withSpring(1, { damping: 16, stiffness: 280 });
                        }}
                        onPress={handleSubmit}
                        disabled={!formComplete || isSaving}
                        activeOpacity={1}
                        accessibilityRole="button"
                      >
                        <View
                          style={[
                            styles.btnOuter,
                            useLightFg ? styles.btnOuterElevated : null,
                            (!formComplete || isSaving) && styles.btnOuterDisabled,
                            {
                              backgroundColor: ctaElevatedBg,
                              borderWidth: useLightFg ? 1 : StyleSheet.hairlineWidth * 2,
                              borderColor: ctaElevatedBorder,
                            },
                          ]}
                        >
                          {isSaving ? (
                            <ActivityIndicator color={ctaElevatedLabel} size="small" />
                          ) : (
                            <Text style={[styles.btnText, { color: ctaElevatedLabel }]}>
                              {t('settings.services.add', 'Add service')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  </LoginEntranceSection>
                </View>
              </Pressable>
            </View>
          </KeyboardAwareScreenScroll>
        </SafeAreaView>

        {durationPickerOpen ? (
          <Pressable
            style={styles.durationOverlay}
            onPress={() => setDurationPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('settings.admin.dismissSheet', 'Close')}
          >
            <Pressable style={styles.durationSheet} onPress={() => {}} accessibilityViewIsModal>
              <View style={styles.durationHeader}>
                <Text style={styles.durationTitle}>{t('settings.services.duration', 'Duration')}</Text>
              </View>
              <ScrollView
                style={styles.durationScroll}
                contentContainerStyle={styles.durationScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {DURATION_OPTIONS.map((mins, idx) => {
                  const isSelected = durationMinutes === mins;
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={[
                        styles.durationRow,
                        idx < DURATION_OPTIONS.length - 1 && styles.durationRowBorder,
                        isSelected && styles.durationRowSelected,
                      ]}
                      onPress={() => {
                        setDurationMinutes(mins);
                        setDurationPickerOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationRowText, isSelected && { color: primary, fontWeight: '700' }]}>
                        {mins} {t('settings.services.minShort', 'min')}
                      </Text>
                      {isSelected ? <Check size={18} color={primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 40,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keyboardAvoid: { flex: 1 },
  scrollContainer: { flexGrow: 1 },
  rtlRoot: { flex: 1 },
  dismissKeyboardArea: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'center',
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
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontWeight: '700',
  },
  heroHintLine: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 6,
    fontWeight: '700',
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
  phoneOpenIconSlot: {
    paddingBottom: 1,
    opacity: 0.95,
  },
  phoneOpenInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: 0,
    margin: 0,
  },
  durationRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
  },
  durationRowLabel: {
    fontSize: 18,
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
  durationOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  durationSheet: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.62,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  durationHeader: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    alignItems: 'center',
  },
  durationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  durationScroll: {
    maxHeight: Dimensions.get('window').height * 0.52,
  },
  durationScrollContent: {
    flexGrow: 0,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  durationRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  durationRowSelected: {
    backgroundColor: '#F2F2F7',
  },
  durationRowText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
});
