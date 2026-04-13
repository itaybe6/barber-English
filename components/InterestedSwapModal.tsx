import React, { useState } from 'react';
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

/** Row that lays out children from RIGHT to LEFT (first JSX child = right edge). */
const RowRTL = ({ style, children, ...rest }: React.ComponentProps<typeof View>) => (
  <View style={[s.rowRTL, style]} {...rest}>{children}</View>
);

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
  const { t } = useTranslation();
  const [swappingId, setSwappingId] = useState<string | null>(null);

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

          {/* Header: [title block RIGHT] [X LEFT] — row-reverse, first child = right */}
          <RowRTL style={s.header}>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>{t('swap.interested.title', 'מעוניינים להחלפה')}</Text>
              <Text style={s.headerSub}>
                {count === 1
                  ? t('swap.interested.subOne', 'לקוח אחד מבקש לקחת את התור שלך')
                  : t('swap.interested.subMany', '{{n}} לקוחות מבקשים לקחת את התור שלך', { n: count })}
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={16} color="#636366" />
            </TouchableOpacity>
          </RowRTL>

          {/* Banner: text right, icon left */}
          <RowRTL style={s.banner}>
            <Text style={s.bannerText}>
              {t('swap.interested.banner', 'בחר עם מי להחליף — שניכם תקבלו עדכון ותור חדש')}
            </Text>
            <Ionicons name="swap-horizontal" size={18} color={PRIMARY} style={s.bannerIcon} />
          </RowRTL>

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
                  {/* Avatar RIGHT, text block, index LEFT */}
                  <RowRTL style={s.cardTop}>
                    <View style={s.avatar}>
                      <LinearGradient colors={[PRIMARY_MID, PRIMARY]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarGrad}>
                        <Text style={s.avatarLetter}>{initial}</Text>
                      </LinearGradient>
                    </View>
                    <View style={s.cardMeta}>
                      <Text style={s.cardName} numberOfLines={1}>{name}</Text>
                      {!!opp.swapRequest.original_service_name && (
                        <Text style={s.cardService} numberOfLines={1}>{opp.swapRequest.original_service_name}</Text>
                      )}
                    </View>
                    <View style={s.indexBadge}>
                      <Text style={s.indexText}>{idx + 1}</Text>
                    </View>
                  </RowRTL>

                  <View style={s.divider} />

                  {/* My slot RIGHT, arrow, their slot LEFT */}
                  <RowRTL style={s.slotRow}>
                    <View style={[s.slotBox, s.slotMine]}>
                      <Text style={[s.slotLabel, s.slotLabelMine]}>{t('swap.interested.yourSlot', 'התור שלך')}</Text>
                      <Text style={[s.slotDate, s.slotDateMine]} numberOfLines={2}>
                        {fmtDate(opp.myAppointment.slot_date)}
                      </Text>
                      <Text style={[s.slotTime, s.slotTimeMine]}>
                        {formatTime12Hour(opp.myAppointment.slot_time || '')}
                      </Text>
                    </View>
                    <View style={s.arrowCircle}>
                      <Ionicons name="swap-horizontal" size={18} color={PRIMARY} />
                    </View>
                    <View style={s.slotBox}>
                      <Text style={s.slotLabel}>{t('swap.interested.theirSlot', 'התור שלהם')}</Text>
                      <Text style={s.slotDate} numberOfLines={2}>
                        {fmtDate(opp.swapRequest.original_date)}
                      </Text>
                      <Text style={s.slotTime}>
                        {formatTime12Hour(opp.swapRequest.original_time || '')}
                      </Text>
                    </View>
                  </RowRTL>

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
                        <RowRTL style={s.swapBtnRow}>
                          <Text style={s.swapBtnText}>{t('swap.interested.confirmBtn', 'אשר החלפה')}</Text>
                          <Ionicons name="checkmark-circle" size={18} color="rgba(255,255,255,0.85)" />
                        </RowRTL>
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
  rowRTL: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: '100%',
  },
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
    alignItems: 'flex-end',
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: DARK,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY_TEXT,
    textAlign: 'right',
    writingDirection: 'rtl',
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
    textAlign: 'right',
    writingDirection: 'rtl',
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
    alignItems: 'flex-end',
    gap: 3,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: DARK,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    letterSpacing: -0.3,
  },
  cardService: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6C6C70',
    textAlign: 'right',
    writingDirection: 'rtl',
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
    alignItems: 'flex-end',
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
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  slotLabelMine: {
    color: PRIMARY,
  },
  slotDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3C3C43',
    textAlign: 'right',
    writingDirection: 'rtl',
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
    textAlign: 'right',
    writingDirection: 'rtl',
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
