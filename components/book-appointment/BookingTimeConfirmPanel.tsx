import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

function isHebrewLocale(lang: string | undefined): boolean {
  if (typeof lang !== 'string') return false;
  const l = lang.toLowerCase();
  return l.startsWith('he') || l.startsWith('iw');
}

const DURATION = 380;

export interface BookingTimeConfirmPanelProps {
  visible: boolean;
  onChangeTime: () => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
  staffName?: string;
  /** When provided, shows the client name row with label "לקוח" instead of "איש צוות". Takes priority over staffName. */
  clientName?: string;
  serviceSummary: string;
  dateLine: string;
  timeLine: string;
  durationMinutes: number;
  totalPrice: number;
  primaryColor: string;
  cardBackground: string;
  textColor: string;
  textSecondary: string;
  t: (key: string, def: string) => string;
}

function DetailCard({
  icon,
  label,
  value,
  textColor,
  subColor,
  tint,
  emphasize,
  rtlLayout,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  textColor: string;
  subColor: string;
  tint: string;
  emphasize?: boolean;
  rtlLayout: boolean;
}) {
  const textAlign = rtlLayout ? 'right' : 'left';
  const writingDirection = rtlLayout ? ('rtl' as const) : ('ltr' as const);
  return (
    <View
      style={[
        rowStyles.card,
        {
          flexDirection: rtlLayout ? 'row-reverse' : 'row',
          borderColor: `${textColor}10`,
          backgroundColor: emphasize ? `${tint}12` : `${textColor}06`,
        },
      ]}
    >
      <View style={[rowStyles.iconWrap, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={[rowStyles.cardText, { alignItems: rtlLayout ? 'flex-end' : 'flex-start' }]}>
        <Text style={[rowStyles.label, { color: subColor, textAlign, writingDirection, alignSelf: 'stretch' }]}>
          {label}
        </Text>
        <Text
          style={[
            rowStyles.value,
            { color: textColor, textAlign, writingDirection, alignSelf: 'stretch' },
            emphasize && { fontSize: 18, fontWeight: '900', color: tint },
          ]}
          numberOfLines={3}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  value: { fontSize: 15, fontWeight: '800', letterSpacing: -0.25 },
});

export default function BookingTimeConfirmPanel({
  visible,
  onChangeTime,
  onConfirm,
  confirmLoading,
  staffName,
  clientName,
  serviceSummary,
  dateLine,
  timeLine,
  durationMinutes,
  totalPrice,
  primaryColor,
  cardBackground,
  textColor,
  textSecondary,
  t,
}: BookingTimeConfirmPanelProps) {
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const activeLang = String(i18n.resolvedLanguage || i18n.language || '');
  const layoutRtl = I18nManager.isRTL || isHebrewLocale(activeLang);
  const durationLine =
    totalPrice > 0
      ? `${durationMinutes} ${t('booking.min', 'דק׳')} · ₪${totalPrice}`
      : `${durationMinutes} ${t('booking.min', 'דק׳')}`;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onChangeTime} statusBarTranslucent>
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onChangeTime} accessibilityRole="button">
        <Animated.View entering={FadeIn.duration(220)} style={[styles.backdrop, StyleSheet.absoluteFill]} />
      </Pressable>

      {/* Sheet anchored to the bottom */}
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(DURATION).springify().damping(22).stiffness(200)}
          layout={LinearTransition.duration(DURATION)}
          style={[
            styles.sheet,
            {
              backgroundColor: cardBackground,
              paddingBottom: Math.max(insets.bottom, 20) + 4,
              direction: 'ltr',
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: `${textColor}20` }]} />
          </View>

          {/* Header */}
          <View
            style={[
              styles.headerBlock,
              { flexDirection: layoutRtl ? 'row' : 'row-reverse' },
            ]}
          >
            <Pressable
              onPress={onChangeTime}
              hitSlop={14}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.65 : 1, backgroundColor: `${textColor}08` }]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.timePanel.close', 'סגור')}
            >
              <Ionicons name="close" size={20} color={textSecondary} />
            </Pressable>
            <Text
              style={[
                styles.title,
                {
                  color: textColor,
                  textAlign: layoutRtl ? 'right' : 'left',
                  writingDirection: layoutRtl ? 'rtl' : 'ltr',
                },
              ]}
            >
              {t('booking.timePanel.title', 'סיכום תור')}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: `${textColor}10` }]} />

          {/* Detail rows — scrollable so they never push buttons off-screen */}
          <ScrollView
            style={styles.rowsScroll}
            contentContainerStyle={styles.rows}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {clientName ? (
              <DetailCard
                icon="person-circle-outline"
                label={t('booking.timePanel.client', 'לקוח')}
                value={clientName}
                textColor={textColor}
                subColor={textSecondary}
                tint={primaryColor}
                rtlLayout={layoutRtl}
              />
            ) : staffName ? (
              <DetailCard
                icon="person-outline"
                label={t('booking.timePanel.staff', 'איש צוות')}
                value={staffName}
                textColor={textColor}
                subColor={textSecondary}
                tint={primaryColor}
                rtlLayout={layoutRtl}
              />
            ) : null}
            <DetailCard
              icon="cut-outline"
              label={t('booking.field.service', 'שירות')}
              value={serviceSummary}
              textColor={textColor}
              subColor={textSecondary}
              tint={primaryColor}
              rtlLayout={layoutRtl}
            />
            <DetailCard
              icon="calendar-outline"
              label={t('booking.field.date', 'תאריך')}
              value={dateLine}
              textColor={textColor}
              subColor={textSecondary}
              tint={primaryColor}
              rtlLayout={layoutRtl}
            />
            <DetailCard
              icon="time-outline"
              label={t('booking.field.time', 'שעה')}
              value={timeLine}
              textColor={textColor}
              subColor={textSecondary}
              tint={primaryColor}
              rtlLayout={layoutRtl}
              emphasize
            />
            <DetailCard
              icon="hourglass-outline"
              label={t('booking.timePanel.duration', 'משך משוער')}
              value={durationLine}
              textColor={textColor}
              subColor={textSecondary}
              tint={primaryColor}
              rtlLayout={layoutRtl}
            />
          </ScrollView>

          {/* Action buttons */}
          <View
            style={[
              styles.btnRow,
              { flexDirection: layoutRtl ? 'row' : 'row-reverse' },
            ]}
          >
            <Pressable
              onPress={onConfirm}
              disabled={confirmLoading}
              style={({ pressed }) => [
                styles.btnPrimary,
                {
                  flex: 1.65,
                  backgroundColor: primaryColor,
                  opacity: confirmLoading ? 0.88 : pressed ? 0.92 : 1,
                  shadowColor: primaryColor,
                },
              ]}
            >
              {confirmLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {t('booking.timePanel.confirmBook', 'אישור — קבע תור')}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={onChangeTime}
              disabled={confirmLoading}
              style={({ pressed }) => [
                styles.btnCancel,
                {
                  flex: 1,
                  borderColor: `${textColor}18`,
                  opacity: confirmLoading ? 0.45 : pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text style={[styles.btnCancelText, { color: textSecondary }]}>
                {t('booking.timePanel.cancel', 'ביטול')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  /** Fills the screen, aligns content to the bottom */
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 20,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headerBlock: {
    alignItems: 'center',
    gap: 10,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  rowsScroll: {
    maxHeight: 340,
    alignSelf: 'stretch',
  },
  rows: {
    gap: 10,
    paddingBottom: 4,
  },
  btnRow: {
    gap: 10,
    marginTop: 4,
    alignSelf: 'stretch',
  },
  btnPrimary: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  btnCancel: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
