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
  Modal,
  Alert,
} from 'react-native';
import * as Calendar from 'expo-calendar';
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import { isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  Calendar as CalendarIcon,
  Search,
  User,
  Clock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  useAdminAddAppointmentForm,
  formatDateToLocalString,
  formatTimeToAMPM,
  parseDateKeyToLocalDate,
  type AdminBookingSaveSuccessPayload,
} from '@/lib/hooks/useAdminAddAppointmentForm';
import type { Service } from '@/lib/supabase';
import { ADMIN_CALENDAR_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';

LocaleConfig.locales['en'] = {
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today',
  direction: 'ltr',
};

LocaleConfig.locales['he'] = {
  monthNames: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
  monthNamesShort: ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
  dayNames: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  dayNamesShort: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  today: 'היום',
  direction: 'rtl',
};

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

function parseDateParam(raw: string | string[] | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) && raw[0] ? String(raw[0]).trim() : '';
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export default function AddAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const initialDateKey = parseDateParam(params.date);

  const onBookedSuccess = useCallback(() => {
    DeviceEventEmitter.emit(ADMIN_CALENDAR_APPOINTMENTS_CHANGED);
    router.back();
  }, []);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successAnimKey, setSuccessAnimKey] = useState(0);
  const [successSnapshot, setSuccessSnapshot] = useState<AdminBookingSaveSuccessPayload | null>(null);

  const onSaveSuccess = useCallback((payload: AdminBookingSaveSuccessPayload) => {
    setSuccessSnapshot(payload);
    setSuccessAnimKey((k) => k + 1);
    setShowSuccessModal(true);
  }, []);

  const form = useAdminAddAppointmentForm({
    initialDateKey,
    onSaveSuccess,
    onSuccess: onBookedSuccess,
  });

  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  /** Align with real layout RTL (not only i18n) — avoids titles stuck on wrong edge */
  const layoutRtl = I18nManager.isRTL;
  const isHeCopy = i18n.language?.startsWith('he') ?? true;
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;

  const calendarLocale = isHeCopy ? 'he' : 'en';
  LocaleConfig.defaultLocale = calendarLocale;

  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  /** Stronger whites on blue gradient for readability */
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.62)';
  const heroFaint = useLightFg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)';
  const glassBg = useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)';
  const glassBorder = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.08)';
  const fieldBg = useLightFg ? 'rgba(255,255,255,0.18)' : '#F5F5F7';
  const fieldBorder = useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.08)';
  const innerText = useLightFg ? '#FFFFFF' : businessColors.text;
  const innerMuted = useLightFg ? 'rgba(255,255,255,0.96)' : businessColors.textSecondary;
  const placeholderOnGlass = useLightFg ? 'rgba(255,255,255,0.78)' : undefined;
  const ctaElevatedBg = useLightFg ? '#FFFFFF' : primary;
  const ctaElevatedLabel = useLightFg ? '#141414' : '#FFFFFF';
  /** Lucide icons on glass / gradient — solid white reads clearer than brand primary */
  const iconOnGlass = useLightFg ? heroText : primary;
  const iconOnField = useLightFg ? heroText : innerMuted;

  const dateLocale = isHeCopy ? 'he-IL' : 'en-US';
  /** `start` follows writingDirection — reliable with forced RTL mirroring */
  const textAlignPrimary = (layoutRtl ? 'start' : 'left') as 'start' | 'left';
  /** Placeholders on Android often ignore `start`; explicit `right` keeps hint + value on the correct edge */
  const inputTextAlign = (layoutRtl ? 'right' : 'left') as 'right' | 'left';
  /** Custom placeholder layer when RTL or Hebrew copy — native hint often stays LTR-left */
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

  const adminBookingSuccessLines = useMemo((): SuccessLine[] => {
    if (!showSuccessModal || !successSnapshot) return [];
    const { client, service, date, time } = successSnapshot;
    const loc = toBcp47Locale(i18n?.language);
    const dateFormatted = date.toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const durationM =
      service.duration_minutes && service.duration_minutes > 0 ? service.duration_minutes : 60;

    const lines: SuccessLine[] = [
      {
        variant: 'headline',
        text: t('booking.successAnimatedHeadline', 'התור נקבע בהצלחה'),
      },
      {
        variant: 'accent',
        text: `${t('booking.field.service', 'שירות')}: ${service.name}`,
      },
      {
        variant: 'body',
        text: `${t('admin.appointmentsAdmin.client', 'Client')}: ${client.name} (${client.phone})`,
      },
      {
        variant: 'body',
        text: `${t('booking.field.date', 'תאריך')}: ${dateFormatted}`,
      },
      {
        variant: 'body',
        text: `${t('booking.field.time', 'שעה')}: ${formatTimeToAMPM(time)}`,
      },
    ];
    lines.push({
      variant: 'body',
      text:
        (service.price ?? 0) > 0
          ? `${durationM} ${t('booking.min', 'דק׳')} · ₪${service.price}`
          : `${durationM} ${t('booking.min', 'דק׳')}`,
    });
    return lines;
  }, [showSuccessModal, successSnapshot, i18n?.language, t]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: 'transparent',
      textDayFontSize: 15,
      textMonthFontSize: 16,
      textDayHeaderFontSize: 12,
      arrowColor: useLightFg ? heroText : primary,
      selectedDayBackgroundColor: primary,
      todayTextColor: primary,
      dayTextColor: useLightFg ? 'rgba(255,255,255,0.95)' : '#1C1C1E',
      monthTextColor: useLightFg ? '#FFFFFF' : '#1C1C1E',
      textDisabledColor: useLightFg ? 'rgba(255,255,255,0.48)' : '#C6C6C8',
      textDayFontWeight: '500' as const,
      'stylesheet.calendar.header': {
        week: {
          flexDirection: 'row' as const,
          justifyContent: 'space-around' as const,
          paddingHorizontal: 0,
        },
        dayHeader: {
          flex: 1,
          textAlign: 'center' as const,
          fontSize: 11,
          fontWeight: '700' as const,
          color: useLightFg ? 'rgba(255,255,255,0.9)' : '#8E8E93',
        },
      },
      'stylesheet.calendar.main': {
        week: {
          flexDirection: 'row' as const,
          justifyContent: 'space-around' as const,
          paddingHorizontal: 0,
        },
        day: {
          flex: 1,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
      },
    }),
    [primary, useLightFg, heroText]
  );

  const calendarRenderArrow = useCallback(
    (direction: string) => {
      const size = 22;
      const c = heroText;
      if (calendarLocale === 'he') {
        return direction === 'left' ? (
          <ChevronRight size={size} color={c} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={size} color={c} strokeWidth={2.5} />
        );
      }
      return direction === 'left' ? (
        <ChevronLeft size={size} color={c} strokeWidth={2.5} />
      ) : (
        <ChevronRight size={size} color={c} strokeWidth={2.5} />
      );
    },
    [calendarLocale, heroText]
  );

  const summaryReady = !!(
    form.selectedDate &&
    form.selectedClient &&
    form.selectedService &&
    form.selectedTime
  );
  const canSubmit = summaryReady && !form.isSubmitting;

  const bottomPad = Math.max(insets.bottom, 20) + 72;

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
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel={t('back', 'Back')}
          >
            <Ionicons name="arrow-forward" size={26} color={heroText} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text
              style={[styles.headerTitle, titleShadowStyle, { color: heroText, writingDirection: writingDir }]}
              numberOfLines={1}
            >
              {t('admin.appointmentsAdmin.addAppointment', 'Add appointment')}
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                titleShadowStyle,
                { color: heroMuted, textAlign: 'center', writingDirection: writingDir },
              ]}
              numberOfLines={2}
            >
              {t('admin.appointmentsAdmin.addPageSubtitle', 'מלאו את הפרטים — הכל בעמוד אחד')}
            </Text>
          </View>
          <View style={styles.headerIconBtn} />
        </View>
      </SafeAreaView>

      <KeyboardAwareScreenScroll
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.glassCard,
            {
              backgroundColor: glassBg,
              borderColor: glassBorder,
            },
          ]}
        >
          {/* Client */}
          <View style={styles.section}>
            <View style={[styles.sectionHead, layoutRtl && styles.sectionHeadVisualRtl]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${primary}33` }]}>
                <User size={18} color={iconOnGlass} strokeWidth={2} />
              </View>
              <View style={styles.sectionTitleWrap}>
                <Text
                  style={[
                    styles.sectionTitle,
                    titleShadowStyle,
                    { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('admin.appointmentsAdmin.client', 'Client')}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.sectionHint,
                styles.hintBlock,
                titleShadowStyle,
                { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
              ]}
            >
              {t('admin.appointmentsAdmin.pickClient', 'Pick the client for this appointment')}
            </Text>

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
                      onChangeText={form.setClientSearch}
                      placeholder={
                        useRtlInputPlaceholder
                          ? ''
                          : t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')
                      }
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
                      {form.filteredClients.slice(0, 60).map((client) => (
                        <Pressable
                          key={client.phone}
                          style={({ pressed }) => [styles.dropdownRow, pressed && { opacity: 0.85 }]}
                          onPress={() => form.onPickClient(client)}
                        >
                          <LinearGradient
                            colors={[primary, secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.avatarSm}
                          >
                            <Text style={styles.avatarSmText}>{client.name.charAt(0).toUpperCase()}</Text>
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
                      {form.filteredClients.length === 0 ? (
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

          <View style={[styles.divider, { backgroundColor: fieldBorder }]} />

          {/* Service */}
          <View style={styles.section}>
            <View style={[styles.sectionHead, layoutRtl && styles.sectionHeadVisualRtl]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${primary}33` }]}>
                <CalendarIcon size={18} color={iconOnGlass} strokeWidth={2} />
              </View>
              <View style={styles.sectionTitleWrap}>
                <Text
                  style={[
                    styles.sectionTitle,
                    titleShadowStyle,
                    { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('booking.field.service', 'Service')}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.sectionHint,
                styles.hintBlock,
                titleShadowStyle,
                { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
              ]}
            >
              {t('admin.appointmentsAdmin.pickService', 'Choose the service to perform')}
            </Text>
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
                        onPress={() => form.onPickService(service)}
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
                          <Text style={[styles.servicePriceInline, { color: innerText }]}>
                            {` · ₪${service.price}`}
                          </Text>
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View style={[styles.divider, { backgroundColor: fieldBorder }]} />

          {/* Date */}
          <View style={styles.section}>
            <View style={[styles.sectionHead, layoutRtl && styles.sectionHeadVisualRtl]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${primary}33` }]}>
                <CalendarDays size={18} color={iconOnGlass} strokeWidth={2} />
              </View>
              <View style={styles.sectionTitleWrap}>
                <Text
                  style={[
                    styles.sectionTitle,
                    titleShadowStyle,
                    { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('booking.field.date', 'Date')}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.sectionHint,
                styles.hintBlock,
                titleShadowStyle,
                { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
              ]}
            >
              {t('admin.appointmentsAdmin.pickDate', 'Select the date for this appointment')}
            </Text>
            <View style={[styles.calWrap, { borderColor: fieldBorder }]}>
              <RNCalendar
                key={`add-appt-${calendarLocale}`}
                current={form.selectedDate ? formatDateToLocalString(form.selectedDate) : undefined}
                minDate={formatDateToLocalString(new Date())}
                onDayPress={(day: { dateString: string }) => {
                  const date = parseDateKeyToLocalDate(day.dateString);
                  if (date) form.onPickDate(date);
                }}
                markedDates={
                  form.selectedDate
                    ? {
                        [formatDateToLocalString(form.selectedDate)]: {
                          selected: true,
                          selectedColor: primary,
                        },
                      }
                    : undefined
                }
                enableSwipeMonths
                hideDayNames={false}
                firstDay={0}
                renderArrow={calendarRenderArrow}
                style={{
                  direction: calendarLocale === 'he' ? 'rtl' : 'ltr',
                  width: '100%',
                }}
                theme={calendarTheme as never}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: fieldBorder }]} />

          {/* Time */}
          <View style={[styles.section, styles.sectionLast]}>
            <View style={[styles.sectionHead, layoutRtl && styles.sectionHeadVisualRtl]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${primary}33` }]}>
                <Clock size={18} color={iconOnGlass} strokeWidth={2} />
              </View>
              <View style={styles.sectionTitleWrap}>
                <Text
                  style={[
                    styles.sectionTitle,
                    titleShadowStyle,
                    { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('booking.field.time', 'Time')}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.sectionHint,
                styles.hintBlock,
                titleShadowStyle,
                { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
              ]}
            >
              {!form.selectedDate || !form.selectedService
                ? t('admin.appointmentsAdmin.selectDateAndServiceFirst', 'בחרו תאריך ושירות כדי לראות שעות פנויות')
                : t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot')}
            </Text>
            {form.selectedDate && form.selectedService ? (
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
                      <Pressable key={time} onPress={() => form.onPickTime(time)} style={styles.chipPress}>
                        {sel ? (
                          <LinearGradient
                            colors={[primary, secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.chipActive}
                          >
                            <Text style={styles.chipActiveTxt}>{formatTimeToAMPM(time)}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={[styles.chipIdle, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                            <Text style={[styles.chipIdleTxt, { color: innerText }]}>{formatTimeToAMPM(time)}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : null}
          </View>
        </View>

        {summaryReady ? (
          <View style={[styles.summaryCard, { borderColor: glassBorder, backgroundColor: glassBg }]}>
            <Text
              style={[
                styles.summaryTitle,
                styles.hintBlock,
                titleShadowStyle,
                { color: heroText, textAlign: textAlignPrimary, writingDirection: writingDir },
              ]}
            >
              {t('admin.appointmentsAdmin.summary', 'Appointment Summary')}
            </Text>
            <View style={styles.summaryGrid}>
              <Text
                style={[
                  styles.summaryLbl,
                  styles.hintBlock,
                  { color: heroMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
              >
                {t('admin.appointmentsAdmin.client', 'Client')}
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  styles.hintBlock,
                  { color: heroText, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
                numberOfLines={2}
              >
                {form.selectedClient?.name}
              </Text>
              <Text
                style={[
                  styles.summaryLbl,
                  styles.hintBlock,
                  { color: heroMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
              >
                {t('booking.field.service', 'Service')}
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  styles.hintBlock,
                  { color: heroText, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
                numberOfLines={2}
              >
                {form.selectedService?.name}
              </Text>
              <Text
                style={[
                  styles.summaryLbl,
                  styles.hintBlock,
                  { color: heroMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
              >
                {t('booking.field.date', 'Date')}
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  styles.hintBlock,
                  { color: heroText, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
                numberOfLines={2}
              >
                {form.selectedDate
                  ? form.selectedDate.toLocaleDateString(dateLocale, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  : ''}
              </Text>
              <Text
                style={[
                  styles.summaryLbl,
                  styles.hintBlock,
                  { color: heroMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
              >
                {t('booking.field.time', 'Time')}
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  styles.hintBlock,
                  { color: heroText, textAlign: textAlignPrimary, writingDirection: writingDir },
                ]}
              >
                {form.selectedTime ? formatTimeToAMPM(form.selectedTime) : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={() => void form.submit()}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: ctaElevatedBg,
              opacity: !canSubmit ? 0.45 : pressed ? 0.92 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {form.isSubmitting ? (
            <ActivityIndicator color={ctaElevatedLabel} />
          ) : (
            <Text style={[styles.ctaText, { color: ctaElevatedLabel }]}>
              {t('admin.appointmentsAdmin.saveAppointment', 'שמירת תור')}
            </Text>
          )}
        </Pressable>
      </KeyboardAwareScreenScroll>

      {showSuccessModal ? (
        <Modal
          visible={showSuccessModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => {
            setShowSuccessModal(false);
            setSuccessSnapshot(null);
            onBookedSuccess();
          }}
        >
          <BookingSuccessAnimatedOverlay
            key={successAnimKey}
            lines={adminBookingSuccessLines}
            rtl={isRtlLanguage(i18n?.language)}
            accentColor={primary}
            onDismiss={() => {
              setShowSuccessModal(false);
              setSuccessSnapshot(null);
              onBookedSuccess();
            }}
            onAddToCalendar={async () => {
              if (!successSnapshot) return;
              try {
                const { date, time, service, client } = successSnapshot;
                const duration =
                  service.duration_minutes && service.duration_minutes > 0 ? service.duration_minutes : 60;
                const dateStr = formatDateToLocalString(date);
                const timeStr = time || '00:00';
                const start = new Date(`${dateStr}T${timeStr}:00`);
                const end = new Date(start.getTime() + duration * 60000);

                const perm = await Calendar.requestCalendarPermissionsAsync();
                if (perm.status !== 'granted') {
                  Alert.alert(
                    t('booking.permissionsRequired', 'נדרש אישור'),
                    t('booking.calendarPermissionMessage', 'נדרש אישור גישה ליומן כדי להוסיף אירוע.')
                  );
                  return;
                }

                let calendarId: string | undefined;
                if (Platform.OS === 'ios') {
                  const defCal = await Calendar.getDefaultCalendarAsync();
                  calendarId = defCal?.id;
                } else {
                  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                  calendarId =
                    cals.find(
                      (c) => c.allowsModifications || c.accessLevel === Calendar.CalendarAccessLevel.OWNER
                    )?.id || cals[0]?.id;
                }

                if (!calendarId) {
                  Alert.alert(t('error.generic', 'שגיאה'), t('booking.noCalendar', 'לא נמצא יומן שניתן לכתוב אליו.'));
                  return;
                }

                await Calendar.createEventAsync(calendarId, {
                  title: `${service.name} · ${client.name}`,
                  startDate: start,
                  endDate: end,
                  notes: t('booking.calendarNotes', 'Booked via the app'),
                });

                Alert.alert(t('booking.added', 'נוסף'), t('booking.eventAdded', 'האירוע נוסף ליומן שלך.'));
              } catch {
                Alert.alert(
                  t('error.generic', 'שגיאה'),
                  t('booking.eventAddFailed', 'לא ניתן להוסיף את האירוע ליומן.')
                );
              }
            }}
            addToCalendarLabel={t('booking.addToCalendar', 'Add to Calendar')}
            gotItLabel={t('booking.gotIt', 'Got it')}
          />
        </Modal>
      ) : null}
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
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 5,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
    fontWeight: '700',
  },
  scrollFlex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
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
  /** LTR + row-reverse: icon stays visually on the right; title text hugs the correct edge */
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
  /** Match section headers: input hugging the right, trailing icon (search / calendar) on the left */
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
  /** Service row uses Text as placeholder — must span full width so `textAlign: right` applies */
  fieldPlaceholderText: {
    alignSelf: 'stretch',
    width: '100%',
  },
  /** RN TextInput native placeholder ignores textAlign on many builds — custom layer for RTL */
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
  calWrap: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 4,
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
  },
  chipActive: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  chipActiveTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  chipIdle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipIdleTxt: {
    fontSize: 15,
    fontWeight: '600',
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
  cta: {
    marginTop: 22,
    minHeight: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
