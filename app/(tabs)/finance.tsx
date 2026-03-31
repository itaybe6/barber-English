import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  Linking,
  type LayoutChangeEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  StatusBar,
  setStatusBarStyle,
  setStatusBarBackgroundColor,
} from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { expensesApi } from '@/lib/api/expenses';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { greenInvoiceConnectApi } from '@/lib/api/greenInvoiceConnect';
import { GreenInvoiceConnectModal } from '@/components/GreenInvoiceConnectModal';
import type { BusinessExpense, ExpenseCategory } from '@/lib/supabase';
import { useAdminFinanceMonthReport } from '@/hooks/useAdminFinanceMonthReport';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  DollarSign,
  X,
  ArrowUpRight,
  ArrowDownRight,
  FileImage,
  Receipt,
} from 'lucide-react-native';

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

const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(KeyboardAwareScrollView);

/** Fade + slide — hide מחמיר (in), show יוצא רך (out) כמו fade-in-up */
const FINANCE_HEADER_HIDE = { duration: 260, easing: Easing.in(Easing.cubic) } as const;
const FINANCE_HEADER_SHOW = { duration: 300, easing: Easing.out(Easing.cubic) } as const;
const FINANCE_SCROLL_DOWN_THRESHOLD = 6;
const FINANCE_SCROLL_UP_THRESHOLD = 6;

/** Same gradient / lava base as `app/login.tsx` */
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

export default function FinanceScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useBusinessColors();
  const primaryColor = theme.primary || '#000000';
  const greenInvoiceAccent = '#16A34A';

  const {
    year,
    month,
    loading,
    reportRefreshing,
    totalIncome,
    totalExpenses,
    incomeBreakdown,
    expenses,
    loadReport,
    goToPreviousMonth,
    goToNextMonth,
  } = useAdminFinanceMonthReport();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<ExpenseCategory>('other');
  const [newExpenseReceipt, setNewExpenseReceipt] = useState<{ uri: string; base64?: string } | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  const [showGreenInvoiceModal, setShowGreenInvoiceModal] = useState(false);
  const [giConnected, setGiConnected] = useState(false);
  const [giKeyIdStored, setGiKeyIdStored] = useState<string | null>(null);
  const [giSaving, setGiSaving] = useState(false);

  const [heroLavaLayout, setHeroLavaLayout] = useState<{ w: number; h: number } | null>(null);
  const onHeroLavaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setHeroLavaLayout((prev) =>
      prev?.w === width && prev?.h === height ? prev : { w: width, h: height },
    );
  }, []);

  const insetsTopSV = useSharedValue(insets.top);
  useEffect(() => {
    insetsTopSV.value = insets.top;
  }, [insets.top, insetsTopSV]);

  const measuredFinanceHeaderHeight = useSharedValue(insets.top + 80);
  const financeHeaderOffsetY = useSharedValue(0);
  const financeLastScrollY = useSharedValue(0);

  const financeScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - financeLastScrollY.value;
      financeLastScrollY.value = y;
      const h = measuredFinanceHeaderHeight.value;
      const topInset = insetsTopSV.value;

      if (y <= 4) {
        financeHeaderOffsetY.value = withTiming(0, FINANCE_HEADER_SHOW);
        return;
      }
      if (dy > FINANCE_SCROLL_DOWN_THRESHOLD) {
        financeHeaderOffsetY.value = withTiming(-h, FINANCE_HEADER_HIDE);
      } else if (dy < -FINANCE_SCROLL_UP_THRESHOLD) {
        financeHeaderOffsetY.value = withTiming(0, FINANCE_HEADER_SHOW);
      }
    },
  });

  const financeHeaderSlideStyle = useAnimatedStyle(() => {
    const h = Math.max(1, measuredFinanceHeaderHeight.value);
    const t = financeHeaderOffsetY.value;
    /** מתואם עם translateY — בחזרה למעלה זה נראה כמו fade-in-up */
    const opacity = interpolate(t, [-h, 0], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY: t }],
    };
  });

  const financeScrollTopSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(insetsTopSV.value, measuredFinanceHeaderHeight.value + financeHeaderOffsetY.value),
  }));

  const onFinanceHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measuredFinanceHeaderHeight.value = e.nativeEvent.layout.height;
    },
    [measuredFinanceHeaderHeight],
  );

  const refreshGreenInvoiceStatus = useCallback(async () => {
    const p = await businessProfileApi.getProfile();
    setGiConnected(!!p?.greeninvoice_has_credentials);
    setGiKeyIdStored(p?.greeninvoice_api_key_id?.trim() || null);
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const p = await businessProfileApi.getProfile();
      if (cancelled) return;
      setGiConnected(!!p?.greeninvoice_has_credentials);
      setGiKeyIdStored(p?.greeninvoice_api_key_id?.trim() || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  /** Home tab uses transparent status bar; restore opaque bar + dark icons so top matches header. */
  useFocusEffect(
    useCallback(() => {
      try {
        setStatusBarStyle('dark', true);
        setStatusBarBackgroundColor(theme.surface, true);
      } catch {
        /* noop */
      }
      return () => {
        try {
          setStatusBarBackgroundColor('transparent', true);
        } catch {
          /* noop */
        }
        financeHeaderOffsetY.value = 0;
        financeLastScrollY.value = 0;
      };
    }, [theme.surface, financeHeaderOffsetY, financeLastScrollY]),
  );

  const openGreenInvoiceModal = () => {
    setShowGreenInvoiceModal(true);
  };

  const giErrorMessage = (code: string, serverMessage?: string) => {
    if (serverMessage && code === 'greeninvoice_auth_failed') return serverMessage;
    const key = `finance.greenInvoice.errors.${code}` as const;
    const translated = t(key);
    const base = translated !== key ? translated : t('finance.greenInvoice.errors.unknown');
    if (code === 'invoke_network' && serverMessage) {
      return `${base}\n\n${serverMessage}`;
    }
    return base;
  };

  const handleGreenInvoiceSubmitCredentials = async (apiKeyId: string, apiSecret: string) => {
    setGiSaving(true);
    try {
      const res = await greenInvoiceConnectApi.connect({ apiKeyId, apiSecret });
      if (res.ok) {
        await refreshGreenInvoiceStatus();
        setShowGreenInvoiceModal(false);
        Alert.alert('', t('finance.greenInvoice.saved'));
      } else {
        Alert.alert(
          t('finance.greenInvoice.saveFailed'),
          giErrorMessage(res.error, res.message),
        );
      }
    } finally {
      setGiSaving(false);
    }
  };

  const handleGreenInvoiceDisconnect = () => {
    Alert.alert(t('finance.greenInvoice.disconnectConfirmTitle'), t('finance.greenInvoice.disconnectConfirmMessage'), [
      { text: t('cancel', 'ביטול'), style: 'cancel' },
      {
        text: t('finance.greenInvoice.disconnect'),
        style: 'destructive',
        onPress: async () => {
          setGiSaving(true);
          try {
            const res = await greenInvoiceConnectApi.disconnect();
            if (res.ok) {
              setGiConnected(false);
              setGiKeyIdStored(null);
              setShowGreenInvoiceModal(false);
            } else {
              Alert.alert(t('finance.greenInvoice.saveFailed'), giErrorMessage(res.error));
            }
          } finally {
            setGiSaving(false);
          }
        },
      },
    ]);
  };

  const netProfit = totalIncome - totalExpenses;

  /** Share of income consumed by expenses — quick scan; label + % (not color-only). */
  const expenseToIncomePct =
    totalIncome > 0 ? Math.min(100, Math.round((totalExpenses / totalIncome) * 100)) : null;

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
        loadReport();
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
            if (ok) loadReport();
            else Alert.alert('שגיאה', 'לא ניתן למחוק את ההוצאה');
          },
        },
      ],
    );
  };

  // --- Loading State ---
  if (loading) {
    return (
      <View style={[styles.rtlRoot, { direction: 'rtl' }]}>
        <StatusBar style="dark" backgroundColor={theme.surface} />
        <View style={{ paddingTop: insets.top, backgroundColor: theme.surface }} />
        <View style={[styles.loadingWrap, { flex: 1 }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>טוען נתונים פיננסיים...</Text>
        </View>
      </View>
    );
  }

  return (
    // direction: 'rtl' makes all flex-row layouts render right→left automatically
    <View style={styles.rtlRoot}>
      <StatusBar style="dark" backgroundColor={theme.surface} />

      <Animated.View
        style={[styles.financeHeaderFixed, financeHeaderSlideStyle]}
        onLayout={onFinanceHeaderLayout}
      >
        <View
          style={[
            styles.topBar,
            {
              paddingTop: insets.top + 14,
              backgroundColor: theme.surface,
              borderBottomColor: `${theme.border}18`,
            },
          ]}
        >
          <View style={styles.topBarTitleBlock}>
            <Text style={[styles.topBarTitle, { color: theme.text }]}>מעקב פיננסי</Text>
            <Text style={[styles.topBarSubtitle, { color: theme.textSecondary }]}>הכנסות והוצאות</Text>
          </View>
        </View>
      </Animated.View>

      <AnimatedKeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={36}
        extraHeight={12}
        enableResetScrollToCoords={false}
        onScroll={financeScrollHandler}
        scrollEventThrottle={16}
      >
          <Animated.View style={financeScrollTopSpacerStyle} />

          {/* ── Hero Summary Card (gradient + lava lamp כמו login) ── */}
          <View style={styles.heroWrapper}>
            <View style={styles.heroCard} onLayout={onHeroLavaLayout}>
              <LinearGradient
                colors={[lightenHex(primaryColor, 0.1), darkenHex(primaryColor, 0.42)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {Platform.OS !== 'web' &&
              heroLavaLayout &&
              heroLavaLayout.w > 0 &&
              heroLavaLayout.h > 0 ? (
                <BrandLavaLampBackground
                  primaryColor={primaryColor}
                  baseColor={darkenHex(primaryColor, 0.42)}
                  layoutWidth={heroLavaLayout.w}
                  layoutHeight={heroLavaLayout.h}
                  count={4}
                  duration={16000}
                  blurIntensity={40}
                />
              ) : null}
              <View style={styles.heroCardInner}>
                {/* Month Navigator — in RTL row: prev on RIGHT, next on LEFT */}
                <View style={styles.monthRow}>
                  <TouchableOpacity
                    onPress={goToPreviousMonth}
                    style={styles.monthArrowBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="חודש קודם"
                    disabled={reportRefreshing}
                  >
                    <ChevronRight size={22} color="rgba(255,255,255,0.85)" />
                  </TouchableOpacity>
                  <View style={styles.monthCenter}>
                    <Text style={styles.monthNameHe}>{MONTH_NAMES_HE[month - 1]}</Text>
                    <Text style={styles.monthYearHe}>{year}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={goToNextMonth}
                    style={styles.monthArrowBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="חודש הבא"
                    disabled={reportRefreshing}
                  >
                    <ChevronLeft size={22} color="rgba(255,255,255,0.85)" />
                  </TouchableOpacity>
                </View>

                {/* Net Profit */}
                <Text style={styles.heroNetLabel}>רווח נקי</Text>
                <Text style={[styles.heroNetAmount, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>
                  {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
                </Text>

                {/* Income / Expenses mini cards (bento strip) */}
                <View style={styles.heroMiniRow}>
                  <View style={styles.heroMiniCard}>
                    <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(220,252,231,0.95)' }]}>
                      <ArrowUpRight size={14} color={theme.success} />
                    </View>
                    <Text style={styles.heroMiniLabel}>הכנסות</Text>
                    <Text style={styles.heroMiniValue}>{formatCurrency(totalIncome)}</Text>
                  </View>
                  <View style={styles.heroMiniDivider} />
                  <View style={styles.heroMiniCard}>
                    <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(254,226,226,0.95)' }]}>
                      <ArrowDownRight size={14} color={theme.error} />
                    </View>
                    <Text style={styles.heroMiniLabel}>הוצאות</Text>
                    <Text style={styles.heroMiniValue}>{formatCurrency(totalExpenses)}</Text>
                  </View>
                </View>

                {expenseToIncomePct !== null ? (
                  <View style={styles.heroRatioBlock} accessibilityLabel={`הוצאות מהוות ${expenseToIncomePct} אחוז מההכנסות`}>
                    <View style={styles.heroRatioHead}>
                      <Text style={styles.heroRatioCaption}>הוצאות ביחס להכנסות</Text>
                      <Text style={styles.heroRatioPct}>{expenseToIncomePct}%</Text>
                    </View>
                    <View style={styles.heroRatioTrack}>
                      <View style={[styles.heroRatioFill, { width: `${expenseToIncomePct}%` }]} />
                    </View>
                  </View>
                ) : null}
              </View>
              {reportRefreshing ? (
                <View
                  style={styles.heroLoadingOverlay}
                  pointerEvents="auto"
                  accessibilityLabel="טוען נתוני חודש"
                  accessibilityRole="progressbar"
                >
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.heroLoadingText}>טוען…</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Green Invoice (חשבונית ירוקה) ── */}
          <View
            style={[
              styles.greenInvoiceCard,
              {
                backgroundColor: theme.surface,
                borderColor: `${greenInvoiceAccent}33`,
              },
            ]}
          >
            <View style={styles.greenInvoiceCardTop}>
              <View style={[styles.greenInvoiceIconWrap, { backgroundColor: `${greenInvoiceAccent}18` }]}>
                <Receipt size={22} color={greenInvoiceAccent} />
              </View>
              <View style={styles.greenInvoiceTextBlock}>
                <Text style={[styles.greenInvoiceTitle, { color: theme.text }]}>
                  {t('finance.greenInvoice.modalTitle')}
                </Text>
                <Text style={[styles.greenInvoiceStatus, { color: giConnected ? greenInvoiceAccent : theme.textSecondary }]}>
                  {giConnected ? t('finance.greenInvoice.connected') : t('finance.greenInvoice.notConnected')}
                </Text>
              </View>
            </View>
            <Text style={[styles.greenInvoiceHint, { color: theme.textSecondary }]}>
              {t('finance.greenInvoice.helpHint')}
            </Text>
            <TouchableOpacity
              style={[styles.greenInvoiceBtn, { backgroundColor: greenInvoiceAccent }]}
              onPress={openGreenInvoiceModal}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('finance.greenInvoice.connectButton')}
            >
              <Text style={styles.greenInvoiceBtnText}>
                {giConnected ? t('finance.greenInvoice.modalTitle') : t('finance.greenInvoice.connectButton')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Income Breakdown ── */}
          <View style={[styles.card, styles.cardAfterHero, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
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
                      <Text style={[styles.incomeServiceTotal, { color: theme.success }]}>
                        {formatCurrency(item.total)}
                      </Text>
                      <Text style={styles.incomeServiceSub}>
                        {item.count} תורים × {formatCurrency(item.price)}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={styles.incomeTotalRow}>
                  <Text style={[styles.totalLabel, { color: theme.text }]}>סך הכל הכנסות</Text>
                  <Text style={[styles.totalAmount, { color: theme.success }]}>
                    {formatCurrency(totalIncome)}
                  </Text>
                </View>
                <Text style={styles.priceNote}>* ההכנסות מחושבות לפי המחיר הנוכחי של השירות</Text>
              </>
            )}
          </View>

          {/* ── Expenses ── */}
          <View style={styles.expensesToolbar}>
            <TouchableOpacity
              style={[styles.addExpenseBtn, { backgroundColor: primaryColor }]}
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="הוסף הוצאה חדשה"
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.addExpenseBtnText}>הוסף הוצאה</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
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
                        <Text style={[styles.expenseAmount, { color: theme.error }]}>
                          -{formatCurrency(Number(expense.amount))}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteExpense(expense)}
                          style={styles.deleteBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`מחק הוצאה ${expense.description || (CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other).label}`}
                        >
                          <Trash2 size={17} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.rowDivider} />
                <View style={[styles.expenseRow, styles.totalRow]}>
                  <Text style={[styles.totalLabel, { color: theme.text }]}>סך הכל הוצאות</Text>
                  <Text style={[styles.totalAmount, { color: theme.error }]}>
                    {formatCurrency(totalExpenses)}
                  </Text>
                </View>
              </>
            )}
          </View>

          <View style={{ height: 110 }} />
      </AnimatedKeyboardAwareScrollView>

      {/* ── Add Expense Modal ── */}
      <Modal visible={showAddExpense} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAwareScreenScroll
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          >
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />

            {/* Modal header — in RTL: title on RIGHT, close on LEFT */}
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>הוספת הוצאה</Text>
              <TouchableOpacity onPress={() => { setShowAddExpense(false); setNewExpenseReceipt(null); }} style={styles.modalCloseBtn}>
                <X size={22} color={theme.textSecondary} />
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

      <GreenInvoiceConnectModal
        visible={showGreenInvoiceModal}
        onClose={() => setShowGreenInvoiceModal(false)}
        connected={giConnected}
        storedKeyId={giKeyIdStored}
        accentColor={greenInvoiceAccent}
        theme={{
          surface: theme.surface,
          text: theme.text,
          textSecondary: theme.textSecondary,
          border: theme.border,
          error: theme.error,
        }}
        saving={giSaving}
        onSubmitCredentials={handleGreenInvoiceSubmitCredentials}
        onDisconnect={handleGreenInvoiceDisconnect}
      />
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

  financeHeaderFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },

  // ── Top bar (single block with safe inset — no shadow, avoids seam under status bar) ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
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
  topBarTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
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
    overflow: 'hidden',
    position: 'relative',
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
  heroCardInner: {
    padding: 24,
  },
  heroLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  heroLoadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroRatioBlock: {
    marginTop: 18,
    width: '100%',
  },
  heroRatioHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroRatioCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'right',
    flex: 1,
    writingDirection: 'rtl',
  },
  heroRatioPct: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroRatioTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  heroRatioFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
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

  cardAfterHero: {
    marginTop: 12,
  },

  greenInvoiceCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    direction: 'rtl',
    ...cardShadow,
  },
  greenInvoiceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  greenInvoiceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greenInvoiceTextBlock: {
    flex: 1,
  },
  greenInvoiceTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  greenInvoiceStatus: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'right',
  },
  greenInvoiceHint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'right',
    marginBottom: 14,
  },
  greenInvoiceBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  greenInvoiceBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  expensesToolbar: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'flex-start',
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

  // ── Card (outlined surface — readable on busy backgrounds) ──
  card: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
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
});
