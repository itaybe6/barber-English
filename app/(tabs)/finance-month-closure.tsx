import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useAuthStore } from '@/stores/authStore';
import { useAdminFinanceMonthStore } from '@/stores/adminFinanceMonthStore';
import {
  financeApi,
  type CompletedAppointmentReceiptRow,
  type MonthlyReport,
} from '@/lib/api/finance';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { financeAccountantPackageApi } from '@/lib/api/financeAccountantPackage';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Mail,
  Send,
  Wallet,
  Scale,
} from 'lucide-react-native';

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/** מקום ל־AdminFloatingTabBar (~56px) + מרווח (~22) מעל ה-safe area */
const ADMIN_TAB_BAR_CLEARANCE = 92;

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  rent: 'שכירות',
  supplies: 'חומרים',
  equipment: 'ציוד',
  marketing: 'שיווק',
  other: 'אחר',
};

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

export default function FinanceMonthClosureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  const year = useAdminFinanceMonthStore((s) => s.year);
  const month = useAdminFinanceMonthStore((s) => s.month);
  const goToPreviousMonth = useAdminFinanceMonthStore((s) => s.goToPreviousMonth);
  const goToNextMonth = useAdminFinanceMonthStore((s) => s.goToNextMonth);

  useFocusEffect(
    useCallback(() => {
      const y = params.year != null ? parseInt(String(params.year), 10) : NaN;
      const m = params.month != null ? parseInt(String(params.month), 10) : NaN;
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        useAdminFinanceMonthStore.setState({ year: y, month: m });
      }
    }, [params.year, params.month]),
  );

  const { colors: theme } = useBusinessColors();
  const primary = theme.primary || '#0D9488';
  const isAdminUser = useAuthStore((s) => s.isAdmin);

  const [rows, setRows] = useState<CompletedAppointmentReceiptRow[]>([]);
  const [monthReport, setMonthReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [giOk, setGiOk] = useState(false);
  const [acctEmail, setAcctEmail] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, prof, report] = await Promise.all([
        financeApi.listCompletedAppointmentsForReceipts(year, month, {
          onlyWithoutReceipt: true,
        }),
        businessProfileApi.getProfile(),
        financeApi.getMonthlyReport(year, month),
      ]);
      setRows(list);
      setMonthReport(report);
      setGiOk(!!prof?.greeninvoice_has_credentials);
      setAcctEmail(String((prof as { accountant_email?: string })?.accountant_email ?? '').trim());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(rows.map((r) => r.id)));
  };

  const clearAll = () => setSelected(new Set());

  const selectedTotal = useMemo(() => {
    let s = 0;
    for (const r of rows) {
      if (selected.has(r.id)) s += r.price;
    }
    return s;
  }, [rows, selected]);

  const summaryNetForSelection = useMemo(() => {
    const exp = monthReport?.totalExpenses ?? 0;
    return selectedTotal - exp;
  }, [selectedTotal, monthReport?.totalExpenses]);

  const formatCurrency = (n: number) =>
    `₪${Math.round(n).toLocaleString('he-IL')}`;

  const onConfirmSend = () => {
    if (selected.size === 0) {
      Alert.alert('בחירה נדרשת', 'סמנו לפחות תור אחד להפקת קבלה.');
      return;
    }
    if (!giOk) {
      Alert.alert('חשבונית ירוקה', 'יש להתחבר לחשבונית ירוקה ממסך הפיננסים.');
      return;
    }
    if (!acctEmail) {
      Alert.alert('רואה חשבון', 'יש להזין אימייל רואה חשבון בהגדרות רואה חשבון.');
      return;
    }
    const rep = monthReport;
    const summaryNote =
      rep != null
        ? `\n\nבאקסל: הכנסות חודש ${formatCurrency(rep.totalIncome)}, הוצאות ${formatCurrency(rep.totalExpenses)}, רווח נקי ${formatCurrency(rep.netProfit)}.`
        : '';
    Alert.alert(
      'שליחה לרואה חשבון',
      `יופקו קבלות ל־${selected.size} תורים (${formatCurrency(selectedTotal)}) ויישלח מייל ל־${acctEmail} כולל אקסל (סיכום + הכנסות + הוצאות) וקבצי הוצאות.${summaryNote}\n\nלהמשיך?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אישור ושליחה',
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              const res = await financeAccountantPackageApi.sendMonthlyPackage({
                year,
                month,
                appointmentIds: Array.from(selected),
              });
              if (!res.ok) {
                const msg =
                  res.error === 'email_failed'
                    ? res.message || 'שליחת המייל נכשלה'
                    : res.details?.join('\n') || res.message || res.error;
                Alert.alert('שגיאה', msg);
                return;
              }
              let body = `הופקו ${res.issuedCount} קבלות.`;
              if (res.emailSent) body += '\nהמייל נשלח לרואה החשבון.';
              else body += '\nהמייל לא נשלח (בדוק הגדרות שרת).';
              if (res.receiptErrors?.length) {
                body += `\n\nאזהרות:\n${res.receiptErrors.join('\n')}`;
              }
              Alert.alert('בוצע', body, [
                {
                  text: 'אישור',
                  onPress: () => {
                    setSelected(new Set());
                    void load();
                    router.push('/(tabs)/finance');
                  },
                },
              ]);
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  if (!isAdminUser) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[styles.backFab, { backgroundColor: `${primary}18` }]}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <ChevronRight size={26} color={primary} />
        </TouchableOpacity>
        <Text style={[styles.deniedTitle, { color: theme.text }]}>גישה למנהלים בלבד</Text>
        <Text style={[styles.deniedSub, { color: theme.textSecondary }]}>
          מסך סגירת החודש והשליחה לרואה החשבון זמין רק למשתמשי ניהול.
        </Text>
      </View>
    );
  }

  const scrollBottomPad =
    insets.bottom + ADMIN_TAB_BAR_CLEARANCE + 120;

  const reportExpenses = monthReport?.expenses ?? [];
  const reportTotalExpenses = monthReport?.totalExpenses ?? 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[lightenHex(primary, 0.12), darkenHex(primary, 0.35)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.heroTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.heroIconBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <ChevronRight size={26} color="#fff" />
          </TouchableOpacity>
          <Animated.View entering={FadeIn.duration(400)} style={styles.heroTitleBlock}>
            <View style={styles.sparkRow}>
              <Sparkles size={22} color="#FDE68A" />
              <Text style={styles.heroKicker}>סגירת חודש</Text>
            </View>
            <Text style={styles.heroTitle}>קבלות ודוח לרואה חשבון</Text>
            <Text style={styles.heroSub}>
              סמנו תורים → הפקת קבלות בחשבונית ירוקה → מייל אוטומטי עם אקסל והוצאות
            </Text>
          </Animated.View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrow} hitSlop={12}>
            <ChevronRight size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES_HE[month - 1]} {year}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrow} hitSlop={12}>
            <ChevronLeft size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusChip, !giOk && styles.statusChipWarn]}>
            <Text style={styles.statusChipText}>
              {giOk ? 'חשבונית ירוקה מחוברת' : 'לא מחובר לחשבונית ירוקה'}
            </Text>
          </View>
          <View style={[styles.statusChip, !acctEmail && styles.statusChipWarn]}>
            <Mail size={14} color="#fff" style={{ marginLeft: 6 }} />
            <Text style={styles.statusChipText} numberOfLines={1}>
              {acctEmail || 'חסר אימייל רואה חשבון'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.toolbar, { backgroundColor: theme.surface }]}>
        <Text style={[styles.toolbarSum, { color: theme.text }]}>
          {selected.size} נבחרו · {formatCurrency(selectedTotal)}
        </Text>
        <View style={styles.toolbarSpacer} />
        <TouchableOpacity onPress={clearAll} style={[styles.toolBtn, { borderColor: `${theme.border}66` }]}>
          <Text style={[styles.toolBtnText, { color: theme.textSecondary }]}>נקה</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={selectAll} style={[styles.toolBtn, { borderColor: `${primary}44` }]}>
          <Text style={[styles.toolBtnText, { color: primary }]}>בחר הכל</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: scrollBottomPad,
            maxWidth: 560,
            width: '100%',
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <Animated.View entering={FadeInDown.springify()} style={styles.emptyInScroll}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>אין תורים ללא קבלה</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                כל התורים בחודש הזה כבר סומנו עם קבלה, או שאין תורים מתאימים.
              </Text>
            </Animated.View>
          ) : (
            rows.map((row, index) => {
              const on = selected.has(row.id);
              const client =
                row.client_label.trim() || 'לקוח';
              const initial = (client.trim().charAt(0) || '?').toUpperCase();
              return (
                <Animated.View
                  key={row.id}
                  entering={FadeInDown.delay(index * 40).springify()}
                >
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => toggle(row.id)}
                    style={[
                      styles.card,
                      {
                        borderColor: on ? primary : `${theme.border}33`,
                        backgroundColor: on ? `${primary}0C` : theme.surface,
                      },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: `${primary}22` }]}>
                      <Text style={[styles.avatarChar, { color: primary }]}>{initial}</Text>
                    </View>
                    <View style={[styles.priceTag, { backgroundColor: `${primary}18` }]}>
                      <Text style={[styles.priceTagText, { color: primary }]}>
                        {formatCurrency(row.price)}
                      </Text>
                    </View>
                    <View style={styles.cardBody}>
                      <Text
                        style={[styles.cardClient, styles.rtlText, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {client}
                      </Text>
                      <Text
                        style={[styles.cardMeta, styles.rtlText, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {row.service_name} · {row.slot_date} {row.slot_time}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.checkOrb,
                        on
                          ? { backgroundColor: primary, borderColor: primary }
                          : { borderColor: `${theme.border}88` },
                      ]}
                    >
                      {on ? <Check size={18} color="#fff" strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}

          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: `${theme.border}33` }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>הוצאות בחודש</Text>
              <Wallet size={20} color={primary} />
            </View>
            <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
              אותן הוצאות יצורפו למייל ולגיליון «הוצאות» באקסל.
            </Text>
            {reportExpenses.length === 0 ? (
              <Text style={[styles.mutedBlock, { color: theme.textSecondary }]}>
                אין הוצאות רשומות לחודש זה.
              </Text>
            ) : (
              reportExpenses.map((exp, i) => {
                const catLabel =
                  EXPENSE_CATEGORY_LABEL[exp.category] || EXPENSE_CATEGORY_LABEL.other;
                const line = (exp.description || '').trim() || catLabel;
                return (
                  <View
                    key={exp.id}
                    style={[
                      styles.expenseRow,
                      i < reportExpenses.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: `${theme.border}44`,
                      },
                    ]}
                  >
                    <View style={styles.expenseRowMain}>
                      <Text style={[styles.expenseLine, styles.rtlText, { color: theme.text }]} numberOfLines={2}>
                        {line}
                      </Text>
                      <View style={styles.expenseMetaRow}>
                        <View style={[styles.catPill, { backgroundColor: `${primary}14` }]}>
                          <Text style={[styles.catPillText, { color: primary }]}>{catLabel}</Text>
                        </View>
                        <Text style={[styles.expenseDateSmall, { color: theme.textSecondary }]}>
                          {exp.expense_date}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.expenseAmt, { color: theme.error }]}>
                      −{formatCurrency(Number(exp.amount))}
                    </Text>
                    {exp.receipt_url ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(exp.receipt_url!)}
                        hitSlop={12}
                        style={styles.expenseThumbWrap}
                        accessibilityRole="button"
                        accessibilityLabel="פתיחת אסמכתא"
                      >
                        <Image source={{ uri: exp.receipt_url }} style={styles.expenseThumb} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}
            {reportExpenses.length > 0 ? (
              <View style={[styles.expenseTotalRow, { borderTopColor: `${theme.border}55` }]}>
                <Text style={[styles.expenseTotalLabel, { color: theme.text }]}>סה״כ הוצאות</Text>
                <Text style={[styles.expenseTotalAmt, { color: theme.error }]}>
                  {formatCurrency(reportTotalExpenses)}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/finance')}
              style={styles.financeLink}
              hitSlop={8}
            >
              <ChevronLeft size={18} color={primary} />
              <Text style={[styles.financeLinkText, { color: primary }]}>ניהול הוצאות במסך פיננסים</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.sectionCard, styles.summaryCard, { backgroundColor: `${primary}0A`, borderColor: `${primary}33` }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>סיכום לפני שליחה</Text>
              <Scale size={20} color={primary} />
            </View>
            <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
              הכנסות והרווח כאן לפי הסימון בלבד. הוצאות — כל החודש (כבאקסל). בגיליון «סיכום» באקסל נשארות הכנסות כל התורים בחודש.
            </Text>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceVal, { color: theme.text }]}>
                {formatCurrency(selectedTotal)}
              </Text>
              <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
                הכנסות לפי תורים מסומנים
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceVal, { color: theme.error }]}>
                {formatCurrency(reportTotalExpenses)}
              </Text>
              <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
                סה״כ הוצאות בחודש
              </Text>
            </View>
            <View style={[styles.balanceRow, styles.balanceRowNet]}>
              <Text
                style={[
                  styles.balanceValNet,
                  { color: summaryNetForSelection >= 0 ? '#15803D' : theme.error },
                ]}
              >
                {formatCurrency(summaryNetForSelection)}
              </Text>
              <Text style={[styles.balanceLabelNet, { color: theme.text }]}>רווח נקי (לפי הסימון)</Text>
            </View>
          </View>
        </ScrollView>
      )}

      <View
        style={[
          styles.bottomBar,
          {
            bottom: insets.bottom + ADMIN_TAB_BAR_CLEARANCE,
            paddingBottom: 12,
            backgroundColor: theme.surface,
            borderTopColor: `${theme.border}22`,
          },
        ]}
      >
        <LinearGradient
          colors={['#22C55E', '#16A34A', '#0F6B2C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.ctaGrad, { opacity: sending || selected.size === 0 ? 0.45 : 1 }]}
        >
          <TouchableOpacity
            disabled={sending || selected.size === 0}
            onPress={onConfirmSend}
            style={styles.ctaInner}
            activeOpacity={0.9}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={22} color="#fff" />
                <Text style={styles.ctaText}>הפק קבלות ושלח לרואה חשבון</Text>
              </>
            )}
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  heroTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  sparkRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroSub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  monthNav: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 18,
  },
  monthArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    minWidth: 140,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  statusChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    maxWidth: '100%',
  },
  statusChipWarn: {
    backgroundColor: 'rgba(251,191,36,0.35)',
  },
  statusChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000010',
  },
  toolBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  toolbarSpacer: { flex: 1 },
  toolbarSum: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyInScroll: {
    paddingVertical: 28,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    marginTop: 18,
  },
  summaryCard: {
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    direction: 'rtl',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 12,
  },
  mutedBlock: {
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 8,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    direction: 'rtl',
  },
  expenseRowMain: {
    flex: 1,
    minWidth: 0,
  },
  expenseLine: {
    fontSize: 15,
    fontWeight: '700',
  },
  expenseMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  catPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  expenseDateSmall: {
    fontSize: 12,
    fontWeight: '600',
  },
  expenseAmt: {
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'ltr',
  },
  expenseThumbWrap: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  expenseThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  expenseTotalRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expenseTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  expenseTotalAmt: {
    fontSize: 16,
    fontWeight: '900',
    writingDirection: 'ltr',
  },
  financeLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 14,
  },
  financeLinkText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  balanceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  balanceRowNet: {
    marginTop: 4,
    paddingTop: 10,
    paddingBottom: 4,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  balanceVal: {
    fontSize: 15,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  balanceLabelNet: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  balanceValNet: {
    fontSize: 18,
    fontWeight: '900',
    writingDirection: 'ltr',
  },
  dividerSoft: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 10,
    gap: 10,
    direction: 'rtl',
  },
  checkOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardClient: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  priceTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceTagText: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChar: {
    fontSize: 16,
    fontWeight: '900',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  ctaGrad: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  ctaInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
    writingDirection: 'rtl',
  },
  deniedTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  deniedSub: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  backFab: {
    alignSelf: 'flex-end',
    marginHorizontal: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
