import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  DeviceEventEmitter,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Calendar as CalendarIcon,
  Search,
  User,
  Clock,
  CalendarDays,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Check,
  ClipboardList,
} from 'lucide-react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { formatBookingTimeLabel } from '@/lib/hooks/useAdminAddAppointmentForm';
import { useAddRecurringAppointmentForm } from '@/lib/hooks/useAddRecurringAppointmentForm';
import type { Service } from '@/lib/supabase';
import { ADMIN_RECURRING_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';

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

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const SETTINGS_TAB = '/(tabs)/settings' as const;
const TOTAL_WIZARD_STEPS = 6;

export default function AddRecurringAppointmentScreen() {
  const insets = useSafeAreaInsets();

  const goBackToSettings = useCallback(() => {
    router.replace(SETTINGS_TAB);
  }, []);

  const onCreated = useCallback(() => {
    DeviceEventEmitter.emit(ADMIN_RECURRING_APPOINTMENTS_CHANGED);
    goBackToSettings();
  }, [goBackToSettings]);

  const form = useAddRecurringAppointmentForm(onCreated);

  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const layoutRtl = I18nManager.isRTL;
  const isHeCopy = i18n.language?.startsWith('he') ?? true;
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;

  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.62)';
  const glassBg = useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)';
  const glassBorder = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.08)';
  const fieldBg = useLightFg ? 'rgba(255,255,255,0.18)' : '#F5F5F7';
  const fieldBorder = useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.08)';
  const innerText = useLightFg ? '#FFFFFF' : businessColors.text;
  const innerMuted = useLightFg ? 'rgba(255,255,255,0.96)' : businessColors.textSecondary;
  const placeholderOnGlass = useLightFg ? 'rgba(255,255,255,0.78)' : undefined;
  const iconOnGlass = useLightFg ? heroText : primary;
  const iconOnField = useLightFg ? heroText : innerMuted;

  const textAlignPrimary = (layoutRtl ? 'right' : 'left') as 'right' | 'left';
  const inputTextAlign = (layoutRtl ? 'right' : 'left') as 'right' | 'left';
  const useRtlInputPlaceholder = layoutRtl || isHeCopy;
  const writingDir = (layoutRtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr';
  const titleShadowStyle = useMemo(
    () =>
      useLightFg
        ? {
            textShadowColor: 'rgba(0,0,0,0.32)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }
        : {},
    [useLightFg],
  );

  const summaryReady = !!(
    form.selectedClient &&
    form.selectedService &&
    form.selectedDayOfWeek !== null &&
    form.selectedTime
  );
  const canSubmit = summaryReady && !form.isSubmitting;

  const [wizardStep, setWizardStep] = useState(1);

  useFocusEffect(
    useCallback(() => {
      form.reset();
      setWizardStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const canAdvanceFromStep = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return !!form.selectedClient;
      case 2:
        return !!form.selectedService;
      case 3:
        return form.selectedDayOfWeek !== null;
      case 4:
        return !!form.selectedTime;
      case 5:
        return true;
      default:
        return false;
    }
  }, [wizardStep, form.selectedClient, form.selectedService, form.selectedDayOfWeek, form.selectedTime]);

  const footerPrimaryEnabled = wizardStep === TOTAL_WIZARD_STEPS ? canSubmit : canAdvanceFromStep;

  const onHeaderBack = useCallback(() => {
    if (wizardStep > 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setWizardStep((s) => Math.max(1, s - 1));
    } else {
      goBackToSettings();
    }
  }, [wizardStep, goBackToSettings]);

  const onFooterPrimary = useCallback(() => {
    if (!footerPrimaryEnabled || form.isSubmitting) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (wizardStep < TOTAL_WIZARD_STEPS) {
      form.setShowClientDropdown(false);
      form.setShowServiceDropdown(false);
      setWizardStep((s) => Math.min(TOTAL_WIZARD_STEPS, s + 1));
    } else {
      void form.submit();
    }
  }, [footerPrimaryEnabled, form, wizardStep]);

  const stepTitle = useMemo(() => {
    const keys = [
      ['settings.recurring.wizardStepTitleClient', 'Client'],
      ['settings.recurring.wizardStepTitleService', 'Service'],
      ['settings.recurring.wizardStepTitleDay', 'Day of week'],
      ['settings.recurring.wizardStepTitleTime', 'Time'],
      ['settings.recurring.wizardStepTitleRepeat', 'How often'],
      ['settings.recurring.wizardStepTitleSummary', 'Summary'],
    ] as const;
    const pair = keys[wizardStep - 1] ?? keys[0];
    return t(pair[0], pair[1]);
  }, [wizardStep, t]);

  const stepSubtitle = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return t('admin.appointmentsAdmin.pickClient', 'Pick the client for this appointment');
      case 2:
        return t('admin.appointmentsAdmin.pickService', 'Choose the service to perform');
      case 3:
        return t('settings.recurring.selectDayOfWeek', 'Select a day of the week');
      case 4:
        return !form.selectedService || form.selectedDayOfWeek === null
          ? t('settings.recurring.selectServiceAndDayFirst', 'Select a service and day to see available times')
          : t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot');
      case 5:
        return t('settings.recurring.repeatHint', 'Set how often this repeats');
      default:
        return t('settings.recurring.wizardStepSubtitleSummary', 'Review the details before saving');
    }
  }, [wizardStep, t, form.selectedService, form.selectedDayOfWeek]);

  const scrollBottomPad = Math.max(insets.bottom, 20) + 88;

  const repeatOptions = [1, 2, 3, 4] as const;

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

      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onHeaderBack}
            style={({ pressed }) => [
              styles.headerBackCircle,
              {
                backgroundColor: useLightFg ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)',
                borderColor: useLightFg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.08)',
                opacity: pressed ? 0.82 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={wizardStep > 1 ? t('settings.recurring.wizardBackStep', 'Previous step') : t('back', 'Back')}
          >
            <Ionicons name="arrow-forward" size={20} color={heroText} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text
              style={[styles.headerTitle, titleShadowStyle, { color: heroText, writingDirection: writingDir }]}
              numberOfLines={1}
            >
              {t('settings.recurring.addTitle', 'Add fixed appointment')}
            </Text>
          </View>
          <View style={styles.headerIconBtn} />
        </View>
      </SafeAreaView>

      <KeyboardAwareScreenScroll
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_WIZARD_STEPS }, (_, i) => {
            const done = i < wizardStep;
            const segBg = useLightFg
              ? done
                ? '#FFFFFF'
                : 'rgba(255,255,255,0.22)'
              : done
                ? primary
                : 'rgba(0,0,0,0.08)';
            return <View key={i} style={[styles.progressSegment, { backgroundColor: segBg }]} />;
          })}
        </View>

        <View style={styles.stepIntroWrap}>
          <Animated.View key={wizardStep} entering={FadeIn.duration(220)} style={styles.stepIntroInner}>
            <View style={[styles.stepIntroTitleRow, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
              <View style={[styles.stepIntroIconWrap, { backgroundColor: `${primary}40` }]}>
                {wizardStep === 1 ? (
                  <User size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 2 ? (
                  <CalendarIcon size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 3 ? (
                  <CalendarDays size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 4 ? (
                  <Clock size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 5 ? (
                  <Repeat size={22} color={heroText} strokeWidth={2} />
                ) : (
                  <ClipboardList size={22} color={heroText} strokeWidth={2} />
                )}
              </View>
              <Text
                style={[
                  styles.stepIntroTitle,
                  titleShadowStyle,
                  {
                    color: heroText,
                    textAlign: textAlignPrimary,
                    writingDirection: writingDir,
                  },
                ]}
                numberOfLines={2}
              >
                {stepTitle}
              </Text>
            </View>
            <Text
              style={[
                styles.stepIntroSubtitle,
                titleShadowStyle,
                {
                  color: heroMuted,
                  textAlign: 'center',
                  writingDirection: writingDir,
                },
              ]}
              numberOfLines={3}
            >
              {stepSubtitle}
            </Text>
          </Animated.View>
        </View>

        <View
          style={[
            styles.glassCard,
            {
              backgroundColor: glassBg,
              borderColor: glassBorder,
            },
          ]}
        >
          <Animated.View key={wizardStep} entering={FadeIn.duration(280)}>
            {wizardStep === 1 ? (
              <View style={styles.section}>
                {!form.selectedClient ? (
                  <>
                    <View
                      style={[
                        styles.fieldShell,
                        { backgroundColor: fieldBg, borderColor: fieldBorder },
                        layoutRtl && styles.fieldShellVisualRtl,
                      ]}
                    >
                      <View style={styles.fieldInputSlot}>
                        <TextInput
                          style={[
                            styles.fieldInput,
                            {
                              color: innerText,
                              textAlign: inputTextAlign,
                              writingDirection: writingDir,
                            },
                          ]}
                          value={form.clientSearch}
                          onChangeText={(txt) => void form.searchClients(txt)}
                          placeholder={useRtlInputPlaceholder ? '' : t('admin.appointmentsAdmin.selectClientPlaceholder')}
                          placeholderTextColor={placeholderOnGlass ?? innerMuted}
                          onFocus={() => form.setShowClientDropdown(true)}
                          textAlignVertical="center"
                        />
                        {useRtlInputPlaceholder && !form.clientSearch.trim() ? (
                          <Text
                            pointerEvents="none"
                            numberOfLines={1}
                            style={[
                              styles.inputPlaceholderOverlay,
                              {
                                color: placeholderOnGlass ?? innerMuted,
                                textAlign: inputTextAlign,
                                writingDirection: writingDir,
                              },
                            ]}
                          >
                            {t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')}
                          </Text>
                        ) : null}
                      </View>
                      <Search size={18} color={innerMuted} />
                    </View>
                    {form.showClientDropdown ? (
                      <View style={[styles.dropdown, { borderColor: fieldBorder, backgroundColor: glassBg }]}>
                        <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {form.clientResults.slice(0, 60).map((client) => (
                            <Pressable
                              key={client.phone}
                              style={({ pressed }) => [styles.dropdownRow, pressed && { opacity: 0.85 }]}
                              onPress={() => {
                                form.setSelectedClient(client);
                                form.setShowClientDropdown(false);
                              }}
                            >
                              <LinearGradient
                                colors={[primary, secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatarSm}
                              >
                                <Text style={styles.avatarSmText}>{(client.name || '?').charAt(0).toUpperCase()}</Text>
                              </LinearGradient>
                              <View style={styles.dropdownRowText}>
                                <Text
                                  style={[
                                    styles.dropdownName,
                                    { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {client.name}
                                </Text>
                                <Text
                                  style={[
                                    styles.dropdownSub,
                                    { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {client.phone}
                                </Text>
                              </View>
                            </Pressable>
                          ))}
                          {form.clientResults.length === 0 ? (
                            <Text
                              style={[
                                styles.emptyTxt,
                                styles.hintBlock,
                                { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                              ]}
                            >
                              {t('common.noResults', 'No results')}
                            </Text>
                          ) : null}
                        </ScrollView>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={[styles.selectedRow, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                    <LinearGradient colors={[primary, secondary]} style={styles.avatarSm}>
                      <Text style={styles.avatarSmText}>{form.selectedClient.name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                    <View style={styles.selectedRowMid}>
                      <Text
                        style={[
                          styles.dropdownName,
                          { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                        ]}
                        numberOfLines={1}
                      >
                        {form.selectedClient.name}
                      </Text>
                      <Text
                        style={[
                          styles.dropdownSub,
                          { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                        ]}
                        numberOfLines={1}
                      >
                        {form.selectedClient.phone}
                      </Text>
                    </View>
                    <Pressable onPress={() => form.setSelectedClient(null)} hitSlop={12}>
                      <Text style={[styles.changeLink, { color: primary }]}>{t('common.change', 'Change')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {wizardStep === 2 ? (
              <View style={styles.section}>
                <Pressable
                  style={({ pressed }) => [
                    styles.fieldShell,
                    { backgroundColor: fieldBg, borderColor: fieldBorder },
                    layoutRtl && styles.fieldShellVisualRtl,
                    pressed && { opacity: 0.92 },
                  ]}
                  onPress={() => form.setShowServiceDropdown(!form.showServiceDropdown)}
                >
                  <Text
                    style={[
                      styles.fieldInput,
                      styles.fieldPlaceholderText,
                      {
                        flex: 1,
                        color: form.selectedService ? innerText : innerMuted,
                        textAlign: inputTextAlign,
                        writingDirection: writingDir,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {form.selectedService
                      ? `${form.selectedService.name} · ₪${form.selectedService.price}`
                      : t('admin.appointmentsAdmin.selectServicePlaceholder', 'Select service...')}
                  </Text>
                  <CalendarIcon size={18} color={iconOnField} />
                </Pressable>
                {form.showServiceDropdown ? (
                  <View style={[styles.dropdown, { borderColor: fieldBorder, backgroundColor: glassBg }]}>
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {form.services.length === 0 ? (
                        <Text
                          style={[
                            styles.emptyTxt,
                            styles.hintBlock,
                            { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                          ]}
                        >
                          {t('booking.noServices', 'No services available')}
                        </Text>
                      ) : (
                        form.services.map((service: Service) => (
                          <Pressable
                            key={service.id}
                            style={({ pressed }) => [styles.serviceRow, pressed && { opacity: 0.88 }]}
                            onPress={() => {
                              form.setSelectedService(service);
                              form.setShowServiceDropdown(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.serviceRowText,
                                styles.hintBlock,
                                {
                                  color: innerText,
                                  textAlign: inputTextAlign,
                                  writingDirection: writingDir,
                                },
                              ]}
                              numberOfLines={2}
                            >
                              {service.name}
                              <Text style={[styles.servicePriceInline, { color: innerText }]}>{` · ₪${service.price}`}</Text>
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : null}

            {wizardStep === 3 ? (
              <View style={styles.section}>
                <View style={[styles.chipsWrap, layoutRtl && styles.chipsWrapRtl]}>
                  {DAY_KEYS.map((key, idx) => {
                    const sel = form.selectedDayOfWeek === idx;
                    const label = t(`day.${key}`, key);
                    return (
                      <Pressable key={key} onPress={() => form.setSelectedDayOfWeek(idx)} style={styles.chipPress}>
                        {sel ? (
                          <LinearGradient
                            colors={[primary, secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.chipActive}
                          >
                            <Text style={styles.chipActiveTxt} numberOfLines={1}>
                              {label}
                            </Text>
                          </LinearGradient>
                        ) : (
                          <View style={[styles.chipIdle, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                            <Text style={[styles.chipIdleTxt, { color: innerText }]} numberOfLines={1}>
                              {label}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {wizardStep === 4 ? (
              <View style={[styles.section, styles.sectionLast]}>
                {form.selectedService && form.selectedDayOfWeek !== null ? (
                  form.isLoadingTimes ? (
                    <View style={styles.timesLoading}>
                      <ActivityIndicator color={iconOnGlass} />
                      <Text
                        style={[
                          styles.emptyTxt,
                          styles.hintBlock,
                          {
                            color: innerMuted,
                            marginTop: 8,
                            textAlign: textAlignPrimary,
                            writingDirection: writingDir,
                          },
                        ]}
                      >
                        {t('selectTime.loadingTimes', 'Loading available times...')}
                      </Text>
                    </View>
                  ) : form.availableTimes.length === 0 ? (
                    <Text
                      style={[
                        styles.emptyTxt,
                        styles.hintBlock,
                        { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                      ]}
                    >
                      {t('selectTime.noTimes', 'No available times for this day')}
                    </Text>
                  ) : (
                    <View style={[styles.chipsWrap, layoutRtl && styles.chipsWrapRtl]}>
                      {form.availableTimes.map((time) => {
                        const sel = form.selectedTime === time;
                        return (
                          <Pressable key={time} onPress={() => void form.onPickTime(time)} style={styles.chipPress}>
                            {sel ? (
                              <LinearGradient
                                colors={[primary, secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.chipActive}
                              >
                                <Text style={styles.chipActiveTxt}>{formatBookingTimeLabel(time, i18n.language)}</Text>
                              </LinearGradient>
                            ) : (
                              <View style={[styles.chipIdle, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                                <Text style={[styles.chipIdleTxt, { color: innerText }]}>
                                  {formatBookingTimeLabel(time, i18n.language)}
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )
                ) : null}
              </View>
            ) : null}

            {wizardStep === 5 ? (
              <View style={[styles.section, styles.sectionLast]}>
                <View style={[styles.chipsWrap, layoutRtl && styles.chipsWrapRtl]}>
                  {repeatOptions.map((w) => {
                    const sel = form.repeatWeeks === w;
                    const label =
                      w === 1
                        ? t('settings.recurring.everyWeek', 'every week')
                        : t('settings.recurring.everyNWeeks', 'every {{count}} weeks', { count: w });
                    return (
                      <Pressable key={w} onPress={() => form.setRepeatWeeks(w)} style={styles.chipPress}>
                        {sel ? (
                          <LinearGradient
                            colors={[primary, secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.chipActive}
                          >
                            <Text style={styles.chipActiveTxt} numberOfLines={1}>
                              {label}
                            </Text>
                          </LinearGradient>
                        ) : (
                          <View style={[styles.chipIdle, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                            <Text style={[styles.chipIdleTxt, { color: innerText }]} numberOfLines={2}>
                              {label}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {wizardStep === 6 && summaryReady ? (
              <View style={[styles.section, styles.sectionLast]}>
                {/* Client row */}
                <View style={[styles.summaryRow, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <User size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: layoutRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('admin.appointmentsAdmin.client', 'Client')}
                    </Text>
                    <Text style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]} numberOfLines={1}>
                      {form.selectedClient?.name}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                {/* Service row */}
                <View style={[styles.summaryRow, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <CalendarIcon size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: layoutRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('booking.field.service', 'Service')}
                    </Text>
                    <Text style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]} numberOfLines={2}>
                      {form.selectedService?.name}
                      {form.selectedService?.price ? (
                        <Text style={{ fontWeight: '800' }}>{` · ₪${form.selectedService.price}`}</Text>
                      ) : null}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                {/* Day + Time row */}
                <View style={[styles.summaryRow, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <CalendarDays size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: layoutRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('settings.recurring.dayOfWeek', 'Day of week')}
                    </Text>
                    <Text style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]}>
                      {form.selectedDayOfWeek !== null
                        ? t(`day.${DAY_KEYS[form.selectedDayOfWeek]}`, DAY_KEYS[form.selectedDayOfWeek])
                        : ''}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                {/* Time row — highlighted */}
                <View style={[styles.summaryRow, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <Clock size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: layoutRtl ? 'flex-end' : 'flex-start', flex: 1 }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('booking.field.time', 'Time')}
                    </Text>
                    <View style={[styles.summaryTimePill, { backgroundColor: `${primary}22` }]}>
                      <Text style={[styles.summaryTimePillText, { color: innerText }]}>
                        {form.selectedTime ? formatBookingTimeLabel(form.selectedTime, i18n.language) : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                {/* Repeat row */}
                <View style={[styles.summaryRow, styles.summaryRowLast, { flexDirection: layoutRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <Repeat size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: layoutRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('settings.recurring.repeatEvery', 'Repeat every')}
                    </Text>
                    <Text style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]}>
                      {form.repeatWeeks === 1
                        ? t('settings.recurring.everyWeek', 'every week')
                        : t('settings.recurring.everyNWeeks', 'every {{count}} weeks', { count: form.repeatWeeks })}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </View>

      </KeyboardAwareScreenScroll>

      <View
        pointerEvents="box-none"
        style={[styles.footerAnchor, { bottom: Math.max(insets.bottom, 12) + 8 }]}
      >
        <View style={[styles.footerBarInner, { direction: 'ltr' }]}>
          <Pressable
            onPress={onFooterPrimary}
            disabled={!footerPrimaryEnabled || form.isSubmitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: !footerPrimaryEnabled || form.isSubmitting }}
            style={({ pressed }) => [
              styles.footerPrimaryPill,
              styles.footerPrimaryShadow,
              {
                opacity: !footerPrimaryEnabled || form.isSubmitting ? 0.5 : pressed ? 0.88 : 1,
              },
            ]}
          >
            {form.isSubmitting && wizardStep === TOTAL_WIZARD_STEPS ? (
              <ActivityIndicator color={primary} />
            ) : wizardStep === TOTAL_WIZARD_STEPS ? (
              <View style={styles.footerPrimaryFill}>
                <Text style={[styles.footerPrimaryText, { color: primary }]}>
                  {t('settings.recurring.saveButton', 'Save fixed appointment')}
                </Text>
                <Check size={20} color={primary} strokeWidth={2.6} />
              </View>
            ) : (
              <View style={styles.footerPrimaryFill}>
                {layoutRtl ? (
                  <ChevronRight size={20} color={footerPrimaryEnabled ? primary : '#c4c7cf'} strokeWidth={2.5} />
                ) : (
                  <ChevronLeft size={20} color={footerPrimaryEnabled ? primary : '#c4c7cf'} strokeWidth={2.5} />
                )}
                <Text style={[styles.footerPrimaryText, { color: footerPrimaryEnabled ? primary : '#c4c7cf' }]}>
                  {t('booking.continue', 'Continue')}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeTop: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 52,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  scrollFlex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'stretch',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 3,
  },
  stepIntroWrap: {
    marginTop: 28,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  stepIntroInner: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  stepIntroTitleRow: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  stepIntroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIntroTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    flexShrink: 1,
    maxWidth: 280,
  },
  stepIntroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    maxWidth: 340,
    alignSelf: 'center',
  },
  summaryInline: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  summaryRow: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  summaryRowLast: {
    paddingBottom: 4,
  },
  summaryRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryRowLbl: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  summaryRowVal: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
    marginHorizontal: 2,
  },
  summaryTimePill: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  summaryTimePillText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  footerAnchor: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 50,
  },
  footerBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryPill: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  footerPrimaryShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  footerPrimaryFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  footerPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  glassCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  section: {
    marginBottom: 4,
  },
  sectionLast: {
    marginBottom: 0,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    alignSelf: 'stretch',
  },
  sectionHeadVisualRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  hintBlock: {
    alignSelf: 'stretch',
    width: '100%',
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  sectionHint: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
    fontWeight: '700',
  },
  fieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 10,
  },
  fieldShellVisualRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
  },
  fieldInputSlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: Platform.OS === 'ios' ? 44 : 40,
  },
  fieldPlaceholderText: {
    alignSelf: 'stretch',
    width: '100%',
  },
  inputPlaceholderOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    fontSize: 16,
    lineHeight: Platform.OS === 'ios' ? 22 : 20,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'android' ? { elevation: 1 } : {}),
  },
  dropdown: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 220,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  dropdownRowText: {
    flex: 1,
    minWidth: 0,
  },
  dropdownName: {
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownSub: {
    fontSize: 13,
    marginTop: 2,
  },
  avatarSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  selectedRowMid: {
    flex: 1,
    minWidth: 0,
  },
  changeLink: {
    fontSize: 15,
    fontWeight: '700',
  },
  serviceRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  serviceRowText: {
    fontSize: 16,
    fontWeight: '600',
  },
  servicePriceInline: {
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    opacity: 0.85,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
    alignSelf: 'stretch',
  },
  chipsWrapRtl: {
    direction: 'ltr',
    justifyContent: 'flex-end',
  },
  chipPress: {
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  chipActive: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  chipActiveTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  chipIdle: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipIdleTxt: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  timesLoading: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyTxt: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
  },
  summaryCard: {
    marginTop: 18,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 14,
    opacity: 1,
  },
  summaryGrid: {
    gap: 6,
  },
  summaryLbl: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '600',
  },
});
