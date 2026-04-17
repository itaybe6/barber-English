import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  PanResponder,
  Dimensions,
  I18nManager,
  ScrollView,
  InputAccessoryView,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { Layers, CreditCard, Clock, ChevronDown, Check } from 'lucide-react-native';
import { createService, updateService } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { useAuthStore } from '@/stores/authStore';

const { height: SH } = Dimensions.get('window');
const SHEET_ANIM_MS = 320;
const SWIPE_CLOSE_THRESHOLD = 80;
const IOS_HIDDEN_KEYBOARD_ACCESSORY = 'addServiceModalIosHiddenAcc';
/** Same minimum sheet body height as AddAdminModal so both bottom sheets align visually */
const SHEET_SCROLL_MIN_HEIGHT = SH * 0.54;

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
  const bottomPad = Math.max(insets.bottom, 20);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const activeLang = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isRtl = I18nManager.isRTL || activeLang.startsWith('he');

  const [isMounted, setIsMounted] = useState(visible);
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
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.4)';
  const phoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.2)';
  const phoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : 'rgba(0,0,0,0.1)';
  const ctaElevatedLabel = useLightFg ? '#141414' : '#111111';
  const ctaElevatedBorder = useLightFg ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';

  // --- Animations ---
  const sheetTranslateY = useSharedValue(SH);
  const backdropOpacity = useSharedValue(0);
  const dragY = useSharedValue(0);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.get(),
  }));
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() + dragY.get() }],
  }));

  // Mount/unmount + animate in/out
  useEffect(() => {
    if (visible) {
      setIsMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!isMounted) return;
    if (visible) {
      sheetTranslateY.set(SH);
      backdropOpacity.set(0);
      dragY.set(0);
      const frame = requestAnimationFrame(() => {
        sheetTranslateY.set(withTiming(0, { duration: SHEET_ANIM_MS, easing: Easing.out(Easing.cubic) }));
        backdropOpacity.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
      });
      return () => cancelAnimationFrame(frame);
    }
    sheetTranslateY.set(withTiming(SH, { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    backdropOpacity.set(withTiming(0, { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    const timer = setTimeout(() => setIsMounted(false), SHEET_ANIM_MS);
    return () => clearTimeout(timer);
  }, [backdropOpacity, dragY, isMounted, sheetTranslateY, visible]);

  const inputAlign = isRtl ? 'right' : 'left';
  const formComplete = useMemo(() => name.trim().length > 0 && durationMinutes >= 5, [name, durationMinutes]);
  const durationBorderActive = durationPickerOpen || durationRowPressed;

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
    Keyboard.dismiss();
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (visible) resetForm();
  }, [visible, resetForm]);

  // --- Swipe to close (PanResponder on drag handle) ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) dragY.set(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_CLOSE_THRESHOLD || gs.vy > 0.8) {
          dragY.set(withTiming(SH, { duration: 280, easing: Easing.in(Easing.cubic) }));
          setTimeout(() => {
            resetForm();
            onClose();
          }, 260);
        } else {
          dragY.set(withSpring(0, { damping: 18, stiffness: 260 }));
        }
      },
    })
  ).current;

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

  if (!isMounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot} pointerEvents="box-none">
        {/* Animated backdrop */}
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} accessible={false} />
        </Animated.View>

        <Animated.View style={[styles.sheetOuter, sheetAnimatedStyle]}>
            <LinearGradient
              colors={[...loginGradient]}
              style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}
            />

            {/* Drag handle — touch area for swipe-to-close */}
            <View style={styles.handleArea} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
            </View>

            <KeyboardAwareScreenScroll
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              bounces={false}
              enableOnAndroid
              extraScrollHeight={22}
              extraHeight={8}
              enableAutomaticScroll
              enableResetScrollToCoords={false}
              contentContainerStyle={[
                styles.sheetContent,
                { direction: isRtl ? 'rtl' : 'ltr', paddingBottom: bottomPad + 8 },
              ]}
            >
              <Text style={[styles.heroTitle, { color: heroText }]}>
                {t('settings.services.newService', 'שירות חדש')}
              </Text>
              <Text style={[styles.heroSubtitle, { color: heroMuted }]}>
                {t('settings.services.addServiceModalSubtitle', 'שם השירות, מחיר ומשך התור.')}
              </Text>

              {/* Name */}
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
                  placeholder={t('settings.services.enterName', 'הזן שם שירות')}
                  placeholderTextColor={heroFaint}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  returnKeyType="next"
                />
              </View>

              {/* Price */}
              <View
                style={[
                  styles.phoneOpenRow,
                  { flexDirection: 'row', marginTop: 12 },
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
                  placeholder={t('settings.services.enterPrice', 'הזן מחיר')}
                  placeholderTextColor={heroFaint}
                  value={price}
                  onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  onFocus={() => setPriceFocused(true)}
                  onBlur={() => setPriceFocused(false)}
                  returnKeyType="done"
                  enterKeyHint="done"
                  inputAccessoryViewID={Platform.OS === 'ios' ? IOS_HIDDEN_KEYBOARD_ACCESSORY : undefined}
                />
              </View>

              {/* Duration */}
              <Pressable
                onPress={() => { Keyboard.dismiss(); setDurationPickerOpen(true); }}
                onPressIn={() => setDurationRowPressed(true)}
                onPressOut={() => setDurationRowPressed(false)}
                style={[
                  styles.phoneOpenRow,
                  { flexDirection: 'row', marginTop: 12 },
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
                    {durationMinutes} {t('settings.services.minShort', 'דק׳')}
                  </Text>
                  <ChevronDown size={18} color={heroFaint} />
                </View>
              </Pressable>

              {/* Submit button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!formComplete || isSaving}
                activeOpacity={0.85}
                style={styles.btnWrap}
              >
                <View
                  style={[
                    styles.btnOuter,
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
                      {t('settings.services.add', 'הוספת שירות')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </KeyboardAwareScreenScroll>

          </Animated.View>

        {/* Duration picker — centered popup, outside sheet so overflow:hidden doesn't clip it */}
        {durationPickerOpen ? (
          <Pressable
            style={styles.durationOverlay}
            onPress={() => setDurationPickerOpen(false)}
          >
            <Pressable style={styles.durationPopup} onPress={() => {}} accessibilityViewIsModal>
              <View style={styles.durationHeader}>
                <Text style={styles.durationTitle}>{t('settings.services.duration', 'משך התור')}</Text>
              </View>
              <ScrollView
                style={styles.durationScroll}
                contentContainerStyle={styles.durationScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
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
                      onPress={() => { setDurationMinutes(mins); setDurationPickerOpen(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationRowText, isSelected && { color: primary, fontWeight: '700' }]}>
                        {mins} {t('settings.services.minShort', 'דק׳')}
                      </Text>
                      {isSelected ? <Check size={18} color={primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        ) : null}

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={IOS_HIDDEN_KEYBOARD_ACCESSORY}>
            <View style={styles.iosKeyboardAccEmpty} />
          </InputAccessoryView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosKeyboardAccEmpty: {
    height: 0,
    width: '100%',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetScroll: {
    minHeight: SHEET_SCROLL_MIN_HEIGHT,
    maxHeight: SH * 0.88,
    width: '100%',
  },
  sheetOuter: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  sheetContent: {
    paddingHorizontal: 26,
    paddingTop: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 28,
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    paddingHorizontal: 4,
    fontWeight: '600',
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
    marginTop: 0,
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
    marginTop: 24,
    marginBottom: 4,
  },
  btnOuter: {
    minHeight: 52,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  durationPopup: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.55,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  durationHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    alignItems: 'center',
  },
  durationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  durationScroll: {
    maxHeight: Dimensions.get('window').height * 0.44,
  },
  durationScrollContent: {
    flexGrow: 0,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  durationRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F5',
  },
  durationRowSelected: {
    backgroundColor: '#F5F5FA',
  },
  durationRowText: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '500',
  },
});
