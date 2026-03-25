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
  Image,
  Linking,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { expensesApi } from '@/lib/api/expenses';
import { financeApi } from '@/lib/api/finance';
import type { ServiceIncomeBreakdown } from '@/lib/api/finance';
import type { BusinessExpense, BusinessProfile, ExpenseCategory } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  Mail,
  X,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  FileImage,
  Calendar,
  Clock,
  Eye,
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

const CATEGORIES: ExpenseCategory[] = ['rent', 'supplies', 'equipment', 'marketing', 'other'];

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

export default function FinanceScreen() {
  const router = useRouter();
  const { colors: businessColors } = useBusinessColors();
  const primaryColor = businessColors.primary || '#000000';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomeBreakdown, setIncomeBreakdown] = useState<ServiceIncomeBreakdown[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [businessNumber, setBusinessNumber] = useState('');
  const [accountantEmail, setAccountantEmail] = useState('');
  const [reportDayOfMonth, setReportDayOfMonth] = useState(1);
  const [reportTimeDate, setReportTimeDate] = useState(() => parseTimeToDate('09:00'));
  const [showReportDayModal, setShowReportDayModal] = useState(false);
  const [showReportTimeModal, setShowReportTimeModal] = useState(false);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);
  const [webTimeDraft, setWebTimeDraft] = useState('09:00');

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<ExpenseCategory>('other');
  const [newExpenseReceipt, setNewExpenseReceipt] = useState<{ uri: string; base64?: string } | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showAccountantPreview, setShowAccountantPreview] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [report, prof] = await Promise.all([
        financeApi.getMonthlyReport(year, month),
        businessProfileApi.getProfile(),
      ]);
      setTotalIncome(report.totalIncome);
      setTotalExpenses(report.totalExpenses);
      setIncomeBreakdown(report.incomeBreakdown);
      setExpenses(report.expenses);
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
      console.error('שגיאה בטעינת נתונים פיננסיים:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const goToPreviousMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else { setMonth(m => m - 1); }
  };

  const goToNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else { setMonth(m => m + 1); }
  };

  const netProfit = totalIncome - totalExpenses;

  const formatCurrency = (amount: number) =>
    `₪${Math.round(amount).toLocaleString('he-IL')}`;

  const pickReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להוסיף תמונת קבלה');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setNewExpenseReceipt({ uri: a.uri, base64: a.base64 ?? undefined });
    }
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(newExpenseAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('שגיאה', 'יש להזין סכום תקין');
      return;
    }
    setSavingExpense(true);
    try {
      let receiptUrl: string | null = null;
      if (newExpenseReceipt) {
        receiptUrl = await expensesApi.uploadReceipt({
          uri: newExpenseReceipt.uri,
          base64: newExpenseReceipt.base64,
        });
      }
      const today = new Date();
      const expenseDate = `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const result = await expensesApi.createExpense({
        amount,
        description: newExpenseDescription.trim() || undefined,
        category: newExpenseCategory,
        expense_date: expenseDate,
        receipt_url: receiptUrl || undefined,
      });
      if (result) {
        setNewExpenseAmount('');
        setNewExpenseDescription('');
        setNewExpenseCategory('other');
        setNewExpenseReceipt(null);
        setShowAddExpense(false);
        loadData();
      } else {
        Alert.alert('שגיאה', 'לא ניתן להוסיף את ההוצאה, נסה שנית');
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expense: BusinessExpense) => {
    const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
    Alert.alert(
      'מחיקת הוצאה',
      `למחוק את "${expense.description || cat.label}" (${formatCurrency(Number(expense.amount))})?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק', style: 'destructive',
          onPress: async () => {
            const ok = await expensesApi.deleteExpense(expense.id);
            if (ok) loadData();
            else Alert.alert('שגיאה', 'לא ניתן למחוק את ההוצאה');
          },
        },
      ],
    );
  };

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

  const netColor = netProfit >= 0 ? '#16A34A' : '#EF4444';

  // --- Loading State ---
  if (loading) {
    return (
      <View style={{ flex: 1, direction: 'rtl' }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={styles.loadingText}>טוען נתונים פיננסיים...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    // direction: 'rtl' makes all flex-row layouts render right→left automatically
    <View style={styles.rtlRoot}>
      <SafeAreaView style={styles.container} edges={['top']}>

        {/* ── Header ── */}
        <View style={styles.topBar}>
          {/* In RTL row: first element is rightmost → back button on right */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronRight size={26} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>מעקב פיננסי</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAwareScreenScroll
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Hero Summary Card ── */}
          <View style={styles.heroWrapper}>
            <LinearGradient
              colors={[primaryColor, primaryColor, `${primaryColor}CC`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              {/* Decorative circle */}
              <View style={styles.heroBubble} />
              <View style={styles.heroBubbleSmall} />

              {/* Month Navigator — in RTL row: prev on RIGHT, next on LEFT */}
              <View style={styles.monthRow}>
                <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrowBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <ChevronRight size={22} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
                <View style={styles.monthCenter}>
                  <Text style={styles.monthNameHe}>{MONTH_NAMES_HE[month - 1]}</Text>
                  <Text style={styles.monthYearHe}>{year}</Text>
                </View>
                <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrowBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <ChevronLeft size={22} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              </View>

              {/* Net Profit */}
              <Text style={styles.heroNetLabel}>רווח נקי</Text>
              <Text style={[styles.heroNetAmount, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>
                {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
              </Text>

              {/* Income / Expenses mini cards */}
              <View style={styles.heroMiniRow}>
                <View style={styles.heroMiniCard}>
                  <View style={styles.heroMiniIcon}>
                    <ArrowUpRight size={14} color="#16A34A" />
                  </View>
                  <Text style={styles.heroMiniLabel}>הכנסות</Text>
                  <Text style={styles.heroMiniValue}>{formatCurrency(totalIncome)}</Text>
                </View>
                <View style={styles.heroMiniDivider} />
                <View style={styles.heroMiniCard}>
                  <View style={[styles.heroMiniIcon, { backgroundColor: '#FEE2E2' }]}>
                    <ArrowDownRight size={14} color="#EF4444" />
                  </View>
                  <Text style={styles.heroMiniLabel}>הוצאות</Text>
                  <Text style={styles.heroMiniValue}>{formatCurrency(totalExpenses)}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* ── Income Breakdown ── RTL: מימין לשמאל */}
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>פירוט הכנסות</Text>
          </View>
          <View style={styles.card}>
            {incomeBreakdown.length === 0 ? (
              <View style={styles.emptyState}>
                <TrendingUp size={36} color="#E5E7EB" />
                <Text style={styles.emptyTitle}>אין הכנסות החודש</Text>
                <Text style={styles.emptySubtitle}>תורים שהושלמו יופיעו כאן</Text>
              </View>
            ) : (
              <>
                {incomeBreakdown.map((item, index) => (
                  <View
                    key={item.service_id || item.service_name}
                    style={[styles.incomeRow, index < incomeBreakdown.length - 1 && styles.incomeRowDivider]}
                  >
                    <View style={styles.incomeLeftBlock}>
                      <View style={[styles.incomeBadge, { backgroundColor: `${primaryColor}18` }]}>
                        <Text style={[styles.incomeBadgeText, { color: primaryColor }]}>
                          {item.count}
                        </Text>
                      </View>
                      <Text style={styles.incomeServiceName} numberOfLines={1}>
                        {item.service_name}
                      </Text>
                    </View>
                    <View style={styles.incomeTotalBlock}>
                      <Text style={styles.incomeServiceTotal}>{formatCurrency(item.total)}</Text>
                      <Text style={styles.incomeServiceSub}>
                        {item.count} תורים × {formatCurrency(item.price)}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={styles.incomeTotalRow}>
                  <Text style={styles.totalLabel}>סך הכל הכנסות</Text>
                  <Text style={[styles.totalAmount, { color: '#16A34A' }]}>
                    {formatCurrency(totalIncome)}
                  </Text>
                </View>
                <Text style={styles.priceNote}>* ההכנסות מחושבות לפי המחיר הנוכחי של השירות</Text>
              </>
            )}
          </View>

          {/* ── Expenses ── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>הוצאות</Text>
            <TouchableOpacity
              style={[styles.addExpenseBtn, { backgroundColor: primaryColor }]}
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.82}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.addExpenseBtnText}>הוסף הוצאה</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {expenses.length === 0 ? (
              <View style={styles.emptyState}>
                <DollarSign size={36} color="#E5E7EB" />
                <Text style={styles.emptyTitle}>אין הוצאות רשומות</Text>
                <Text style={styles.emptySubtitle}>לחץ "הוסף הוצאה" להוספת רשומה חדשה</Text>
              </View>
            ) : (
              <>
                {expenses.map((expense, index) => {
                  const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
                  return (
                    <View
                      key={expense.id}
                      style={[styles.expenseRow, index < expenses.length - 1 && styles.rowDivider]}
                    >
                      {/* In RTL: text block on RIGHT, amount+delete on LEFT */}
                      <View style={styles.expenseTextBlock}>
                        <View style={styles.expenseTopRow}>
                          <Text style={styles.expenseDescription}>
                            {expense.description || cat.label}
                          </Text>
                          <View style={[styles.categoryPill, { backgroundColor: cat.bg }]}>
                            <Text style={[styles.categoryPillText, { color: cat.color }]}>
                              {cat.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.expenseDate}>{expense.expense_date}</Text>
                      </View>
                      {expense.receipt_url && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(expense.receipt_url!)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.expenseReceiptBtn}
                        >
                          <Image source={{ uri: expense.receipt_url }} style={styles.expenseReceiptThumb} />
                        </TouchableOpacity>
                      )}
                      <View style={styles.expenseActions}>
                        <Text style={styles.expenseAmount}>
                          -{formatCurrency(Number(expense.amount))}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteExpense(expense)}
                          style={styles.deleteBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={17} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.rowDivider} />
                <View style={[styles.expenseRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>סך הכל הוצאות</Text>
                  <Text style={[styles.totalAmount, { color: '#EF4444' }]}>
                    {formatCurrency(totalExpenses)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ── Accountant Settings ── */}
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>הגדרות רואה חשבון</Text>
          </View>
          <View style={styles.card}>
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

            {/* Business number field — in RTL: icon on LEFT, text on RIGHT */}
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

      {/* ── Add Expense Modal ── */}
      <Modal visible={showAddExpense} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAwareScreenScroll
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {/* Modal header — in RTL: title on RIGHT, close on LEFT */}
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>הוספת הוצאה</Text>
              <TouchableOpacity onPress={() => { setShowAddExpense(false); setNewExpenseReceipt(null); }} style={styles.modalCloseBtn}>
                <X size={22} color={Colors.subtext} />
              </TouchableOpacity>
            </View>

            {/* Big amount field */}
            <View style={styles.amountBox}>
              <Text style={styles.amountCurrency}>₪</Text>
              <TextInput
                style={styles.amountInput}
                value={newExpenseAmount}
                onChangeText={setNewExpenseAmount}
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                keyboardType="decimal-pad"
                autoFocus
                textAlign="center"
              />
            </View>

            {/* Description */}
            <TextInput
              style={styles.descInput}
              value={newExpenseDescription}
              onChangeText={setNewExpenseDescription}
              placeholder="תיאור ההוצאה (אופציונלי)"
              placeholderTextColor="#9CA3AF"
              textAlign="right"
              returnKeyType="done"
            />

            {/* Category grid */}
            <Text style={styles.modalSectionLabel}>בחר קטגוריה</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const cfg = CATEGORY_CONFIG[cat];
                const selected = newExpenseCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setNewExpenseCategory(cat)}
                    activeOpacity={0.75}
                    style={[
                      styles.categoryGridItem,
                      {
                        backgroundColor: selected ? cfg.color : cfg.bg,
                        borderColor: selected ? cfg.color : 'transparent',
                        borderWidth: selected ? 0 : 1.5,
                      },
                    ]}
                  >
                    <Text style={[styles.categoryGridText, { color: selected ? '#fff' : cfg.color }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Receipt / proof */}
            <Text style={styles.modalSectionLabel}>קבלה / אסמכתא (אופציונלי)</Text>
            {newExpenseReceipt ? (
              <View style={styles.receiptPreviewRow}>
                <View style={styles.receiptThumbWrap}>
                  <Image source={{ uri: newExpenseReceipt.uri }} style={styles.receiptThumb} />
                  <TouchableOpacity
                    style={styles.receiptRemoveBtn}
                    onPress={() => setNewExpenseReceipt(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.receiptAddedText}>תמונה נוספה</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.receiptAddBtn, { borderColor: primaryColor }]}
                onPress={pickReceipt}
                activeOpacity={0.7}
              >
                <FileImage size={22} color={primaryColor} />
                <Text style={[styles.receiptAddBtnText, { color: primaryColor }]}>הוסף תמונת קבלה</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.modalAddBtn, { backgroundColor: primaryColor }]}
              onPress={handleAddExpense}
              disabled={savingExpense}
              activeOpacity={0.82}
            >
              {savingExpense
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalAddBtnText}>הוסף הוצאה</Text>
              }
            </TouchableOpacity>
          </View>
          </KeyboardAwareScreenScroll>
        </View>
      </Modal>

      {/* ── Accountant report preview (same structure as email) ── */}
      <Modal visible={showAccountantPreview} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.previewModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAccountantPreview(false)}
          />
          <View style={[styles.previewModalSheet, { borderTopColor: primaryColor }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>תצוגת דוח לרואה חשבון</Text>
              <TouchableOpacity
                onPress={() => setShowAccountantPreview(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={22} color={Colors.subtext} />
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

      {/* ── Success Modal ── RTL */}
      <Modal visible={showSuccessModal} animationType="fade" transparent statusBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.successModalOverlay}
          onPress={() => setShowSuccessModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.successModalBox, { borderTopColor: primaryColor }]}
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

      {/* יום בשליחה בחודש */}
      <Modal visible={showReportDayModal} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.reportModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowReportDayModal(false)}
          />
          <View style={[styles.modalSheet, { paddingBottom: 28 }]}>
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

      {/* שעת שליחה — iOS / Web */}
      <Modal visible={showReportTimeModal} animationType="slide" transparent statusBarTranslucent>
        {Platform.OS === 'web' ? (
          <View style={styles.successModalOverlay}>
            <View style={[styles.successModalBox, { maxWidth: 360 }]}>
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
                <Text style={{ textAlign: 'center', color: Colors.subtext, fontWeight: '600' }}>ביטול</Text>
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
            <View style={[styles.modalSheet, styles.timePickerSheet]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalSectionLabel, { marginBottom: 8 }]}>שעת שליחה</Text>
              {/* UIDatePicker breaks inside RTL + white sheet when system is dark — force LTR, light theme, explicit size */}
              <View style={styles.timePickerIOSWrap}>
                <DateTimePicker
                  value={reportTimeDate}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  textColor={Colors.text}
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

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
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

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
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
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },

  // ── ScrollView ──
  scroll: {
    paddingTop: 0,
    direction: 'rtl',
  },

  // ── Hero card ──
  heroWrapper: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  heroCard: {
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  heroBubble: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    left: -40,
  },
  heroBubbleSmall: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: -30,
    right: 20,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  monthArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthNameHe: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  monthYearHe: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 2,
  },
  heroNetLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroNetAmount: {
    fontSize: 46,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 24,
  },
  heroMiniRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  heroMiniCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  heroMiniDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 8,
  },
  heroMiniIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMiniLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textAlign: 'center',
  },
  heroMiniValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },

  // ── Sections ── (RTL: flex-start = right)
  sectionTitleWrap: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  addExpenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
  },
  addExpenseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },

  // ── Card ──
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 20,
    direction: 'rtl',
    ...cardShadow,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#C4C9D4',
    textAlign: 'center',
  },

  // ── Income breakdown ── RTL: row-reverse = ראשון בימין
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F7',
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  incomeRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F7',
  },
  incomeLeftBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  incomeBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  incomeServiceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
  },
  incomeTotalBlock: {
    alignItems: 'center',
  },
  incomeServiceTotal: {
    fontSize: 19,
    fontWeight: '800',
    color: '#16A34A',
  },
  incomeServiceSub: {
    fontSize: 11,
    color: Colors.subtext,
    marginTop: 2,
  },
  incomeTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F2F7',
  },
  totalRow: {
    flexDirection: 'row',
    direction: 'rtl',
    paddingTop: 14,
    paddingBottom: 2,
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
  },
  priceNote: {
    fontSize: 11,
    color: '#C4C9D4',
    textAlign: 'right',
    marginTop: 12,
    fontStyle: 'italic',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },

  // ── Expense rows ──
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  expenseTextBlock: {
    flex: 1,
  },
  expenseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  expenseDate: {
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'right',
    marginTop: 3,
  },
  expenseReceiptBtn: {
    marginLeft: 8,
  },
  expenseReceiptThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F4F6FB',
  },
  expenseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'right',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Accountant settings ──
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
  reportModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
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

  // ── Modal ──
  modalOverlay: {
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

  // Amount entry
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
    borderRadius: 20,
    paddingVertical: 12,
    marginBottom: 16,
  },
  amountCurrency: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.subtext,
    marginLeft: 6,
  },
  amountInput: {
    fontSize: 52,
    fontWeight: '900',
    color: Colors.text,
    minWidth: 100,
    textAlign: 'center',
    direction: 'ltr',
  },

  // Description
  descInput: {
    height: 50,
    borderWidth: 1.5,
    borderColor: '#E8EAF0',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#FAFBFD',
    marginBottom: 20,
    textAlign: 'right',
  },

  // Category grid
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'flex-start',
  },
  receiptAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  receiptAddBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  receiptThumbWrap: {
    position: 'relative',
  },
  receiptThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#F4F6FB',
  },
  receiptRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptAddedText: {
    fontSize: 14,
    color: Colors.subtext,
    fontWeight: '600',
  },
  categoryGridItem: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
  },
  categoryGridText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
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

  // ── Success Modal ── RTL
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

  // ── Accountant preview ──
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
});
