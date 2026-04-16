import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  type TextInputProps,
  Modal,
  ActivityIndicator,
  Image,
  Linking,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Rect,
  Path,
  Text as SvgText,
  Line,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
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
import {
  financeApi,
  type WeekIncomeSlice,
  type CompletedAppointmentIncomeRow,
  type ServiceIncomeBreakdown,
} from '@/lib/api/finance';
import type { BusinessExpense, ExpenseCategory } from '@/lib/supabase';
import { useAdminFinanceMonthReport } from '@/hooks/useAdminFinanceMonthReport';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  X,
  ArrowUpRight,
  ArrowDownRight,
  FileImage,
  CalendarDays,
  Star,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
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

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Colour wheel for chart segments */
const CHART_COLORS = [
  '#6366F1', '#10B981', '#F59E0B', '#EC4899',
  '#3B82F6', '#8B5CF6', '#F97316', '#06B6D4',
];

const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(KeyboardAwareScrollView);

const FINANCE_HEADER_HIDE = { duration: 260, easing: Easing.in(Easing.cubic) } as const;
const FINANCE_HEADER_SHOW = { duration: 300, easing: Easing.out(Easing.cubic) } as const;
const FINANCE_SCROLL_DOWN_THRESHOLD = 6;
const FINANCE_SCROLL_UP_THRESHOLD = 6;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
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

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const dow = DAY_NAMES_HE[date.getDay()] ?? '';
  const monthName = MONTH_NAMES_HE[(m || 1) - 1] ?? '';
  return `${dow}, ${d} ב${monthName}`;
}

/** Build a smooth cubic-bezier SVG path through points */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${mx} ${pts[i - 1].y} ${mx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────
// SVG COMPONENTS
// ─────────────────────────────────────────────────────────────

/** Donut (ring) chart for income-by-service breakdown */
function IncomeDonut({
  breakdown,
  totalIncome,
  fmtCurrency,
}: {
  breakdown: ServiceIncomeBreakdown[];
  totalIncome: number;
  fmtCurrency: (n: number) => string;
}) {
  const SIZE = 148;
  const STROKE = 23;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * r;
  const GAP = C / 100; // ~3.6° gap between segments

  if (totalIncome === 0 || breakdown.length === 0) return null;

  let cum = 0;
  const segments = breakdown.map((item, i) => {
    const pct = item.total / totalIncome;
    const dashLen = Math.max(0, pct * C - GAP);
    const dashOffset = C * (1 - cum);
    cum += pct;
    return { color: CHART_COLORS[i % CHART_COLORS.length], dashLen, dashOffset };
  });

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        {/* Background track */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF0F5" strokeWidth={STROKE} />
        {/* Coloured segments */}
        {segments.map((seg, i) => (
          <Circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={`${seg.dashLen} ${C}`}
            strokeDashoffset={seg.dashOffset}
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
        ))}
      </Svg>
      {/* Centre label */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Text style={donutStyles.centreValue} numberOfLines={1}>{fmtCurrency(totalIncome)}</Text>
        <Text style={donutStyles.centreLabel}>הכנסות</Text>
      </View>
    </View>
  );
}
const donutStyles = StyleSheet.create({
  centreValue: { fontSize: 13, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  centreLabel: { fontSize: 9, color: Colors.subtext, textAlign: 'center', marginTop: 1 },
});

/** Daily-income area / line sparkline for the current month */
function DailySparkline({
  dailyTotals,
  primaryColor,
  chartWidth,
}: {
  dailyTotals: number[];
  primaryColor: string;
  chartWidth: number;
}) {
  const H = 100;
  const padTop = 22;
  const padBottom = 18;
  const n = dailyTotals.length;

  if (n < 2 || chartWidth < 10) return null;

  const maxVal = Math.max(...dailyTotals, 1);
  const hasData = dailyTotals.some((v) => v > 0);
  if (!hasData) return null;

  const pts = dailyTotals.map((v, i) => ({
    x: n > 1 ? (i / (n - 1)) * chartWidth : 0,
    y: padTop + (1 - v / maxVal) * (H - padTop - padBottom),
  }));

  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x} ${H - padBottom} L ${pts[0].x} ${H - padBottom} Z`;
  const peakIdx = dailyTotals.indexOf(maxVal);

  // Sample day labels: 1st, ~mid, last
  const labelDays = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Svg width={chartWidth} height={H}>
      <Defs>
        <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={primaryColor} stopOpacity="0.28" />
          <Stop offset="1" stopColor={primaryColor} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>

      {/* Baseline */}
      <Line
        x1={0} y1={H - padBottom}
        x2={chartWidth} y2={H - padBottom}
        stroke="#E5E7EB"
        strokeWidth={1}
      />

      {/* Area fill */}
      <Path d={area} fill="url(#areaGrad)" />

      {/* Line */}
      <Path d={line} fill="none" stroke={primaryColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Peak pulse */}
      {dailyTotals[peakIdx] > 0 && (
        <>
          <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={9} fill={primaryColor} opacity={0.12} />
          <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={4.5} fill={primaryColor} />
          <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={2.2} fill="#fff" />
        </>
      )}

      {/* Day labels */}
      {labelDays.map((di) => (
        <SvgText
          key={di}
          x={pts[di].x}
          y={H - 3}
          textAnchor="middle"
          fontSize={9}
          fill="#9CA3AF"
        >
          {di + 1}
        </SvgText>
      ))}
    </Svg>
  );
}

/** Vertical SVG bar chart for weekly income */
function WeeklyBarChart({
  weekSlices,
  primaryColor,
  textColor,
  chartWidth,
}: {
  weekSlices: WeekIncomeSlice[];
  primaryColor: string;
  textColor: string;
  chartWidth: number;
}) {
  const CHART_H = 136;
  /** Extra vertical room so date range + "N תורים" baselines never overlap (SVG y = text baseline). */
  const LABEL_AREA = 62;
  const TOTAL_H = CHART_H + LABEL_AREA;
  const MAX_BAR_H = CHART_H - 28;
  const Y_RANGE = CHART_H + 13;
  const Y_APPTS = CHART_H + 30;
  const n = weekSlices.length;

  if (n === 0 || chartWidth < 10) return null;

  const maxVal = Math.max(...weekSlices.map((w) => w.total), 1);
  const bestIdx = weekSlices.reduce(
    (best, w, i) => (w.total > weekSlices[best].total ? i : best),
    0,
  );

  const BAR_W = Math.max(26, Math.floor((chartWidth - 16) / n) - 15);
  const BAR_STEP = (chartWidth - 16) / n;

  return (
    <Svg width={chartWidth} height={TOTAL_H}>
      <Defs>
        <SvgLinearGradient id="wBar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={primaryColor} stopOpacity="0.95" />
          <Stop offset="1" stopColor={primaryColor} stopOpacity="0.5" />
        </SvgLinearGradient>
        <SvgLinearGradient id="wBarBest" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity="1" />
          <Stop offset="1" stopColor="#D97706" stopOpacity="0.8" />
        </SvgLinearGradient>
      </Defs>

      {/* Grid lines */}
      {[0.5, 1].map((pct) => (
        <Line
          key={pct}
          x1={0} y1={CHART_H - MAX_BAR_H * pct}
          x2={chartWidth} y2={CHART_H - MAX_BAR_H * pct}
          stroke="#F0F2F7"
          strokeWidth={1}
          strokeDasharray="4 6"
        />
      ))}

      {weekSlices.map((w, i) => {
        const isBest = i === bestIdx;
        const barH = w.total > 0 ? Math.max(6, (w.total / maxVal) * MAX_BAR_H) : 3;
        const x = 8 + i * BAR_STEP + (BAR_STEP - BAR_W) / 2;
        const y = CHART_H - barH;

        // Compact amount label
        const amtLabel =
          w.total >= 10000
            ? `₪${(w.total / 1000).toFixed(0)}k`
            : w.total >= 1000
            ? `₪${(w.total / 1000).toFixed(1)}k`
            : w.total > 0
            ? `₪${Math.round(w.total)}`
            : '';

        // Short week range: "1–7" from label like "1–7 באפריל"
        const shortRange = w.label.split(' ב')[0] ?? `ש${i + 1}`;

        return (
          <G key={i}>
            {/* Bar shadow (android-style bottom tint) */}
            <Rect
              x={x + 2} y={y + 4}
              width={BAR_W} height={barH}
              rx={8}
              fill={isBest ? '#D97706' : primaryColor}
              opacity={0.15}
            />
            {/* Bar body */}
            <Rect
              x={x} y={y}
              width={BAR_W} height={barH}
              rx={8}
              fill={isBest ? 'url(#wBarBest)' : 'url(#wBar)'}
              opacity={isBest ? 1 : 0.45 + (w.total / maxVal) * 0.55}
            />

            {/* Amount above bar */}
            {amtLabel.length > 0 && (
              <SvgText
                x={x + BAR_W / 2}
                y={Math.max(11, y - 7)}
                textAnchor="middle"
                fontSize={10}
                fontWeight="700"
                fill={isBest ? '#B45309' : primaryColor}
              >
                {amtLabel}
              </SvgText>
            )}

            {/* Range label — first line below bars */}
            <SvgText
              x={x + BAR_W / 2}
              y={Y_RANGE}
              textAnchor="middle"
              fontSize={10}
              fontWeight="700"
              fill={isBest ? '#D97706' : textColor}
              opacity={isBest ? 1 : 0.72}
            >
              {shortRange}
            </SvgText>

            {/* Appointment count — second line, clear gap from range */}
            <SvgText
              x={x + BAR_W / 2}
              y={Y_APPTS}
              textAnchor="middle"
              fontSize={9}
              fill="#9CA3AF"
            >
              {`${w.appointmentCount} תורים`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────
// RTL TEXT WRAPPERS
// ─────────────────────────────────────────────────────────────
function RtlText({ style, ...props }: React.ComponentProps<typeof Text>) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || '').toLowerCase();
  const isRTL = (typeof i18n.dir === 'function' ? i18n.dir() : 'rtl') === 'rtl' || lang.startsWith('he');
  return <Text {...props} style={[isRTL ? styles.rtlText : styles.ltrText, style]} />;
}

function RtlTextInput({ style, ...props }: TextInputProps) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || '').toLowerCase();
  const isRTL = (typeof i18n.dir === 'function' ? i18n.dir() : 'rtl') === 'rtl' || lang.startsWith('he');
  return <TextInput {...props} style={[isRTL ? styles.rtlText : styles.ltrText, style]} />;
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors: theme } = useBusinessColors();
  const primaryColor = theme.primary || '#000000';

  // Chart width = screen − horizontal margins (16*2) − card padding (16*2)
  const chartWidth = Math.max(0, screenWidth - 64);

  const {
    year, month, loading, reportRefreshing,
    totalIncome, totalExpenses, incomeBreakdown, expenses,
    loadReport, goToPreviousMonth, goToNextMonth,
  } = useAdminFinanceMonthReport();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<ExpenseCategory>('other');
  const [newExpenseReceipt, setNewExpenseReceipt] = useState<{ uri: string; base64?: string } | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  const [weekSlices, setWeekSlices] = useState<WeekIncomeSlice[]>([]);
  const [monthAppointments, setMonthAppointments] = useState<CompletedAppointmentIncomeRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [showAllExpenseDays, setShowAllExpenseDays] = useState(false);

  const [heroLavaLayout, setHeroLavaLayout] = useState<{ w: number; h: number } | null>(null);
  const onHeroLavaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setHeroLavaLayout((prev) =>
      prev?.w === width && prev?.h === height ? prev : { w: width, h: height },
    );
  }, []);

  const insetsTopSV = useSharedValue(insets.top);
  useEffect(() => { insetsTopSV.value = insets.top; }, [insets.top, insetsTopSV]);

  const measuredFinanceHeaderHeight = useSharedValue(insets.top + 80);
  const financeHeaderOffsetY = useSharedValue(0);
  const financeLastScrollY = useSharedValue(0);

  const financeScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - financeLastScrollY.value;
      financeLastScrollY.value = y;
      const h = measuredFinanceHeaderHeight.value;
      if (y <= 4) { financeHeaderOffsetY.value = withTiming(0, FINANCE_HEADER_SHOW); return; }
      if (dy > FINANCE_SCROLL_DOWN_THRESHOLD) financeHeaderOffsetY.value = withTiming(-h, FINANCE_HEADER_HIDE);
      else if (dy < -FINANCE_SCROLL_UP_THRESHOLD) financeHeaderOffsetY.value = withTiming(0, FINANCE_HEADER_SHOW);
    },
  });

  const financeHeaderSlideStyle = useAnimatedStyle(() => {
    const h = Math.max(1, measuredFinanceHeaderHeight.value);
    const t = financeHeaderOffsetY.value;
    const opacity = interpolate(t, [-h, 0], [0, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY: t }] };
  });

  const financeScrollTopSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(insetsTopSV.value, measuredFinanceHeaderHeight.value + financeHeaderOffsetY.value),
  }));

  const onFinanceHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => { measuredFinanceHeaderHeight.value = e.nativeEvent.layout.height; },
    [measuredFinanceHeaderHeight],
  );

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    void (async () => {
      try {
        const [w, a] = await Promise.all([
          financeApi.getWeeklyIncomeSlices(year, month),
          financeApi.listCompletedAppointmentsForMonth(year, month),
        ]);
        if (!cancelled) { setWeekSlices(w); setMonthAppointments(a); }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, year, month]);

  useFocusEffect(
    useCallback(() => {
      try { setStatusBarStyle('dark', true); setStatusBarBackgroundColor(theme.surface, true); } catch { }
      return () => {
        try { setStatusBarBackgroundColor('transparent', true); } catch { }
        financeHeaderOffsetY.value = 0;
        financeLastScrollY.value = 0;
      };
    }, [theme.surface, financeHeaderOffsetY, financeLastScrollY]),
  );

  const netProfit = totalIncome - totalExpenses;
  const expenseToIncomePct =
    totalIncome > 0 ? Math.min(100, Math.round((totalExpenses / totalIncome) * 100)) : null;

  const formatCurrency = (amount: number) =>
    `₪${Math.round(amount).toLocaleString('he-IL')}`;

  // ── Derived analytics ──
  const quickStats = useMemo(() => {
    const totalAppts = monthAppointments.length;
    const avgPrice = totalAppts > 0 ? Math.round(totalIncome / totalAppts) : 0;
    const maxWeekTotal = weekSlices.length > 0 ? Math.max(...weekSlices.map((w) => w.total)) : 0;
    const bestWeek = weekSlices.find((w) => w.total === maxWeekTotal) ?? null;
    const weekAvg = weekSlices.length > 0
      ? Math.round(
          weekSlices.reduce((s, w) => s + w.total, 0) /
          Math.max(1, weekSlices.filter((w) => w.total > 0).length),
        )
      : 0;
    return { totalAppts, avgPrice, bestWeek, maxWeekTotal, weekAvg };
  }, [monthAppointments, totalIncome, weekSlices]);

  /** Daily totals array: index 0 = day 1 */
  const dailyTotals = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const map = new Map<number, number>();
    for (const appt of monthAppointments) {
      const d = parseInt(appt.slot_date.split('-')[2] ?? '0', 10);
      if (d > 0) map.set(d, (map.get(d) ?? 0) + appt.price);
    }
    return Array.from({ length: daysInMonth }, (_, i) => map.get(i + 1) ?? 0);
  }, [monthAppointments, year, month]);

  /** Appointments grouped by date, newest first */
  const appointmentsByDate = useMemo(() => {
    const groups = new Map<string, CompletedAppointmentIncomeRow[]>();
    for (const appt of monthAppointments) {
      const ex = groups.get(appt.slot_date);
      if (ex) ex.push(appt);
      else groups.set(appt.slot_date, [appt]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [monthAppointments]);

  const APPT_GROUPS_INITIAL = 3;
  const visibleDateGroups = showAllAppointments
    ? appointmentsByDate
    : appointmentsByDate.slice(0, APPT_GROUPS_INITIAL);

  /** Expenses grouped by expense_date, newest day first */
  const expensesByDate = useMemo(() => {
    const groups = new Map<string, BusinessExpense[]>();
    for (const ex of expenses) {
      const cur = groups.get(ex.expense_date);
      if (cur) cur.push(ex);
      else groups.set(ex.expense_date, [ex]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [expenses]);

  const EXPENSE_GROUPS_INITIAL = 3;
  const visibleExpenseDateGroups = showAllExpenseDays
    ? expensesByDate
    : expensesByDate.slice(0, EXPENSE_GROUPS_INITIAL);

  // ── Expense handlers ──
  const pickReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', allowsMultipleSelection: false, quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setNewExpenseReceipt({ uri: a.uri, base64: a.base64 ?? undefined });
    }
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(newExpenseAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { Alert.alert('שגיאה', 'יש להזין סכום תקין'); return; }
    setSavingExpense(true);
    try {
      let receiptUrl: string | null = null;
      if (newExpenseReceipt) {
        receiptUrl = await expensesApi.uploadReceipt({ uri: newExpenseReceipt.uri, base64: newExpenseReceipt.base64 });
      }
      const today = new Date();
      const expenseDate = `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const result = await expensesApi.createExpense({
        amount, description: newExpenseDescription.trim() || undefined,
        category: newExpenseCategory, expense_date: expenseDate, receipt_url: receiptUrl || undefined,
      });
      if (result) {
        setNewExpenseAmount(''); setNewExpenseDescription('');
        setNewExpenseCategory('other'); setNewExpenseReceipt(null);
        setShowAddExpense(false); loadReport();
      } else {
        Alert.alert('שגיאה', 'לא ניתן להוסיף את ההוצאה, נסה שנית');
      }
    } finally { setSavingExpense(false); }
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
            else Alert.alert('שגיאה', 'לא ניתן למחוק');
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.rtlRoot}>
        <StatusBar style="dark" backgroundColor={theme.surface} />
        <View style={{ paddingTop: insets.top, backgroundColor: theme.surface }} />
        <View style={[styles.loadingWrap, { flex: 1 }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <RtlText style={[styles.loadingText, { color: theme.textSecondary }]}>טוען נתונים פיננסיים...</RtlText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rtlRoot}>
      <StatusBar style="dark" backgroundColor={theme.surface} />

      {/* ── Sticky header ── */}
      <Animated.View style={[styles.financeHeaderFixed, financeHeaderSlideStyle]} onLayout={onFinanceHeaderLayout}>
        <View style={[styles.topBar, { paddingTop: insets.top + 14, backgroundColor: theme.surface, borderBottomColor: `${theme.border}18` }]}>
          <View style={styles.topBarTitleBlock}>
            <RtlText style={[styles.topBarTitle, { color: theme.text }]}>מעקב פיננסי</RtlText>
            <RtlText style={[styles.topBarSubtitle, { color: theme.textSecondary }]}>
              {MONTH_NAMES_HE[month - 1]} {year}
            </RtlText>
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

        {/* ── Hero Card ── */}
        <View style={styles.heroWrapper}>
          <View style={styles.heroCard} onLayout={onHeroLavaLayout}>
            <LinearGradient
              colors={[lightenHex(primaryColor, 0.1), darkenHex(primaryColor, 0.42)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {Platform.OS !== 'web' && heroLavaLayout && heroLavaLayout.w > 0 && heroLavaLayout.h > 0 ? (
              <BrandLavaLampBackground
                primaryColor={primaryColor}
                baseColor={darkenHex(primaryColor, 0.42)}
                layoutWidth={heroLavaLayout.w}
                layoutHeight={heroLavaLayout.h}
                count={4} duration={16000} blurIntensity={40}
              />
            ) : null}
            <View style={styles.heroCardInner}>
              {/* Month navigator */}
              <View style={styles.monthRow}>
                <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrowBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={reportRefreshing}>
                  <ChevronRight size={22} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
                <View style={styles.monthCenter}>
                  <RtlText style={styles.monthNameHe}>{MONTH_NAMES_HE[month - 1]}</RtlText>
                  <RtlText style={styles.monthYearHe}>{year}</RtlText>
                </View>
                <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrowBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={reportRefreshing}>
                  <ChevronLeft size={22} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              </View>

              <RtlText style={styles.heroNetLabel}>רווח נקי</RtlText>
              <View style={styles.heroNetAmountRow}>
                <Text style={[styles.heroNetAmountPart, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>
                  {netProfit >= 0 ? '+' : '−'}
                </Text>
                <Text style={[styles.heroNetAmountPart, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>
                  {Math.abs(Math.round(netProfit)).toLocaleString('he-IL')}
                </Text>
                <Text style={[styles.heroNetAmountPart, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>₪</Text>
              </View>

              <View style={styles.heroMiniRow}>
                <View style={styles.heroMiniCard}>
                  <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(220,252,231,0.95)' }]}>
                    <ArrowUpRight size={14} color={theme.success} />
                  </View>
                  <RtlText style={styles.heroMiniLabel}>הכנסות</RtlText>
                  <RtlText style={styles.heroMiniValue}>{formatCurrency(totalIncome)}</RtlText>
                </View>
                <View style={styles.heroMiniDivider} />
                <View style={styles.heroMiniCard}>
                  <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(254,226,226,0.95)' }]}>
                    <ArrowDownRight size={14} color={theme.error} />
                  </View>
                  <RtlText style={styles.heroMiniLabel}>הוצאות</RtlText>
                  <RtlText style={styles.heroMiniValue}>{formatCurrency(totalExpenses)}</RtlText>
                </View>
              </View>

              {expenseToIncomePct !== null ? (
                <View style={styles.heroRatioBlock}>
                  <View style={styles.heroRatioHead}>
                    <RtlText style={styles.heroRatioCaption}>הוצאות ביחס להכנסות</RtlText>
                    <RtlText style={styles.heroRatioPct}>{expenseToIncomePct}%</RtlText>
                  </View>
                  <View style={styles.heroRatioTrack}>
                    <View style={[styles.heroRatioFill, { width: `${expenseToIncomePct}%` }]} />
                  </View>
                </View>
              ) : null}
            </View>
            {reportRefreshing ? (
              <View style={styles.heroLoadingOverlay} pointerEvents="auto">
                <ActivityIndicator size="large" color="#FFFFFF" />
                <RtlText style={styles.heroLoadingText}>טוען…</RtlText>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── KPI Stats Strip ── */}
        {!analyticsLoading && quickStats.totalAppts > 0 && (
          <View style={styles.kpiStrip}>
            <View style={[styles.kpiCard, { backgroundColor: theme.surface, borderColor: `${theme.border}18` }]}>
              <View style={[styles.kpiIconWrap, { backgroundColor: `${primaryColor}14` }]}>
                <Users size={16} color={primaryColor} />
              </View>
              <RtlText style={[styles.kpiValue, { color: theme.text }]}>{quickStats.totalAppts}</RtlText>
              <RtlText style={[styles.kpiLabel, { color: theme.textSecondary }]}>תורים</RtlText>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: theme.surface, borderColor: `${theme.border}18` }]}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#F0FDF4' }]}>
                <TrendingUp size={16} color="#16A34A" />
              </View>
              <RtlText style={[styles.kpiValue, { color: theme.text }]}>{formatCurrency(quickStats.avgPrice)}</RtlText>
              <RtlText style={[styles.kpiLabel, { color: theme.textSecondary }]}>ממוצע לתור</RtlText>
            </View>
            {quickStats.bestWeek && quickStats.bestWeek.total > 0 && (
              <View style={[styles.kpiCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Star size={16} color="#D97706" fill="#D97706" />
                </View>
                <RtlText style={[styles.kpiValue, { color: '#92400E' }]} numberOfLines={1}>
                  {formatCurrency(quickStats.bestWeek.total)}
                </RtlText>
                <RtlText style={[styles.kpiLabel, { color: '#B45309' }]}>שבוע מוביל</RtlText>
              </View>
            )}
          </View>
        )}

        {/* ── Daily trend sparkline ── */}
        {!analyticsLoading && dailyTotals.some((v) => v > 0) && (
          <>
            <View style={styles.sectionHeading}>
              <RtlText style={[styles.sectionHeadingTitle, { color: theme.textSecondary }]}>מגמת הכנסות יומית</RtlText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14`, paddingVertical: 16, paddingHorizontal: 16 }]}>
              <DailySparkline dailyTotals={dailyTotals} primaryColor={primaryColor} chartWidth={chartWidth - 0} />
              <View style={[styles.sparklineLegend, { borderTopColor: `${theme.border}20` }]}>
                <RtlText style={[styles.sparklineLegendText, { color: theme.textSecondary }]}>
                  יום 1 · · · · · · · · · · · · · · · יום {dailyTotals.length}
                </RtlText>
              </View>
            </View>
          </>
        )}

        {/* ── Income Breakdown (Donut + Legend) ── */}
        <View style={styles.sectionHeading}>
          <RtlText style={[styles.sectionHeadingTitle, { color: theme.textSecondary }]}>פירוט הכנסות לפי שירות</RtlText>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
          {incomeBreakdown.length === 0 ? (
            <View style={styles.emptyState}>
              <TrendingUp size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין הכנסות החודש</RtlText>
              <RtlText style={styles.emptySubtitle}>תורים שהושלמו יופיעו כאן</RtlText>
            </View>
          ) : (
            <>
              {/* Donut + legend row */}
              <View style={styles.donutRow}>
                <IncomeDonut breakdown={incomeBreakdown} totalIncome={totalIncome} fmtCurrency={formatCurrency} />
                <View style={styles.donutLegend}>
                  {incomeBreakdown.map((item, i) => {
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    const pct = totalIncome > 0 ? Math.round((item.total / totalIncome) * 100) : 0;
                    const isLast = i === incomeBreakdown.length - 1;
                    return (
                      <View
                        key={item.service_id || item.service_name}
                        style={[
                          styles.legendItem,
                          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF0F5' },
                        ]}
                      >
                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                        <View style={styles.legendBody}>
                          <RtlText style={[styles.legendName, { color: theme.text }]} numberOfLines={2}>
                            {item.service_name}
                          </RtlText>
                          <View style={styles.legendMeta}>
                            <RtlText style={[styles.legendAmt, { color: theme.success }]}>{formatCurrency(item.total)}</RtlText>
                            <View style={[styles.legendPct, { backgroundColor: `${color}18` }]}>
                              <Text style={[styles.legendPctText, { color }]}>{pct}%</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.incomeTotalRow, { borderTopColor: `${theme.border}20` }]}>
                <RtlText style={[styles.totalLabel, { color: theme.text }]}>סך הכל הכנסות</RtlText>
                <RtlText style={[styles.totalAmount, { color: theme.success }]}>{formatCurrency(totalIncome)}</RtlText>
              </View>
            </>
          )}
        </View>

        {/* ── Weekly SVG Bar Chart ── */}
        <View style={styles.sectionHeading}>
          <RtlText style={[styles.sectionHeadingTitle, { color: theme.textSecondary }]}>ניתוח שבועי</RtlText>
        </View>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: `${theme.border}14`,
              paddingHorizontal: 12,
              paddingTop: 16,
              paddingBottom: 28,
              marginBottom: 14,
            },
          ]}
        >
          {analyticsLoading ? (
            <ActivityIndicator style={{ marginVertical: 30 }} color={primaryColor} />
          ) : weekSlices.length === 0 ? (
            <View style={styles.emptyState}>
              <CalendarDays size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין נתונים לחודש זה</RtlText>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <WeeklyBarChart
                weekSlices={weekSlices}
                primaryColor={primaryColor}
                textColor={theme.text}
                chartWidth={chartWidth + 4}
              />
            </View>
          )}
        </View>

        {/* ── Appointments by date ── */}
        <View style={styles.sectionHeading}>
          <RtlText style={[styles.sectionHeadingTitle, { color: theme.textSecondary }]}>תורים החודש</RtlText>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
          {analyticsLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={primaryColor} />
          ) : appointmentsByDate.length === 0 ? (
            <View style={styles.emptyState}>
              <CalendarDays size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין תורים בחודש זה</RtlText>
              <RtlText style={styles.emptySubtitle}>תורים שהושלמו יופיעו כאן</RtlText>
            </View>
          ) : (
            <>
              {visibleDateGroups.map(([date, appts], groupIdx) => {
                const dayTotal = appts.reduce((s, a) => s + a.price, 0);
                const isLast = groupIdx === visibleDateGroups.length - 1;
                return (
                  <View
                    key={date}
                    style={[
                      styles.apptDateGroup,
                      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${theme.border}22` },
                    ]}
                  >
                    <View style={styles.apptDateHeader}>
                      <View style={[styles.apptDayTotalPill, { backgroundColor: `${primaryColor}12` }]}>
                        <RtlText style={[styles.apptDayTotalText, { color: primaryColor }]}>
                          {formatCurrency(dayTotal)}
                        </RtlText>
                      </View>
                      <RtlText style={[styles.apptDateLabel, { color: theme.text }]}>
                        {formatDateLabel(date)}
                      </RtlText>
                    </View>

                    {appts.map((row, rowIdx) => {
                      const client = row.client_label.trim() || 'לקוח';
                      const initial = (client.trim().charAt(0) || '?').toUpperCase();
                      const isLastRow = rowIdx === appts.length - 1;
                      return (
                        <View
                          key={row.id}
                          style={[
                            styles.apptCompactRow,
                            !isLastRow && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${theme.border}12` },
                          ]}
                        >
                          <View style={[styles.apptCompactAvatar, { backgroundColor: `${primaryColor}18` }]}>
                            <Text style={[styles.apptCompactAvatarChar, { color: primaryColor }]}>{initial}</Text>
                          </View>
                          <View style={styles.apptCompactBody}>
                            <RtlText style={[styles.apptCompactName, { color: theme.text }]} numberOfLines={1}>{client}</RtlText>
                            <RtlText style={[styles.apptCompactMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                              {row.service_name} · {row.slot_time}
                            </RtlText>
                          </View>
                          <RtlText style={[styles.apptCompactPrice, { color: theme.success }]}>
                            {formatCurrency(row.price)}
                          </RtlText>
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              {appointmentsByDate.length > APPT_GROUPS_INITIAL && (
                <TouchableOpacity
                  style={[styles.showMoreBtn, { borderColor: `${primaryColor}28`, backgroundColor: `${primaryColor}07` }]}
                  onPress={() => setShowAllAppointments((p) => !p)}
                  activeOpacity={0.7}
                >
                  {showAllAppointments ? <ChevronUp size={16} color={primaryColor} /> : <ChevronDown size={16} color={primaryColor} />}
                  <RtlText style={[styles.showMoreBtnText, { color: primaryColor }]}>
                    {showAllAppointments ? 'הצג פחות' : `הצג את כל הימים (${appointmentsByDate.length})`}
                  </RtlText>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* ── Expenses (same section + card pattern as תורים החודש) ── */}
        <View style={styles.sectionHeading}>
          <RtlText style={[styles.sectionHeadingTitle, { color: theme.textSecondary }]}>הוצאות החודש</RtlText>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${theme.border}14` }]}>
          <View style={styles.financeCardToolbar}>
            <TouchableOpacity
              style={[styles.expenseSectionAddCircle, { backgroundColor: primaryColor }]}
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.82}
              accessibilityLabel="הוסף הוצאה"
            >
              <Plus size={17} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          {expenses.length === 0 ? (
            <View style={styles.emptyState}>
              <ArrowDownRight size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין הוצאות בחודש זה</RtlText>
              <RtlText style={styles.emptySubtitle}>הוצאות יופיעו כאן לפי תאריך · לחץ על + להוספה</RtlText>
            </View>
          ) : (
            <>
              {visibleExpenseDateGroups.map(([date, dayExpenses], groupIdx) => {
                const dayTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);
                const isLastGroup = groupIdx === visibleExpenseDateGroups.length - 1;
                return (
                  <View
                    key={date}
                    style={[
                      styles.apptDateGroup,
                      !isLastGroup && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${theme.border}22` },
                    ]}
                  >
                    <View style={styles.apptDateHeader}>
                      <View style={[styles.apptDayTotalPill, { backgroundColor: `${theme.error}12` }]}>
                        <RtlText style={[styles.apptDayTotalText, { color: theme.error }]}>
                          {formatCurrency(dayTotal)}
                        </RtlText>
                      </View>
                      <RtlText style={[styles.apptDateLabel, { color: theme.text }]}>
                        {formatDateLabel(date)}
                      </RtlText>
                    </View>

                    {dayExpenses.map((expense, rowIdx) => {
                      const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
                      const title = expense.description || cat.label;
                      const isLastRow = rowIdx === dayExpenses.length - 1;
                      return (
                        <View
                          key={expense.id}
                          style={[
                            styles.apptCompactRow,
                            !isLastRow && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${theme.border}12` },
                          ]}
                        >
                          <View style={styles.apptCompactBody}>
                            <RtlText style={[styles.apptCompactName, { color: theme.text }]} numberOfLines={1}>
                              {title}
                            </RtlText>
                            <RtlText style={[styles.apptCompactMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                              {cat.label}
                            </RtlText>
                          </View>
                          <View style={styles.expenseIconActions}>
                            {expense.receipt_url && (
                              <TouchableOpacity
                                onPress={() => Linking.openURL(expense.receipt_url!)}
                                activeOpacity={0.75}
                                style={[
                                  styles.expenseIconBtn,
                                  {
                                    backgroundColor: `${primaryColor}10`,
                                    borderColor: `${primaryColor}22`,
                                  },
                                ]}
                                accessibilityLabel="פתיחת קבלה"
                              >
                                <FileImage size={17} color={primaryColor} strokeWidth={2.1} />
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              onPress={() => handleDeleteExpense(expense)}
                              activeOpacity={0.75}
                              style={[
                                styles.expenseIconBtn,
                                {
                                  backgroundColor: `${theme.error}08`,
                                  borderColor: `${theme.error}22`,
                                },
                              ]}
                              accessibilityLabel="מחיקת הוצאה"
                            >
                              <Trash2 size={16} color={theme.error} strokeWidth={2.1} />
                            </TouchableOpacity>
                          </View>
                          <RtlText style={[styles.apptCompactPrice, { color: theme.error }]}>
                            {formatCurrency(Number(expense.amount))}
                          </RtlText>
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              {expensesByDate.length > EXPENSE_GROUPS_INITIAL && (
                <TouchableOpacity
                  style={[styles.showMoreBtn, { borderColor: `${primaryColor}28`, backgroundColor: `${primaryColor}07` }]}
                  onPress={() => setShowAllExpenseDays((p) => !p)}
                  activeOpacity={0.7}
                >
                  {showAllExpenseDays ? <ChevronUp size={16} color={primaryColor} /> : <ChevronDown size={16} color={primaryColor} />}
                  <RtlText style={[styles.showMoreBtnText, { color: primaryColor }]}>
                    {showAllExpenseDays ? 'הצג פחות' : `הצג את כל הימים (${expensesByDate.length})`}
                  </RtlText>
                </TouchableOpacity>
              )}

              <View style={[styles.incomeTotalRow, { borderTopColor: `${theme.border}20` }]}>
                <RtlText style={[styles.totalLabel, { color: theme.text }]}>סך הכל הוצאות</RtlText>
                <RtlText style={[styles.totalAmount, { color: theme.error }]}>{formatCurrency(totalExpenses)}</RtlText>
              </View>
            </>
          )}
        </View>

        <View style={{ height: Math.max(120, insets.bottom + 108) }} />
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
              <View style={styles.modalTopRow}>
                <RtlText style={[styles.modalTitle, { color: theme.text }]}>הוספת הוצאה</RtlText>
                <TouchableOpacity onPress={() => { setShowAddExpense(false); setNewExpenseReceipt(null); }} style={styles.modalCloseBtn}>
                  <X size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.amountBox}>
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
                <Text style={styles.amountCurrency}>₪</Text>
              </View>

              <RtlTextInput
                style={styles.descInput}
                value={newExpenseDescription}
                onChangeText={setNewExpenseDescription}
                placeholder="תיאור ההוצאה (אופציונלי)"
                placeholderTextColor="#9CA3AF"
                textAlign="right"
                returnKeyType="done"
              />

              <RtlText style={[styles.modalSectionLabel, { color: theme.text }]}>בחר קטגוריה</RtlText>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const cfg = CATEGORY_CONFIG[cat];
                  const selected = newExpenseCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setNewExpenseCategory(cat)}
                      activeOpacity={0.75}
                      style={[styles.categoryGridItem, { backgroundColor: selected ? cfg.color : cfg.bg, borderColor: selected ? cfg.color : 'transparent', borderWidth: selected ? 0 : 1.5 }]}
                    >
                      <RtlText style={[styles.categoryGridText, { color: selected ? '#fff' : cfg.color }]}>{cfg.label}</RtlText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <RtlText style={[styles.modalSectionLabel, { color: theme.text }]}>קבלה / אסמכתא (אופציונלי)</RtlText>
              {newExpenseReceipt ? (
                <View style={styles.receiptPreviewRow}>
                  <View style={styles.receiptThumbWrap}>
                    <Image source={{ uri: newExpenseReceipt.uri }} style={styles.receiptThumb} />
                    <TouchableOpacity style={styles.receiptRemoveBtn} onPress={() => setNewExpenseReceipt(null)}>
                      <X size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <RtlText style={[styles.receiptAddedText, { color: theme.textSecondary }]}>תמונה נוספה</RtlText>
                </View>
              ) : (
                <TouchableOpacity style={[styles.receiptAddBtn, { borderColor: primaryColor }]} onPress={pickReceipt} activeOpacity={0.7}>
                  <FileImage size={22} color={primaryColor} />
                  <RtlText style={[styles.receiptAddBtnText, { color: primaryColor }]}>הוסף תמונת קבלה</RtlText>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.modalAddBtn, { backgroundColor: primaryColor }]} onPress={handleAddExpense} disabled={savingExpense} activeOpacity={0.82}>
                {savingExpense ? <ActivityIndicator size="small" color="#fff" /> : <RtlText style={styles.modalAddBtnText}>הוסף הוצאה</RtlText>}
              </TouchableOpacity>
            </View>
          </KeyboardAwareScreenScroll>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const cardShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.055, shadowRadius: 12 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  rtlRoot: { flex: 1, direction: 'ltr', backgroundColor: '#F2F4F8' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr', alignSelf: 'stretch' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 16, textAlign: 'right' },

  financeHeaderFixed: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  topBarTitleBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  topBarSubtitle: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  topBarTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  scroll: { paddingTop: 0, direction: 'ltr' },

  // ── Hero ──
  heroWrapper: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  heroCard: {
    borderRadius: 28, overflow: 'hidden', position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 28 },
      android: { elevation: 14 },
    }),
  },
  heroCardInner: { padding: 24 },
  heroLoadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroLoadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  monthRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  monthArrowBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  monthCenter: { alignItems: 'center' },
  monthNameHe: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  monthYearHe: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 2 },
  heroNetLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'center', letterSpacing: 0.5, marginBottom: 4 },
  heroNetAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    marginBottom: 20,
  },
  heroNetAmountPart: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    writingDirection: 'ltr',
  },
  heroMiniRow: { flexDirection: 'row-reverse', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  heroMiniCard: { flex: 1, alignItems: 'center', gap: 4 },
  heroMiniDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
  heroMiniIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroMiniLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center' },
  heroMiniValue: { fontSize: 16, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  heroRatioBlock: { marginTop: 18, width: '100%' },
  heroRatioHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heroRatioCaption: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.78)', textAlign: 'right', flex: 1, writingDirection: 'rtl' },
  heroRatioPct: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  heroRatioTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  heroRatioFill: { height: '100%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.92)' },

  // ── KPI strip ──
  kpiStrip: { flexDirection: 'row-reverse', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 9 },
  kpiCard: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 9, alignItems: 'center', gap: 4, ...cardShadow },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  kpiValue: { fontSize: 14, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  kpiLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // ── Section headings (centered title) ──
  sectionHeading: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, alignItems: 'center' },
  sectionHeadingTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    alignSelf: 'stretch',
  },

  // ── Card ──
  card: { borderRadius: 22, borderWidth: 1, marginHorizontal: 16, marginBottom: 4, padding: 18, direction: 'ltr', ...cardShadow },

  // ── Sparkline ──
  sparklineLegend: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  sparklineLegendText: { fontSize: 10, textAlign: 'center' },

  // ── Donut + legend ──
  donutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  donutLegend: { flex: 1, gap: 0 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 2,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 3 },
  legendBody: { flex: 1, gap: 6 },
  legendName: { fontSize: 13, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  legendMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  legendAmt: { fontSize: 14, fontWeight: '800' },
  legendPct: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  legendPctText: { fontSize: 10, fontWeight: '700' },

  // ── Income totals ──
  incomeTotalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
  totalRow: { flexDirection: 'row-reverse', paddingTop: 14, paddingBottom: 2, justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, fontWeight: '700', textAlign: 'right' },
  totalAmount: { fontSize: 20, fontWeight: '900', textAlign: 'right' },

  // ── Appointments ──
  apptDateGroup: { paddingVertical: 12 },
  apptDateHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  apptDateLabel: { fontSize: 14, fontWeight: '800', textAlign: 'right', flex: 1 },
  apptDayTotalPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginLeft: 8 },
  apptDayTotalText: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  apptCompactRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, gap: 10 },
  apptCompactAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  apptCompactAvatarChar: { fontSize: 15, fontWeight: '900' },
  apptCompactBody: { flex: 1, minWidth: 0 },
  apptCompactName: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  apptCompactMeta: { fontSize: 12, marginTop: 2, textAlign: 'right' },
  apptCompactPrice: { fontSize: 14, fontWeight: '800', textAlign: 'left', minWidth: 56 },
  showMoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 12, marginTop: 6 },
  showMoreBtnText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },

  // ── Empty state ──
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#C4C9D4', textAlign: 'center' },

  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F2F7' },

  financeCardToolbar: { flexDirection: 'row-reverse', justifyContent: 'flex-start', marginBottom: 10, marginTop: -4 },
  expenseSectionAddCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  expenseIconActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  expenseIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, direction: 'ltr' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 },
  modalTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  modalCloseBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },
  amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F6FB', borderRadius: 20, paddingVertical: 12, marginBottom: 16 },
  amountCurrency: { fontSize: 36, fontWeight: '800', color: Colors.subtext, marginLeft: 8, writingDirection: 'ltr' },
  amountInput: { fontSize: 52, fontWeight: '900', color: Colors.text, minWidth: 100, textAlign: 'center', direction: 'ltr' },
  descInput: { height: 50, borderWidth: 1.5, borderColor: '#E8EAF0', borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: Colors.text, backgroundColor: '#FAFBFD', marginBottom: 20, textAlign: 'right' },
  modalSectionLabel: { fontSize: 14, fontWeight: '700', textAlign: 'right', marginBottom: 12 },
  categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 20, justifyContent: 'flex-end' },
  categoryGridItem: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  categoryGridText: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  receiptAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', marginBottom: 24 },
  receiptAddBtnText: { fontSize: 15, fontWeight: '700' },
  receiptPreviewRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 24 },
  receiptThumbWrap: { position: 'relative' },
  receiptThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F4F6FB' },
  receiptRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  receiptAddedText: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  modalAddBtn: {
    height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14 }, android: { elevation: 6 } }),
  },
  modalAddBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});
