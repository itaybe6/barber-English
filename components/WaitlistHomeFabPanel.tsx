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
import { useColors } from '@/src/theme/ThemeProvider';

export interface WaitlistHomeFabPanelProps {
  entries: WaitlistEntry[];
  formatWaitlistDate: (dateString: string) => string;
  onRequestRemoveAll: () => void;
  isRemoving?: boolean;
  /** `tag` — compact chip (e.g. under Book button). `banner` — full-width prominent row. */
  triggerVariant?: 'tag' | 'banner';
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

  if (entries.length === 0) return null;

  const primaryBorder = `${colors.primary}55`;

  const trigger =
    triggerVariant === 'tag' ? (
      <TouchableOpacity
        style={[
          styles.homeTag,
          {
            borderColor: `${colors.primary}4D`,
            backgroundColor: `${colors.primary}14`,
          },
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
            <View style={styles.grabberHost}>
              <View style={[styles.grabber, { backgroundColor: colors.primary }]} />
            </View>

            <Pressable
              onPress={close}
              hitSlop={14}
              style={[
                styles.sheetCloseBtn,
                rtl ? { right: 8 } : { left: 8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={26} color={colors.textSecondary} />
            </Pressable>

            <View
              style={[
                styles.sheetHeaderRow,
                { flexDirection: rtl ? 'row-reverse' : 'row' },
              ]}
            >
              <View style={[styles.sheetAccentBar, { backgroundColor: colors.primary }]} />
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.sheetTitle, { color: colors.text, textAlign }]}>
                  {t('waitlist.title')}
                </Text>
                <Text
                  style={[styles.sheetSubtitle, { color: colors.textSecondary, textAlign }]}
                >
                  {entries.length === 1
                    ? t('waitlist.waitingFor', { service: entries[0].service_name })
                    : t('waitlist.waitingForMany', { count: entries.length })}
                </Text>
              </View>
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
                      styles.entryCard,
                      {
                        borderColor: primaryBorder,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    <View
                      style={[styles.entryRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    >
                      <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                      <Text
                        style={[styles.entryText, { color: colors.text, textAlign }]}
                        numberOfLines={2}
                      >
                        {formatWaitlistDate(entry.requested_date)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.entryRow,
                        {
                          marginTop: 10,
                          flexDirection: rtl ? 'row-reverse' : 'row',
                        },
                      ]}
                    >
                      <Ionicons name={periodIcon} size={20} color={periodColor} />
                      <Text
                        style={[styles.entryText, { color: colors.text, textAlign }]}
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
  homeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 1,
    maxWidth: '100%',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 9999,
    borderWidth: 1,
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
    paddingTop: 6,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  grabberHost: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  sheetCloseBtn: {
    position: 'absolute',
    top: 10,
    zIndex: 4,
    padding: 8,
    borderRadius: 20,
  },
  sheetHeaderRow: {
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 18,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sheetAccentBar: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 48,
  },
  sheetHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: -0.2,
  },
  entryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  entryRow: {
    alignItems: 'center',
    gap: 12,
  },
  entryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
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
