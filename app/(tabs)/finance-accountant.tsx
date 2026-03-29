import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { businessProfileApi } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import { useAdminFinanceMonthReport } from '@/hooks/useAdminFinanceMonthReport';
import {
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Mail,
  X,
  CheckCircle,
  Eye,
  Calendar,
  Clock,
} from 'lucide-react-native';

const REPORT_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function parseTimeToDate(s: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return new Date(2000, 0, 1, 9, 0, 0, 0);
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return new Date(2000, 0, 1, h, min, 0, 0);
}

function formatTimeToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  rent:      { label: 'שכירות',  color: '#6366F1', bg: '#EEF2FF' },
  supplies:  { label: 'חומרים',  color: '#F59E0B', bg: '#FFFBEB' },
  equipment: { label: 'ציוד',    color: '#10B981', bg: '#ECFDF5' },
  marketing: { label: 'שיווק',   color: '#EC4899', bg: '#FDF2F8' },
  other:     { label: 'אחר',     color: '#6B7280', bg: '#F9FAFB' },
};

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export default function FinanceAccountantScreen() {
  const router = useRouter();
  const { colors: theme } = useBusinessColors();
  const primaryColor = theme.primary || '#000000';

  const {
    year,
    month,
    loading,
    totalIncome,
    totalExpenses,
    incomeBreakdown,
    expenses,
    goToPreviousMonth,
    goToNextMonth,
  } = useAdminFinanceMonthReport();

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [businessNumber, setBusinessNumber] = useState('');
  const [accountantEmail, setAccountantEmail] = useState('');
  const [reportDayOfMonth, setReportDayOfMonth] = useState(1);
  const [reportTimeDate, setReportTimeDate] = useState(() => parseTimeToDate('09:00'));
  const [showReportDayModal, setShowReportDayModal] = useState(false);
  const [showReportTimeModal, setShowReportTimeModal] = useState(false);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);
  const [webTimeDraft, setWebTimeDraft] = useState('09:00');
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showAccountantPreview, setShowAccountantPreview] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const prof = await businessProfileApi.getProfile();
      if (prof) {
        setProfile(prof);
        setBusinessNumber((prof as any).business_number || '');
        setAccountantEmail((prof as any).accountant_email || '');
        const rawDay = Number((prof as any).accountant_report_day_of_month);
        const day = Number.isFinite(rawDay)
          ? Math.min(28, Math.max(1, Math.floor(rawDay)))
          : 1;
        setReportDayOfMonth(day);
        const t = String((prof as any).accountant_report_time || '09:00');
        const td = parseTimeToDate(t);
        setReportTimeDate(td);
        setWebTimeDraft(formatTimeToHm(td));
      }
    } catch (err) {
      console.error('שגיאה בטעינת פרופיל עסק:', err);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const netProfit = totalIncome - totalExpenses;

  const formatCurrency = (amount: number) =>
    `₪${Math.round(amount).toLocaleString('he-IL')}`;

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const result = await businessProfileApi.upsertProfile({
        ...profile,
        business_number: businessNumber.trim() || undefined,
        accountant_email: accountantEmail.trim() || undefined,
        accountant_report_day_of_month: reportDayOfMonth,
        accountant_report_time: formatTimeToHm(reportTimeDate),
      } as any);
      if (result) {
        setProfile(result);
        setShowSuccessModal(true);
      } else {
        Alert.alert('שגיאה', 'לא ניתן לשמור את הפרטים');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <View style={{ flex: 1, direction: 'rtl' }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>טוען...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.rtlRoot}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.topBar, { backgroundColor: theme.surface, borderBottomColor: `${theme.border}18` }]}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/finance')}
            style={[styles.backBtn, { backgroundColor: '#F4F6FB' }]}
            accessibilityRole="button"
            accessibilityLabel="חזור להכנסות והוצאות"
          >
            <ChevronRight size={26} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.topBarTitleBlock}>
            <Text style={[styles.topBarTitle, { color: theme.text }]}>הגדרות רואה חשבון</Text>
            <Text style={[styles.topBarSubtitle, { color: theme.textSecondary }]}>
              תזמון דוח ופרטי שליחה · תצוגה לפי חודש
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAwareScreenScroll
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.monthStrip, { backgroundColor: theme.surface, borderColor: `${theme.border}18` }]}>
            <TouchableOpacity
              onPress={goToPreviousMonth}
              style={styles.monthStripArrow}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="חודש קודם"
            >
              <ChevronRight size={22} color={primaryColor} />
            </TouchableOpacity>
            <Text style={[styles.monthStripTitle, { color: theme.text }]}>
              {MONTH_NAMES_HE[month - 1]} {year}
            </Text>
            <TouchableOpacity
              onPress={goToNextMonth}
              style={styles.monthStripArrow}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="חודש הבא"
            >
              <ChevronLeft size={22} color={primaryColor} />
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
            <Text style={styles.settingsHint}>
              הדוח תמיד על החודש שחלף (הכנסות והוצאות מפורטות). בוחרים את היום בחודש (1–28) ואת השעה לפי שעון ישראל שבה יישלח המייל לרואה החשבון.
            </Text>

            <TouchableOpacity
              style={[styles.previewReportBtn, { borderColor: primaryColor }]}
              onPress={() => setShowAccountantPreview(true)}
              activeOpacity={0.75}
            >
              <Eye size={20} color={primaryColor} />
              <Text style={[styles.previewReportBtnText, { color: primaryColor }]}>
                תצוגה מקדימה לדוח רואה חשבון
              </Text>
            </TouchableOpacity>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>יום בשליחה בכל חודש (1–28)</Text>
              <TouchableOpacity
                style={styles.fieldInputRow}
                onPress={() => setShowReportDayModal(true)}
                activeOpacity={0.75}
              >
                <View style={[styles.scheduleValueBox, { borderColor: '#E8EAF0' }]}>
                  <Text style={styles.scheduleValueText}>{reportDayOfMonth}</Text>
                </View>
                <View style={[styles.fieldIcon, { backgroundColor: `${primaryColor}15` }]}>
                  <Calendar size={18} color={primaryColor} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={[styles.fieldBlock, { marginTop: 16 }]}>
              <Text style={styles.fieldLabel}>שעת שליחה</Text>
              <TouchableOpacity
                style={styles.fieldInputRow}
                onPress={() => {
                  if (Platform.OS === 'android') {
                    setShowAndroidTimePicker(true);
                  } else if (Platform.OS === 'web') {
                    setWebTimeDraft(formatTimeToHm(reportTimeDate));
                    setShowReportTimeModal(true);
                  } else {
                    setShowReportTimeModal(true);
                  }
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.scheduleValueBox, { borderColor: '#E8EAF0' }]}>
                  <Text style={styles.scheduleValueText}>{formatTimeToHm(reportTimeDate)}</Text>
                </View>
                <View style={[styles.fieldIcon, { backgroundColor: `${primaryColor}15` }]}>
                  <Clock size={18} color={primaryColor} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>מספר עוסק / ח.פ.</Text>
              <View style={styles.fieldInputRow}>
                <TextInput
                  style={styles.fieldInput}
                  value={businessNumber}
                  onChangeText={setBusinessNumber}
                  placeholder="לדוגמה: 514788017"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="default"
                  textAlign="right"
                />
                <View style={[styles.fieldIcon, { backgroundColor: `${primaryColor}15` }]}>
                  <Briefcase size={18} color={primaryColor} />
                </View>
              </View>
            </View>

            <View style={[styles.fieldBlock, { marginTop: 16 }]}>
              <Text style={styles.fieldLabel}>מייל רואה חשבון</Text>
              <View style={styles.fieldInputRow}>
                <TextInput
                  style={styles.fieldInput}
                  value={accountantEmail}
                  onChangeText={setAccountantEmail}
                  placeholder="accountant@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
                <View style={[styles.fieldIcon, { backgroundColor: `${primaryColor}15` }]}>
                  <Mail size={18} color={primaryColor} />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: primaryColor }]}
              onPress={handleSaveSettings}
              disabled={savingSettings}
              activeOpacity={0.82}
            >
              {savingSettings
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>שמור פרטים</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={{ height: 110 }} />
        </KeyboardAwareScreenScroll>
      </SafeAreaView>

      <Modal visible={showAccountantPreview} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.previewModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAccountantPreview(false)}
          />
          <View style={[styles.previewModalSheet, { borderTopColor: primaryColor, backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>תצוגת דוח לרואה חשבון</Text>
              <TouchableOpacity
                onPress={() => setShowAccountantPreview(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.previewScroll}
              contentContainerStyle={styles.previewScrollContent}
              showsVerticalScrollIndicator
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.previewHeaderCard}>
                <Text style={styles.previewPeriodLabel}>
                  {MONTH_NAMES_HE[month - 1]} {year}
                </Text>
                <Text style={styles.previewBusinessName}>
                  {profile?.display_name?.trim() || 'העסק'}
                </Text>
                {businessNumber.trim() ? (
                  <Text style={styles.previewBusinessMeta}>
                    מספר עוסק / ח.פ.: {businessNumber.trim()}
                  </Text>
                ) : null}
                {accountantEmail.trim() ? (
                  <Text style={styles.previewBusinessMeta}>נשלח אל: {accountantEmail.trim()}</Text>
                ) : (
                  <Text style={[styles.previewBusinessMeta, { color: '#F59E0B' }]}>
                    לא הוגדר מייל רואה חשבון — יש להשלים למטה לפני השליחה
                  </Text>
                )}
              </View>

              <View style={styles.previewSummaryRow}>
                <View style={[styles.previewSummaryBox, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.previewSummaryLabel, { color: '#16A34A' }]}>סה״כ הכנסות</Text>
                  <Text style={[styles.previewSummaryValue, { color: '#16A34A' }]}>
                    {formatCurrency(totalIncome)}
                  </Text>
                </View>
                <View style={[styles.previewSummaryBox, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.previewSummaryLabel, { color: '#DC2626' }]}>סה״כ הוצאות</Text>
                  <Text style={[styles.previewSummaryValue, { color: '#DC2626' }]}>
                    {formatCurrency(totalExpenses)}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.previewSummaryBox,
                  {
                    backgroundColor: netProfit >= 0 ? '#ECFDF5' : '#FEF2F2',
                    width: '100%',
                    marginBottom: 16,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.previewSummaryLabel,
                    { color: netProfit >= 0 ? '#16A34A' : '#DC2626' },
                  ]}
                >
                  רווח נקי
                </Text>
                <Text
                  style={[
                    styles.previewSummaryValue,
                    { color: netProfit >= 0 ? '#16A34A' : '#DC2626' },
                  ]}
                >
                  {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
                </Text>
              </View>

              <Text style={styles.previewSectionTitle}>פירוט הכנסות</Text>
              <View style={styles.previewTableCard}>
                {incomeBreakdown.length === 0 ? (
                  <Text style={styles.previewEmptyText}>אין הכנסות בחודש זה</Text>
                ) : (
                  <>
                    <View style={styles.previewTableHeader}>
                      <Text style={[styles.previewTh, styles.previewThService]}>שירות</Text>
                      <Text style={styles.previewThNum}>תורים</Text>
                      <Text style={styles.previewThMoney}>מחיר</Text>
                      <Text style={styles.previewThMoney}>סה״כ</Text>
                    </View>
                    {incomeBreakdown.map((item) => (
                      <View key={item.service_id || item.service_name} style={styles.previewTableRow}>
                        <Text style={[styles.previewTd, styles.previewThService]} numberOfLines={2}>
                          {item.service_name}
                        </Text>
                        <Text style={styles.previewTdNum}>{item.count}</Text>
                        <Text style={styles.previewTdMoney}>{formatCurrency(item.price)}</Text>
                        <Text style={[styles.previewTdMoney, styles.previewTdMoneyStrong]}>
                          {formatCurrency(item.total)}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.previewTableFooter}>
                      <Text style={styles.previewFooterLabel}>סה״כ הכנסות</Text>
                      <Text style={[styles.previewFooterAmount, { color: '#16A34A' }]}>
                        {formatCurrency(totalIncome)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.previewSectionTitle}>הוצאות</Text>
              <View style={styles.previewTableCard}>
                {expenses.length === 0 ? (
                  <Text style={styles.previewEmptyText}>אין הוצאות בחודש זה</Text>
                ) : (
                  <>
                    <View style={styles.previewTableHeader}>
                      <Text style={[styles.previewTh, { flex: 1.2 }]}>תיאור</Text>
                      <Text style={[styles.previewTh, { flex: 0.85 }]}>קטגוריה</Text>
                      <Text style={[styles.previewTh, { flex: 0.75 }]}>תאריך</Text>
                      <Text style={[styles.previewThMoney, { flex: 0.7 }]}>סכום</Text>
                    </View>
                    {expenses.map((expense) => {
                      const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
                      return (
                        <View key={expense.id} style={styles.previewTableRow}>
                          <Text style={[styles.previewTd, { flex: 1.2 }]} numberOfLines={2}>
                            {expense.description || cat.label}
                          </Text>
                          <Text style={[styles.previewTd, { flex: 0.85, fontSize: 12 }]} numberOfLines={1}>
                            {cat.label}
                          </Text>
                          <Text style={[styles.previewTd, { flex: 0.75, fontSize: 12 }]}>
                            {expense.expense_date}
                          </Text>
                          <Text style={[styles.previewTdMoney, { flex: 0.7, color: '#DC2626' }]}>
                            {formatCurrency(Number(expense.amount))}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={styles.previewTableFooter}>
                      <Text style={styles.previewFooterLabel}>סה״כ הוצאות</Text>
                      <Text style={[styles.previewFooterAmount, { color: '#DC2626' }]}>
                        {formatCurrency(totalExpenses)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.previewDisclaimer}>
                התצוגה מבוססת על החודש שבחרת למעלה. בשליחה האוטומטית נשלח דוח על החודש הקודם (לפי שעון ישראל), באותו מבנה ובאותה לוגיקת חישוב הכנסות כמו כאן.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.previewCloseFullBtn, { backgroundColor: primaryColor }]}
              onPress={() => setShowAccountantPreview(false)}
              activeOpacity={0.82}
            >
              <Text style={styles.modalAddBtnText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} animationType="fade" transparent statusBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.successModalOverlay}
          onPress={() => setShowSuccessModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.successModalBox, { borderTopColor: primaryColor, backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
              <CheckCircle size={48} color={primaryColor} />
            </View>
            <Text style={styles.successModalTitle}>נשמר</Text>
            <Text style={styles.successModalMessage}>פרטי רואה החשבון עודכנו בהצלחה</Text>
            <TouchableOpacity
              style={[styles.successModalBtn, { backgroundColor: primaryColor }]}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.82}
            >
              <Text style={styles.successModalBtnText}>אישור</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showReportDayModal} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.reportModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowReportDayModal(false)}
          />
          <View style={[styles.modalSheet, { paddingBottom: 28, backgroundColor: theme.surface }]}>
            <Text style={styles.modalSectionLabel}>בחר יום בחודש</Text>
            <FlatList
              data={REPORT_DAY_OPTIONS}
              keyExtractor={(item) => String(item)}
              style={styles.reportDayList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = item === reportDayOfMonth;
                return (
                  <TouchableOpacity
                    style={[styles.dayPickRow, selected && { backgroundColor: `${primaryColor}14` }]}
                    onPress={() => {
                      setReportDayOfMonth(item);
                      setShowReportDayModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayPickText,
                        selected && { color: primaryColor, fontWeight: '800' },
                      ]}
                    >
                      {item} בחודש
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showReportTimeModal} animationType="slide" transparent statusBarTranslucent>
        {Platform.OS === 'web' ? (
          <View style={styles.successModalOverlay}>
            <View style={[styles.successModalBox, { maxWidth: 360, backgroundColor: theme.surface }]}>
              <Text style={styles.modalSectionLabel}>שעה (24 שעות, לדוגמה 09:30)</Text>
              <TextInput
                style={styles.fieldInput}
                value={webTimeDraft}
                onChangeText={setWebTimeDraft}
                placeholder="09:00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                textAlign="right"
              />
              <TouchableOpacity
                style={[styles.successModalBtn, { backgroundColor: primaryColor, marginTop: 16 }]}
                onPress={() => {
                  setReportTimeDate(parseTimeToDate(webTimeDraft));
                  setShowReportTimeModal(false);
                }}
                activeOpacity={0.82}
              >
                <Text style={styles.successModalBtnText}>אישור</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReportTimeModal(false)} style={{ marginTop: 14 }}>
                <Text style={{ textAlign: 'center', color: theme.textSecondary, fontWeight: '600' }}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.reportModalRoot}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowReportTimeModal(false)}
            />
            <View style={[styles.modalSheet, styles.timePickerSheet, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalSectionLabel, { marginBottom: 8 }]}>שעת שליחה</Text>
              <View style={styles.timePickerIOSWrap}>
                <DateTimePicker
                  value={reportTimeDate}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  textColor={theme.text}
                  style={styles.timePickerIOSNative}
                  onChange={(_, d) => {
                    if (d) setReportTimeDate(d);
                  }}
                  locale="he-IL"
                />
              </View>
              <TouchableOpacity
                style={[styles.modalAddBtn, { backgroundColor: primaryColor, marginTop: 8 }]}
                onPress={() => setShowReportTimeModal(false)}
                activeOpacity={0.82}
              >
                <Text style={styles.modalAddBtnText}>סיום</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {Platform.OS === 'android' && showAndroidTimePicker ? (
        <DateTimePicker
          value={reportTimeDate}
          mode="time"
          display="default"
          onChange={(event, date) => {
            setShowAndroidTimePicker(false);
            if (event.type === 'set' && date) setReportTimeDate(date);
          }}
        />
      ) : null}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  rtlRoot: {
    flex: 1,
    direction: 'rtl',
    backgroundColor: '#F4F6FB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.subtext,
    textAlign: 'right',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  topBarTitleBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  topBarSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#F4F6FB',
  },
  topBarTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  scroll: {
    paddingTop: 0,
    direction: 'rtl',
  },
  monthStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    ...cardShadow,
  },
  monthStripArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
  },
  monthStripTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 20,
    padding: 20,
    direction: 'rtl',
    ...cardShadow,
  },
  settingsHint: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: 20,
    backgroundColor: '#F4F6FB',
    borderRadius: 12,
    padding: 12,
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    alignSelf: 'flex-start',
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldInput: {
    flex: 1,
    height: 50,
    borderWidth: 1.5,
    borderColor: '#E8EAF0',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#FAFBFD',
    textAlign: 'right',
  },
  fieldIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleValueBox: {
    flex: 1,
    height: 50,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#FAFBFD',
  },
  scheduleValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  saveBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  previewReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 20,
    backgroundColor: '#FAFBFD',
  },
  previewReportBtnText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  previewModalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 4,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    direction: 'rtl',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F4F6FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewScroll: {
    flexGrow: 0,
    maxHeight: Platform.OS === 'web' ? 520 : 480,
  },
  previewScrollContent: {
    paddingBottom: 12,
    direction: 'rtl',
  },
  previewHeaderCard: {
    backgroundColor: '#F4F6FB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  previewPeriodLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.subtext,
    textAlign: 'right',
    marginBottom: 6,
  },
  previewBusinessName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  previewBusinessMeta: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'right',
    marginTop: 6,
    lineHeight: 18,
    writingDirection: 'rtl',
  },
  previewSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  previewSummaryBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  previewSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  previewSummaryValue: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 4,
  },
  previewTableCard: {
    borderWidth: 1,
    borderColor: '#E8EAF0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#FAFBFD',
  },
  previewTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F7',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  previewTh: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    flex: 1,
  },
  previewThService: {
    flex: 1.15,
  },
  previewThNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
    width: 40,
  },
  previewThMoney: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'left',
    width: 56,
  },
  previewTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAF0',
    gap: 4,
  },
  previewTd: {
    fontSize: 13,
    color: Colors.text,
    textAlign: 'right',
    flex: 1,
  },
  previewTdNum: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    width: 40,
  },
  previewTdMoney: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
    width: 56,
  },
  previewTdMoneyStrong: {
    color: '#16A34A',
  },
  previewTableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F0F2F7',
  },
  previewFooterLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  previewFooterAmount: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'left',
  },
  previewEmptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  previewDisclaimer: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
    lineHeight: 16,
    marginTop: 12,
    marginBottom: 4,
    writingDirection: 'rtl',
  },
  previewCloseFullBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalAddBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  modalAddBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalBox: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 320,
    alignItems: 'stretch',
    borderTopWidth: 4,
    direction: 'rtl',
  },
  successModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  successModalMessage: {
    fontSize: 15,
    color: Colors.subtext,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successModalBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  successModalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  reportModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    direction: 'rtl',
  },
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  reportDayList: {
    maxHeight: 280,
    marginTop: 4,
  },
  dayPickRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F7',
  },
  dayPickText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
  },
  timePickerSheet: {
    paddingBottom: 32,
    direction: 'ltr',
  },
  timePickerIOSWrap: {
    width: '100%',
    height: 216,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  timePickerIOSNative: {
    width: '100%',
    height: 216,
  },
});
