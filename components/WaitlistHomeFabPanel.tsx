import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import type { WaitlistEntry } from '@/lib/supabase';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';

export interface WaitlistHomeFabPanelProps {
  entries: WaitlistEntry[];
  formatWaitlistDate: (dateString: string) => string;
  onRequestRemoveAll: () => void;
  isRemoving?: boolean;
  /** `tag` — compact chip. `banner` — full-width prominent row. `card` — same style as next-appointment card. */
  triggerVariant?: 'tag' | 'banner' | 'card';
}

const SHEET_RADIUS = 24;
const MODAL_ANIM_MS = 320;

export function WaitlistHomeFabPanel({
  entries,
  formatWaitlistDate,
  onRequestRemoveAll,
  isRemoving = false,
  triggerVariant = 'tag',
}: WaitlistHomeFabPanelProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (entries.length === 0) setIsOpen(false);
  }, [entries.length]);

  const close = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpen(true);
  }, []);

  const listMaxHeight = Math.round(winH * 0.5);
  const sheetMaxHeight = Math.round(winH * 0.9);
  const rtl = I18nManager.isRTL;
  const textAlign = rtl ? ('right' as const) : ('left' as const);
  const { primaryOnSurface } = usePrimaryContrast();

  if (entries.length === 0) return null;

  const firstEntry = entries[0];
  const periodIcon =
    firstEntry.time_period === 'morning'
      ? 'sunny'
      : firstEntry.time_period === 'afternoon'
        ? 'partly-sunny'
        : firstEntry.time_period === 'evening'
          ? 'moon'
          : 'time-outline';
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
        onRequestClose={close}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            />
          </Animated.View>

          <Animated.View
            entering={SlideInDown.duration(MODAL_ANIM_MS)}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                maxHeight: sheetMaxHeight,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
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
                <Text
                  style={[styles.sheetSubtitle, { color: colors.primary, textAlign }]}
                >
                  {entries.length === 1
                    ? t('waitlist.waitingFor', { service: entries[0].service_name })
                    : t('waitlist.waitingForMany', { count: entries.length })}
                </Text>
              </View>

              <Pressable
                onPress={close}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.sheetCloseBtn,
                  {
                    backgroundColor: pressed ? `${colors.text}18` : `${colors.text}0D`,
                    borderColor: `${colors.text}22`,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {entries.map((entry) => {
                const periodIcon =
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
                const periodColor =
                  entry.time_period === 'morning' ? '#F5A623' : colors.primary;
                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.entryTagsWrap,
                      { flexDirection: rtl ? 'row-reverse' : 'row' },
                    ]}
                  >
                    <View
                      style={[
                        styles.entryTag,
                        { flexDirection: rtl ? 'row-reverse' : 'row' },
                        { backgroundColor: `${colors.primary}20` },
                      ]}
                    >
                      <Ionicons name="calendar-outline" size={17} color={colors.primary} />
                      <Text
                        style={[styles.entryTagText, { color: colors.text, textAlign }]}
                        numberOfLines={2}
                      >
                        {formatWaitlistDate(entry.requested_date)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.entryTag,
                        { flexDirection: rtl ? 'row-reverse' : 'row' },
                        { backgroundColor: `${periodColor}2B` },
                      ]}
                    >
                      <Ionicons name={periodIcon} size={17} color={periodColor} />
                      <Text
                        style={[styles.entryTagText, { color: colors.text, textAlign }]}
                        numberOfLines={2}
                      >
                        {timeLine}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.removeBtn,
                { backgroundColor: colors.primary, opacity: isRemoving ? 0.65 : 1 },
              ]}
              onPress={onRequestRemoveAll}
              disabled={isRemoving}
              activeOpacity={0.88}
            >
              {isRemoving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.removeBtnText}>{t('waitlist.remove')}</Text>
              )}
            </TouchableOpacity>
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
      ios: { shadowColor: '#1e253b', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 5 },
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
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
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
  },
  sheet: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetCloseBtn: {
    marginTop: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
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
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    letterSpacing: -0.25,
    lineHeight: 22,
  },
  entryTagsWrap: {
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  entryTag: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 9999,
    maxWidth: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  entryTagText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  removeBtn: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  removeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
