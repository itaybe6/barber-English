import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import type { WaitlistEntry } from '@/lib/supabase';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';

export interface WaitlistHomeFabPanelProps {
  entries: WaitlistEntry[];
  formatWaitlistDate: (dateString: string) => string;
  /** Delete a single waitlist row on server; return true on success. */
  onConfirmRemoveEntry: (entryId: string) => Promise<boolean>;
  /** After in-sheet success + user tapped Got it — remove that entry from local state. */
  onRemoveEntrySuccessDismiss: (entryId: string) => void;
  /** `tag` — compact chip. `banner` — full-width prominent row. `card` — same style as next-appointment card. */
  triggerVariant?: 'tag' | 'banner' | 'card';
}

const SHEET_RADIUS = 24;
const MODAL_ANIM_MS = 320;
const SHEET_LAYOUT_DURATION_MS = 380;
/** Smooth height change when sheet content changes — duration-based (no spring bounce). */
const WAITLIST_SHEET_LAYOUT = LinearTransition.duration(SHEET_LAYOUT_DURATION_MS);
/**
 * After working → success, the sheet layout animates ~SHEET_LAYOUT_DURATION_MS.
 * Success check + copy wait so the zoom isn’t lost while the sheet is still resizing.
 */
const SUCCESS_REVEAL_DELAY_MS = SHEET_LAYOUT_DURATION_MS + 40;

type RemoveSheetPhase = 'main' | 'confirm' | 'working' | 'success';

export function WaitlistHomeFabPanel({
  entries,
  formatWaitlistDate,
  onConfirmRemoveEntry,
  onRemoveEntrySuccessDismiss,
  triggerVariant = 'tag',
}: WaitlistHomeFabPanelProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const { height: winH } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [removePhase, setRemovePhase] = useState<RemoveSheetPhase>('main');
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const sheetTranslateY = useSharedValue(winH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (entries.length === 0) {
      setIsOpen(false);
      setIsClosing(false);
    }
  }, [entries.length]);

  useEffect(() => {
    if (!isOpen || !isClosing) return;
    const timer = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, MODAL_ANIM_MS);
    return () => clearTimeout(timer);
  }, [isClosing, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      sheetTranslateY.set(winH);
      backdropOpacity.set(0);
      return;
    }

    if (isClosing) {
      sheetTranslateY.set(
        withTiming(winH, {
          duration: MODAL_ANIM_MS,
          easing: Easing.in(Easing.cubic),
        })
      );
      backdropOpacity.set(
        withTiming(0, {
          duration: MODAL_ANIM_MS,
          easing: Easing.in(Easing.cubic),
        })
      );
      return;
    }

    sheetTranslateY.set(
      withTiming(0, {
        duration: MODAL_ANIM_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
    backdropOpacity.set(
      withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [backdropOpacity, isClosing, isOpen, sheetTranslateY, winH]);

  const close = useCallback(() => {
    if (isClosing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRemovePhase('main');
    setIsClosing(true);
  }, [isClosing]);

  /** From the leave-confirm step — return to the waitlist details without closing the sheet. */
  const backFromConfirmStep = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRemovePhase('main');
  }, []);

  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemovePhase('main');
    setPendingEntryId(null);
    setIsClosing(false);
    setIsOpen(true);
  }, []);

  const startRemoveEntry = useCallback((entryId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingEntryId(entryId);
    setRemovePhase('confirm');
  }, []);

  const runConfirmRemove = useCallback(async () => {
    if (!pendingEntryId) return;
    setRemovePhase('working');
    try {
      const ok = await onConfirmRemoveEntry(pendingEntryId);
      if (ok) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* noop */
        }
        setRemovePhase('success');
      } else {
        setRemovePhase('confirm');
        Alert.alert(
          t('error.generic', 'Error'),
          t('error.removing.waitlist', 'An error occurred while removing from the waitlist')
        );
      }
    } catch {
      setRemovePhase('confirm');
      Alert.alert(
        t('error.generic', 'Error'),
        t('error.removing.waitlist', 'An error occurred while removing from the waitlist')
      );
    }
  }, [pendingEntryId, onConfirmRemoveEntry, t]);

  const listMaxHeight = Math.round(winH * 0.5);
  const sheetMaxHeight = Math.round(winH * 0.9);
  const rtl = I18nManager.isRTL;
  const textAlign = rtl ? ('right' as const) : ('left' as const);
  const { primaryOnSurface } = usePrimaryContrast();

  /** main ↔ confirm: subtle cross-fade only (no slide). */
  const waitlistStepTransition = useMemo(
    () => ({
      exitMain: FadeOut.duration(180),
      enterConfirm: FadeIn.duration(260),
      exitConfirm: FadeOut.duration(180),
      enterMain: FadeIn.duration(260),
    }),
    []
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.get(),
  }));

  if (entries.length === 0) return null;

  const getServiceLabel = (entry: WaitlistEntry) =>
    entry.service_name === 'General service' || !entry.service_name?.trim()
      ? t('waitlist.anyService', 'Any available service')
      : entry.service_name;

  const firstEntry = entries[0];
  const periodIcon =
    firstEntry.time_period === 'morning'
      ? 'sunny'
      : firstEntry.time_period === 'afternoon'
        ? 'partly-sunny'
        : firstEntry.time_period === 'evening'
          ? 'moon'
          : 'time';
  const periodColor =
    firstEntry.time_period === 'morning' ? '#F5A623' : colors.primary;

  const trigger =
    triggerVariant === 'card' ? (
      <TouchableOpacity
        style={styles.cardTrigger}
        onPress={open}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={t('waitlist.compactA11y')}
      >
        {/* Header row — mirrors clientNextHeader */}
        <View
          style={[
            styles.cardHeader,
            { flexDirection: rtl ? 'row' : 'row-reverse' },
          ]}
        >
          <Text style={styles.cardHeaderDate} numberOfLines={1}>
            {formatWaitlistDate(firstEntry.requested_date)}
          </Text>
          <Text style={[styles.cardHeaderLabel, { color: colors.primary }]}>
            {t('waitlist.title')}
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Body row — mirrors clientNextBody */}
        <View
          style={[
            styles.cardBody,
            { flexDirection: rtl ? 'row-reverse' : 'row' },
          ]}
        >
          {/* Left: icon + service + time period */}
          <View
            style={[
              styles.cardInfo,
              {
                flexDirection: rtl ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 12,
              },
            ]}
          >
            <View
              style={[
                styles.cardIconCircle,
                { backgroundColor: `${colors.primary}18` },
              ]}
            >
              <Ionicons name="time" size={22} color={colors.primary} />
            </View>
            <View
              style={{
                flex: 1,
                alignItems: rtl ? 'flex-end' : 'flex-start',
                gap: 3,
              }}
            >
              <Text
                style={[
                  styles.cardService,
                  { textAlign: rtl ? 'right' : 'left' },
                ]}
                numberOfLines={1}
              >
                {firstEntry.service_name || t('waitlist.compactMessage')}
              </Text>
              <View
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Ionicons name={periodIcon as any} size={13} color={periodColor} />
                <Text
                  style={[
                    styles.cardPeriodText,
                    { color: periodColor, textAlign: rtl ? 'right' : 'left' },
                  ]}
                  numberOfLines={1}
                >
                  {firstEntry.time_period === 'any'
                    ? t('time_period.any')
                    : t(`time_period.${firstEntry.time_period}`)}
                </Text>
              </View>
            </View>
          </View>

          {/* Vertical separator */}
          <View
            style={[styles.cardTimeDivider, { backgroundColor: `${colors.primary}25` }]}
          />

          {/* Right: count + queue label */}
          <View style={styles.cardCountBlock}>
            <Text style={[styles.cardCountNum, { color: primaryOnSurface }]}>
              {entries.length}
            </Text>
            <Text style={[styles.cardCountLabel, { color: `${primaryOnSurface}B3` }]}>
              {t('waitlist.compactHint')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    ) : triggerVariant === 'tag' ? (
      <TouchableOpacity
        style={[
          styles.homeTag,
          { backgroundColor: `${colors.primary}14` },
        ]}
        onPress={open}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={t('waitlist.compactA11y')}
      >
        <View
          style={[
            styles.homeTagIconWrap,
            { backgroundColor: `${colors.primary}22` },
          ]}
        >
          <Ionicons name="time" size={17} color={colors.primary} />
        </View>
        <View style={styles.homeTagTextCol}>
          <Text
            style={[styles.homeTagTitle, { color: colors.primary }]}
            numberOfLines={1}
          >
            {t('waitlist.compactMessage')}
          </Text>
          <Text
            style={[styles.homeTagHint, { color: `${colors.primary}CC` }]}
            numberOfLines={1}
          >
            {t('waitlist.compactHint')}
          </Text>
        </View>
        <Ionicons
          name={rtl ? 'chevron-forward' : 'chevron-back'}
          size={18}
          color={colors.primary}
        />
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        style={[
          styles.homeChip,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
        onPress={open}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('waitlist.compactA11y')}
      >
        <View style={styles.homeChipIconWrap}>
          <Ionicons name="time" size={26} color="#FFFFFF" />
        </View>
        <View style={styles.homeChipTextCol}>
          <Text style={styles.homeChipTitle} numberOfLines={1}>
            {t('waitlist.compactMessage')}
          </Text>
          <Text style={styles.homeChipHint} numberOfLines={1}>
            {t('waitlist.compactHint')}
          </Text>
        </View>
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={22}
          color="rgba(255,255,255,0.9)"
        />
      </TouchableOpacity>
    );

  return (
    <>
      {trigger}

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (removePhase === 'working') return;
          if (removePhase === 'success') {
            const id = pendingEntryId;
            setPendingEntryId(null);
            setRemovePhase('main');
            if (id) onRemoveEntrySuccessDismiss(id);
            return;
          }
          if (removePhase === 'confirm') {
            backFromConfirmStep();
            return;
          }
          close();
        }}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Animated.View
            style={[styles.backdrop, backdropAnimatedStyle]}
          >
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={
                removePhase === 'main'
                  ? close
                  : removePhase === 'confirm'
                    ? backFromConfirmStep
                    : undefined
              }
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            />
          </Animated.View>

          <Animated.View
            layout={WAITLIST_SHEET_LAYOUT}
            style={[
              styles.sheet,
              sheetAnimatedStyle,
              {
                backgroundColor: colors.background,
                maxHeight: sheetMaxHeight,
                paddingTop: removePhase === 'confirm' ? 8 : 10,
                paddingBottom: 10,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: `${colors.text}18` }]} />
            {removePhase === 'main' && (
              <View
                style={[
                  styles.sheetHeaderRow,
                  { flexDirection: rtl ? 'row-reverse' : 'row' },
                ]}
              >
                <View style={styles.sheetHeaderText}>
                  <Text style={[styles.sheetTitle, { color: colors.text, textAlign }]}>
                    {t('waitlist.title')}
                  </Text>
                  {entries.length === 1 ? (
                    <Text
                      style={[
                        styles.sheetSubtitle,
                        { color: colors.textSecondary, textAlign },
                      ]}
                    >
                      {t('waitlist.waitingForIntro')}
                      {getServiceLabel(entries[0])}
                    </Text>
                  ) : (
                    <Text
                      style={[styles.sheetSubtitle, { color: colors.textSecondary, textAlign }]}
                    >
                      {t('waitlist.modalSubtitleMany', 'You have {{count}} active waitlist requests', {
                        count: entries.length,
                      })}
                    </Text>
                  )}
                </View>

                <Pressable
                  onPress={close}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.sheetCloseBtn,
                    {
                      backgroundColor: pressed ? `${colors.text}18` : `${colors.text}0D`,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>
            )}

            {removePhase === 'working' || removePhase === 'success' ? (
              <View style={styles.inSheetPhaseBlock}>
                {removePhase === 'working' ? (
                  <View style={styles.inSheetWorking}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text
                      style={[
                        styles.inSheetWorkingText,
                        { color: colors.textSecondary, textAlign },
                      ]}
                    >
                      {t('waitlist.leaveWorking', 'Removing you from the waitlist…')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.inSheetSuccess}>
                    <Animated.View
                      entering={ZoomIn.delay(SUCCESS_REVEAL_DELAY_MS).duration(380)}
                    >
                      <Ionicons name="checkmark-circle" size={76} color={colors.primary} />
                    </Animated.View>
                    <Animated.Text
                      entering={FadeIn.delay(SUCCESS_REVEAL_DELAY_MS).duration(280)}
                      style={[styles.inSheetSuccessTitle, { color: colors.text, textAlign }]}
                    >
                      {t('waitlist.leaveSuccessHeadline', 'You left the waitlist')}
                    </Animated.Text>
                    <Animated.Text
                      entering={FadeIn.delay(SUCCESS_REVEAL_DELAY_MS + 40).duration(280)}
                      style={[
                        styles.inSheetSuccessSub,
                        {
                          color: colors.textSecondary,
                          textAlign: 'center',
                          alignSelf: 'stretch',
                        },
                      ]}
                    >
                      {t(
                        'waitlist.leaveSuccessSub',
                        'You can join the waitlist again anytime when booking an appointment.'
                      )}
                    </Animated.Text>
                    <Animated.View
                      entering={FadeIn.delay(SUCCESS_REVEAL_DELAY_MS + 100).duration(260)}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          styles.inSheetGotItBtn,
                          {
                            backgroundColor: colors.primary,
                            opacity: pressed ? 0.9 : 1,
                          },
                        ]}
                        onPress={() => {
                          const id = pendingEntryId;
                          setPendingEntryId(null);
                          setRemovePhase('main');
                          if (id) onRemoveEntrySuccessDismiss(id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('booking.gotIt', 'Got it')}
                      >
                        <Text style={styles.removeBtnText}>{t('booking.gotIt', 'Got it')}</Text>
                      </Pressable>
                    </Animated.View>
                  </View>
                )}
              </View>
            ) : removePhase === 'main' ? (
              <Animated.View
                key="waitlist-remove-main"
                style={styles.sheetStepWrap}
                entering={waitlistStepTransition.enterMain}
                exiting={waitlistStepTransition.exitMain}
              >
            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {entries.map((entry) => {
                const entryPeriodIcon =
                  entry.time_period === 'morning'
                    ? 'sunny'
                    : entry.time_period === 'afternoon'
                      ? 'partly-sunny'
                      : entry.time_period === 'evening'
                        ? 'moon'
                        : 'time';
                const timeLine =
                  entry.time_period === 'any'
                    ? `${t('time_period.any')} — ${t('time_period.flexible')}`
                    : `${t(`time_period.${entry.time_period}`)} · ${t(`time_period.range.${entry.time_period}` as never)}`;
                const entryPeriodColor =
                  entry.time_period === 'morning' ? '#F5A623' : colors.primary;
                const staffLabel =
                  entry.staff_name && entry.staff_name.length > 0
                    ? entry.staff_name
                    : t('waitlist.staffAny', 'Any staff');
                const serviceLabel = getServiceLabel(entry);

                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.entryCardShadowWrap,
                    ]}
                  >
                    <View
                      style={[
                        styles.entryCard,
                        {
                          backgroundColor: `${colors.text}07`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.entryCardHeader,
                          { flexDirection: rtl ? 'row-reverse' : 'row' },
                        ]}
                      >
                        <View
                          style={[
                            styles.entryCardIconWrap,
                            { backgroundColor: `${colors.primary}10` },
                          ]}
                        >
                          <Ionicons name="time-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.entryCardTitleWrap}>
                          <Text
                            style={[
                              styles.entryCardService,
                              { color: colors.text, textAlign },
                            ]}
                            numberOfLines={1}
                          >
                            {serviceLabel}
                          </Text>
                          <Text
                            style={[
                              styles.entryCardCaption,
                              { color: colors.textSecondary, textAlign },
                            ]}
                            numberOfLines={1}
                          >
                            {t('waitlist.title')}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => startRemoveEntry(entry.id)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.entryCardRemoveBtn,
                            {
                              backgroundColor: pressed ? `${colors.text}0A` : `${colors.text}06`,
                              borderColor: pressed ? `${colors.text}12` : `${colors.text}0A`,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t('waitlist.remove')}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </Pressable>
                      </View>

                      <View
                        style={[
                          styles.entryCardDivider,
                          { backgroundColor: `${colors.text}14` },
                        ]}
                      />

                      <View
                        style={[
                          styles.entryCardDetails,
                          { alignItems: rtl ? 'flex-end' : 'flex-start' },
                        ]}
                      >
                        <View
                          style={[
                            styles.entryCardMetaTopRow,
                            { flexDirection: rtl ? 'row-reverse' : 'row' },
                          ]}
                        >
                          <View
                            style={[
                              styles.entryCardDetailRow,
                              styles.entryCardDetailRowCompact,
                              {
                                flexDirection: rtl ? 'row-reverse' : 'row',
                                backgroundColor: `${colors.text}05`,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.entryCardMetaIconWrap,
                                styles.entryCardMetaIconWrapCompact,
                                { backgroundColor: `${colors.primary}10` },
                              ]}
                            >
                              {entry.staff_image_url ? (
                                <Image
                                  source={{ uri: entry.staff_image_url }}
                                  style={styles.entryCardStaffImgCompact}
                                  contentFit="cover"
                                />
                              ) : (
                                <Ionicons name="person-outline" size={12} color={colors.primary} />
                              )}
                            </View>
                            <Text
                              style={[
                                styles.entryCardDetailText,
                                styles.entryCardDetailTextCompact,
                                { color: colors.text, textAlign },
                              ]}
                              numberOfLines={1}
                            >
                              {staffLabel}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.entryCardDetailRow,
                              styles.entryCardDetailRowCompact,
                              {
                                flexDirection: rtl ? 'row-reverse' : 'row',
                                backgroundColor: `${colors.primary}08`,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.entryCardMetaIconWrap,
                                styles.entryCardMetaIconWrapCompact,
                                { backgroundColor: `${colors.primary}12` },
                              ]}
                            >
                              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
                            </View>
                            <Text
                              style={[
                                styles.entryCardDetailText,
                                styles.entryCardDetailTextCompact,
                                { color: colors.text, textAlign },
                              ]}
                              numberOfLines={1}
                            >
                              {formatWaitlistDate(entry.requested_date)}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.entryCardDetailRow,
                            styles.entryCardDetailRowCompact,
                            {
                              flexDirection: rtl ? 'row-reverse' : 'row',
                              backgroundColor: `${entryPeriodColor}10`,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.entryCardMetaIconWrap,
                              styles.entryCardMetaIconWrapCompact,
                              { backgroundColor: `${entryPeriodColor}12` },
                            ]}
                          >
                            <Ionicons
                              name={entryPeriodIcon as any}
                              size={12}
                              color={entryPeriodColor}
                            />
                          </View>
                          <Text
                            style={[
                              styles.entryCardDetailText,
                              styles.entryCardDetailTextCompact,
                              { color: entryPeriodColor, textAlign },
                            ]}
                            numberOfLines={1}
                          >
                            {timeLine}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
              </Animated.View>
            ) : (
              <Animated.View
                key="waitlist-remove-confirm"
                style={styles.sheetStepWrap}
                entering={waitlistStepTransition.enterConfirm}
                exiting={waitlistStepTransition.exitConfirm}
              >
              <View style={styles.removeConfirmSoloOuter}>
                <View style={styles.removeConfirmMessageContent}>
                  <View
                    style={[
                      styles.removeConfirmTitleRow,
                      { flexDirection: rtl ? 'row-reverse' : 'row' },
                    ]}
                  >
                    <View style={styles.sheetHeaderText}>
                      <Text
                        style={[styles.removeConfirmSoloTitle, { color: colors.text, textAlign }]}
                      >
                        {t('waitlist.leaveConfirmTitle', 'Are you sure?')}
                      </Text>
                    </View>
                    <Pressable
                      onPress={backFromConfirmStep}
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.sheetCloseBtn,
                        {
                          backgroundColor: pressed ? `${colors.text}18` : `${colors.text}0D`,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t('close')}
                    >
                      <Ionicons name="close" size={22} color={colors.text} />
                    </Pressable>
                  </View>
                  <Text
                    style={[
                      styles.removeConfirmSoloSub,
                      { color: colors.textSecondary, textAlign },
                    ]}
                  >
                    {(() => {
                      const e = entries.find((x) => x.id === pendingEntryId);
                      if (e) {
                        return t(
                          'waitlist.leaveConfirmHintEntry',
                          'This will remove your waitlist request for {{service}} on {{date}}.',
                          {
                            service: getServiceLabel(e),
                            date: formatWaitlistDate(e.requested_date),
                          }
                        );
                      }
                      return t(
                        'waitlist.leaveConfirmHint',
                        'Leaving the list will cancel your request for an appointment.\nTo go back, tap Cancel.'
                      );
                    })()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.removeConfirmActionsRow,
                    { flexDirection: rtl ? 'row-reverse' : 'row' },
                  ]}
                >
                  <Pressable
                    onPress={backFromConfirmStep}
                    style={({ pressed }) => [
                      styles.removeConfirmBtnSecondary,
                      {
                        borderColor: `${colors.text}28`,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('cancel')}
                  >
                    <Text style={[styles.removeConfirmBtnSecondaryText, { color: colors.text }]}>
                      {t('cancel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void runConfirmRemove()}
                    style={({ pressed }) => [
                      styles.removeConfirmBtnPrimary,
                      {
                        backgroundColor: colors.primary,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('confirm')}
                  >
                    <Text style={styles.removeBtnText}>{t('confirm')}</Text>
                  </Pressable>
                </View>
              </View>
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Card variant — mirrors clientNextCard in app/(client-tabs)/index.tsx ──
  cardTrigger: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: '#1e253b', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 9 },
    }),
  },
  cardHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 11,
  },
  cardHeaderDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
    flexShrink: 1,
    maxWidth: 160,
  },
  cardHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  cardBody: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  cardInfo: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  cardIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardService: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.25,
    lineHeight: 20,
  },
  cardPeriodText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  cardTimeDivider: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  cardCountBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 0,
  },
  cardCountNum: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  cardCountLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  homeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 1,
    maxWidth: '100%',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 9999,
    gap: 7,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  homeTagIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeTagTextCol: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  homeTagTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  homeTagHint: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: 'left',
  },
  homeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 36,
    gap: 14,
    width: '100%',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  homeChipIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeChipTextCol: {
    flex: 1,
    minWidth: 0,
  },
  homeChipTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  homeChipHint: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 0,
  },
  /** Wraps main vs confirm body so layout transitions can run. */
  sheetStepWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  sheet: {
    zIndex: 2,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  sheetCloseBtn: {
    marginTop: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderRow: {
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 20,
    marginTop: 2,
  },
  sheetHeaderText: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  sheetSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  entryCardShadowWrap: {
    borderRadius: 20,
    marginBottom: 14,
  },
  entryCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  entryCardHeader: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  entryCardDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  entryCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryCardTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  entryCardService: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 21,
  },
  entryCardCaption: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
  },
  entryCardRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
  },
  entryCardDetails: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  entryCardMetaTopRow: {
    width: '100%',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  entryCardDetailRow: {
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  entryCardDetailRowCompact: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
  },
  entryCardMetaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryCardMetaIconWrapCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  entryCardDetailText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  entryCardDetailTextCompact: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
  },
  entryCardStaffImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  entryCardStaffImgCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  removeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  removeConfirmSoloOuter: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 18,
    gap: 18,
  },
  /** Title + X on one row; subtitle below. */
  removeConfirmMessageContent: {
    width: '100%',
    alignItems: 'stretch',
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  removeConfirmTitleRow: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    width: '100%',
  },
  removeConfirmSoloTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 26,
  },
  removeConfirmSoloSub: {
    marginTop: 2,
    marginBottom: 2,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.12,
    alignSelf: 'stretch',
    width: '100%',
  },
  removeConfirmActionsRow: {
    width: '100%',
    gap: 10,
    alignItems: 'stretch',
    marginTop: 0,
  },
  removeConfirmBtnSecondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  removeConfirmBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  removeConfirmBtnPrimary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  inSheetPhaseBlock: {
    minHeight: 280,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  inSheetWorking: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 8,
  },
  inSheetWorkingText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  inSheetSuccess: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 12,
  },
  inSheetSuccessTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 30,
    marginTop: 8,
  },
  inSheetSuccessSub: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  inSheetGotItBtn: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
});
