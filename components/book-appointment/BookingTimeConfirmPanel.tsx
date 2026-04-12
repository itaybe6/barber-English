import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

function isHebrewLocale(lang: string | undefined): boolean {
  if (typeof lang !== 'string') return false;
  const l = lang.toLowerCase();
  return l.startsWith('he') || l.startsWith('iw');
}

const WIN_W = Dimensions.get('window').width;
const WIN_H = Dimensions.get('window').height;
const DURATION = 420;

export interface BookingTimeConfirmPanelProps {
  visible: boolean;
  onChangeTime: () => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
  staffName?: string;
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
  /** Under forceRTL, flex directions mirror again; LTR shell + explicit row-reverse matches Hebrew (see app/(tabs)/finance.tsx rtlRoot). */
  const layoutRtl = I18nManager.isRTL || isHebrewLocale(activeLang);
  const durationLine =
    totalPrice > 0
      ? `${durationMinutes} ${t('booking.min', 'דק׳')} · ₪${totalPrice}`
      : `${durationMinutes} ${t('booking.min', 'דק׳')}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onChangeTime}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onChangeTime} accessibilityRole="button">
          <Animated.View entering={FadeIn.duration(200)} style={[styles.backdrop, StyleSheet.absoluteFill]} />
        </Pressable>

        <View style={styles.centerWrap} pointerEvents="box-none">
          <Animated.View
            entering={FadeInDown.duration(DURATION)}
            layout={LinearTransition.duration(DURATION)}
            style={[
              styles.panel,
              {
                width: Math.min(WIN_W - 40, 400),
                maxHeight: WIN_H * 0.78,
                backgroundColor: cardBackground,
                borderColor: `${textColor}12`,
                direction: 'ltr',
              },
            ]}
          >
            <View style={[styles.accentBar, { backgroundColor: primaryColor }]} />

            <View style={styles.headerBlock}>
              <Pressable
                onPress={onChangeTime}
                hitSlop={14}
                style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.65 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('booking.timePanel.close', 'סגור')}
              >
                <Ionicons name="close" size={22} color={textSecondary} />
              </Pressable>
              <View style={[styles.headerTextCol, { alignItems: layoutRtl ? 'flex-end' : 'flex-start' }]}>
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
            </View>

            <View style={[styles.divider, { backgroundColor: `${textColor}12` }]} />

            <View style={styles.rows}>
              {staffName ? (
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
            </View>

            <View style={[styles.btnRow, { flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse' }]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  centerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderRadius: 24,
    padding: 20,
    paddingTop: 22,
    gap: 14,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    height: 52,
    borderBottomLeftRadius: 4,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 12,
    paddingLeft: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  headerTextCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    alignSelf: 'stretch',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  rows: {
    gap: 10,
    alignSelf: 'stretch',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
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
