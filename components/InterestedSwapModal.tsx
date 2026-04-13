import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import type { SwapRequest, Appointment } from '@/lib/supabase';

const PRIMARY      = '#534AB7';
const PRIMARY_MID  = '#7B74D4';
const PRIMARY_PALE = '#EEEDFE';
const GRAY_TEXT    = '#8E8E93';
const DARK         = '#1C1C1E';

interface RowProps extends React.ComponentProps<typeof View> {
  rtl?: boolean;
}

function SheetRow({ rtl, style, children, ...rest }: RowProps) {
  return (
    <View
      style={[
        {
          flexDirection: rtl ? ('row-reverse' as const) : ('row' as const),
          alignItems: 'center' as const,
          width: '100%' as const,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

interface SwapOpportunity {
  swapRequest: SwapRequest;
  myAppointment: Appointment;
}

interface Props {
  visible: boolean;
  opportunities: SwapOpportunity[];
  onClose: () => void;
  onSwapSuccess: () => void;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function InterestedSwapModal({ visible, opportunities, onClose, onSwapSuccess }: Props) {
  const { t, i18n } = useTranslation();
  const [swappingId, setSwappingId] = useState<string | null>(null);

  const activeLang = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  /** Hebrew/Arabic UI or global RTL — i18n alone can be RTL before I18nManager reloads */
  const layoutRtl = useMemo(
    () =>
      I18nManager.isRTL ||
      activeLang.startsWith('he') ||
      activeLang.startsWith('ar') ||
      (typeof i18n.dir === 'function' && i18n.dir() === 'rtl'),
    [activeLang, i18n],
  );

  const textAlign = layoutRtl ? ('right' as const) : ('left' as const);
  /** Column cross-axis: flex-end = right side in LTR column when I18nManager is not globally RTL */
  const colStart = layoutRtl ? ('flex-end' as const) : ('flex-start' as const);

  const handleSwap = (opp: SwapOpportunity) => {
    const name = opp.swapRequest.requester_name || t('swap.thisUser', 'לקוח זה');
    const theirDate = fmtDate(opp.swapRequest.original_date);
    const theirTime = formatTime12Hour(opp.swapRequest.original_time || '');
    const myDate = fmtDate(opp.myAppointment.slot_date);
    const myTime = formatTime12Hour(opp.myAppointment.slot_time || '');

    Alert.alert(
      t('swap.confirm.title', 'אישור החלפה'),
      `${name} ${t('swap.confirm.lead', 'רוצה שתחליף איתו/ה.')}\n\n${t('swap.confirm.yourSlot', 'התור שלך:')}\n${myDate}, ${myTime}\n\n${t('swap.confirm.willMove', 'יעבור ל:')}\n${theirDate}, ${theirTime}\n\n${t('swap.confirm.question', 'האם לאשר?')}`,
      [
        { text: t('cancel', 'ביטול'), style: 'cancel' },
        {
          text: t('swap.confirm.yes', 'כן, אשר'),
          onPress: async () => {
            setSwappingId(opp.swapRequest.id);
            try {
              const ok = await swapRequestsApi.executeSwap(opp.swapRequest, opp.myAppointment);
              if (ok) {
                Alert.alert(t('success.generic', 'בוצע!'), t('swap.done', 'ההחלפה בוצעה בהצלחה. שניכם קיבלתם עדכון.'));
                onSwapSuccess();
              } else {
                Alert.alert(t('error.generic', 'שגיאה'), t('swap.failed', 'ההחלפה נכשלה. נסה שנית.'));
              }
            } catch {
              Alert.alert(t('error.generic', 'שגיאה'), t('swap.failed', 'ההחלפה נכשלה. נסה שנית.'));
            } finally {
              setSwappingId(null);
            }
          },
        },
      ]
    );
  };

  const count = opportunities.length;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>

          <View style={s.handle} />

          {/* Header: row-reverse in RTL → title (first child) goes right, close button goes left */}
          <SheetRow rtl={layoutRtl} style={s.header}>
            <View style={[s.headerText, { alignItems: colStart }]}>
              <Text style={[s.headerTitle, { textAlign }]}>{t('swap.interested.title', 'מעוניינים להחלפה')}</Text>
              <Text style={[s.headerSub, { textAlign }]}>
                {count === 1
                  ? t('swap.interested.subOne', 'לקוח אחד מבקש לקחת את התור שלך')
                  : t('swap.interested.subMany', '{{n}} לקוחות מבקשים לקחת את התור שלך', { n: count })}
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={16} color="#636366" />
            </TouchableOpacity>
          </SheetRow>

          {/* Banner: row-reverse in RTL → text (first child) goes right, icon goes left */}
          <SheetRow rtl={layoutRtl} style={s.banner}>
            <Text style={[s.bannerText, { textAlign }]}>
              {t('swap.interested.banner', 'בחר עם מי להחליף — שניכם תקבלו עדכון ותור חדש')}
            </Text>
            <Ionicons name="swap-horizontal" size={18} color={PRIMARY} style={s.bannerIcon} />
          </SheetRow>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={s.scroll}
            contentContainerStyle={s.list}
            bounces={false}
          >
            {opportunities.map((opp, idx) => {
              const isSwapping = swappingId === opp.swapRequest.id;
              const name = opp.swapRequest.requester_name || t('swap.unknownUser', 'לקוח');
              const initial = name.trim().charAt(0).toUpperCase();

              return (
                <View key={opp.swapRequest.id} style={s.card}>
                  {/* row-reverse in RTL: avatar → right, cardMeta → middle, indexBadge → left */}
                  <SheetRow rtl={layoutRtl} style={s.cardTop}>
                    <View style={s.avatar}>
                      <LinearGradient colors={[PRIMARY_MID, PRIMARY]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarGrad}>
                        <Text style={s.avatarLetter}>{initial}</Text>
                      </LinearGradient>
                    </View>
                    <View style={[s.cardMeta, { alignItems: colStart }]}>
                      <Text style={[s.cardName, { textAlign }]} numberOfLines={1}>{name}</Text>
                      {!!opp.swapRequest.original_service_name && (
                        <Text style={[s.cardService, { textAlign }]} numberOfLines={1}>{opp.swapRequest.original_service_name}</Text>
                      )}
                    </View>
                    <View style={s.indexBadge}>
                      <Text style={s.indexText}>{idx + 1}</Text>
                    </View>
                  </SheetRow>

                  <View style={s.divider} />

                  {/* row-reverse in RTL: slotMine → right, arrowCircle → middle, slotBox (theirs) → left */}
                  <SheetRow rtl={layoutRtl} style={s.slotRow}>
                    <View style={[s.slotBox, s.slotMine, { alignItems: colStart }]}>
                      <Text style={[s.slotLabel, s.slotLabelMine, { textAlign }]}>{t('swap.interested.yourSlot', 'התור שלך')}</Text>
                      <Text style={[s.slotDate, s.slotDateMine, { textAlign }]} numberOfLines={2}>
                        {fmtDate(opp.myAppointment.slot_date)}
                      </Text>
                      <Text style={[s.slotTime, s.slotTimeMine, { textAlign }]}>
                        {formatTime12Hour(opp.myAppointment.slot_time || '')}
                      </Text>
                    </View>
                    <View style={s.arrowCircle}>
                      <Ionicons name="swap-horizontal" size={18} color={PRIMARY} />
                    </View>
                    <View style={[s.slotBox, { alignItems: colStart }]}>
                      <Text style={[s.slotLabel, { textAlign }]}>{t('swap.interested.theirSlot', 'התור שלהם')}</Text>
                      <Text style={[s.slotDate, { textAlign }]} numberOfLines={2}>
                        {fmtDate(opp.swapRequest.original_date)}
                      </Text>
                      <Text style={[s.slotTime, { textAlign }]}>
                        {formatTime12Hour(opp.swapRequest.original_time || '')}
                      </Text>
                    </View>
                  </SheetRow>

                  <TouchableOpacity
                    style={[s.swapBtn, isSwapping && s.swapBtnLoading]}
                    onPress={() => handleSwap(opp)}
                    disabled={swappingId !== null}
                    activeOpacity={0.82}
                  >
                    <LinearGradient
                      colors={isSwapping ? ['#B0ADE0', '#B0ADE0'] : [PRIMARY_MID, PRIMARY]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.swapBtnInner}
                    >
                      {isSwapping ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <SheetRow rtl={layoutRtl} style={s.swapBtnRow}>
                          <Text style={[s.swapBtnText, { textAlign }]}>{t('swap.interested.confirmBtn', 'אשר החלפה')}</Text>
                          <Ionicons name="checkmark-circle" size={18} color="rgba(255,255,255,0.85)" />
                        </SheetRow>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#F4F4F8',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '88%',
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: -6 } },
      android: { elevation: 28 },
    }),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCDCE0',
    alignSelf: 'center',
    marginTop: 12,
  },

  header: {
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#F4F4F8',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: DARK,
    alignSelf: 'stretch',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY_TEXT,
    alignSelf: 'stretch',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E4E4EA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  banner: {
    marginHorizontal: 18,
    marginBottom: 14,
    backgroundColor: PRIMARY_PALE,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3489',
    lineHeight: 19,
  },
  bannerIcon: { flexShrink: 0 },

  scroll: {
    width: '100%',
    flexGrow: 0,
  },
  list: {
    width: '100%',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 14,
  },

  card: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#1e253b', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  cardTop: {
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarGrad: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: DARK,
    alignSelf: 'stretch',
    letterSpacing: -0.3,
  },
  cardService: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6C6C70',
    alignSelf: 'stretch',
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexText: {
    fontSize: 11,
    fontWeight: '800',
    color: GRAY_TEXT,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  slotRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  slotBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F8F8FC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 3,
  },
  slotMine: {
    backgroundColor: PRIMARY_PALE,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    alignSelf: 'stretch',
  },
  slotLabelMine: {
    color: PRIMARY,
  },
  slotDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3C3C43',
    alignSelf: 'stretch',
    lineHeight: 16,
  },
  slotDateMine: {
    color: PRIMARY,
  },
  slotTime: {
    fontSize: 20,
    fontWeight: '800',
    color: DARK,
    letterSpacing: -0.5,
    alignSelf: 'stretch',
  },
  slotTimeMine: {
    color: PRIMARY,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  swapBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: PRIMARY, shadowOpacity: 0.30, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  swapBtnLoading: { shadowOpacity: 0, elevation: 0 },
  swapBtnInner: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBtnRow: {
    justifyContent: 'center',
    gap: 8,
  },
  swapBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
  },
});
