import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  PanResponder,
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
// Animated SVG Path (Reanimated + react-native-svg)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedSvgPath = Animated.createAnimatedComponent(Path as any);
import * as ImagePicker from 'expo-image-picker';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  FadeInUp,
  FadeInRight,
  interpolate,
  interpolateColor,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
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
  const SIZE = 172;
  const STROKE = 26;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * r;
  const GAP = C / 90;

  if (totalIncome === 0 || breakdown.length === 0) return null;

  let cum = 0;
  const segments = breakdown.map((item, i) => {
    const pct = item.total / totalIncome;
    const dashLen = Math.max(0, pct * C - GAP);
    const dashOffset = C * (1 - cum);
    cum += pct;
    return { color: CHART_COLORS[i % CHART_COLORS.length], dashLen, dashOffset };
  });

  const displayAmt = totalIncome >= 10000
    ? `₪${(totalIncome / 1000).toFixed(0)}K`
    : fmtCurrency(totalIncome);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF0F5" strokeWidth={STROKE} />
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
        {/* Inner white fill circle for depth */}
        <Circle cx={cx} cy={cy} r={r - STROKE / 2 - 4} fill="#FFFFFF" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Text style={donutStyles.centreValue} numberOfLines={1}>{displayAmt}</Text>
        <Text style={donutStyles.centreLabel}>הכנסות</Text>
      </View>
    </View>
  );
}
const donutStyles = StyleSheet.create({
  centreValue: { fontSize: 14, fontWeight: '900', color: Colors.text, textAlign: 'center', letterSpacing: -0.5 },
  centreLabel: { fontSize: 10, color: Colors.subtext, textAlign: 'center', marginTop: 2, fontWeight: '600' },
});

/** Daily-income area / line sparkline for the current month — interactive with pan tooltip */
function DailySparkline({
  dailyTotals,
  primaryColor,
  chartWidth,
  trigger,
}: {
  dailyTotals: number[];
  primaryColor: string;
  chartWidth: number;
  trigger?: number;
}) {
  const H = 110;
  const padTop = 30;
  const padBottom = 18;
  const n = dailyTotals.length;
  const maxVal = Math.max(...dailyTotals, 1);
  const hasData = dailyTotals.some((v) => v > 0);

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draw animation
  const drawSv = useSharedValue(0);
  const PATH_EST = Math.max(chartWidth * 4, 1200); // generous upper bound

  useEffect(() => {
    drawSv.value = 0;
    drawSv.value = withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyTotals, chartWidth, trigger]);

  const lineAnimProps = useAnimatedProps(() => ({
    strokeDasharray: [PATH_EST],
    strokeDashoffset: interpolate(drawSv.value, [0, 1], [PATH_EST, 0]),
  }));

  const areaAnimProps = useAnimatedProps(() => ({
    opacity: interpolate(drawSv.value, [0, 0.65, 1], [0, 0, 0.25]),
  }));

  const INSET = 8; // horizontal margin so edge dots aren't clipped by SVG bounds
  const pts = useMemo(
    () =>
      dailyTotals.map((v, i) => ({
        x: INSET + (n > 1 ? (i / (n - 1)) * (chartWidth - INSET * 2) : 0),
        y: padTop + (1 - v / maxVal) * (H - padTop - padBottom),
      })),
    [dailyTotals, chartWidth, maxVal, n],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't capture the initial touch — let the parent ScrollView handle vertical scrolling
        onStartShouldSetPanResponder: () => false,
        // Only capture when the gesture is clearly horizontal (chart scrubbing, not scrolling)
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
        onPanResponderGrant: (e) => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          const rawIdx = Math.round((e.nativeEvent.locationX / chartWidth) * (n - 1));
          setActiveIdx(Math.max(0, Math.min(n - 1, rawIdx)));
        },
        onPanResponderMove: (e) => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          const rawIdx = Math.round((e.nativeEvent.locationX / chartWidth) * (n - 1));
          setActiveIdx(Math.max(0, Math.min(n - 1, rawIdx)));
        },
        onPanResponderRelease: () => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setActiveIdx(null), 1400);
        },
        onPanResponderTerminate: () => setActiveIdx(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartWidth, n],
  );

  if (n < 2 || chartWidth < 10 || !hasData) return null;

  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x} ${H - padBottom} L ${pts[0].x} ${H - padBottom} Z`;
  const peakIdx = dailyTotals.indexOf(maxVal);
  const labelDays = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  const activePt = activeIdx !== null ? pts[activeIdx] : null;
  const activeVal = activeIdx !== null ? dailyTotals[activeIdx] : null;

  const TOOLTIP_W = 88;
  const tooltipLeft = activePt
    ? Math.max(0, Math.min(chartWidth - TOOLTIP_W, activePt.x - TOOLTIP_W / 2))
    : 0;
  const tooltipTop = activePt ? Math.max(2, activePt.y - 52) : 0;

  return (
    <View style={{ position: 'relative' }} {...panResponder.panHandlers}>
      <Svg width={chartWidth} height={H} style={{ overflow: 'visible' }}>
        <Defs>
          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={primaryColor} stopOpacity="0.25" />
            <Stop offset="1" stopColor={primaryColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {/* Baseline */}
        <Line x1={0} y1={H - padBottom} x2={chartWidth} y2={H - padBottom} stroke="#E5E7EB" strokeWidth={1} />

        {/* Area fill — fades in after line draws */}
        <AnimatedSvgPath d={area} fill="url(#areaGrad)" animatedProps={areaAnimProps} />

        {/* Line — draws itself like a snake */}
        <AnimatedSvgPath
          d={line}
          fill="none"
          stroke={primaryColor}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          animatedProps={lineAnimProps}
        />

        {/* Active cursor */}
        {activePt && (
          <>
            <Line
              x1={activePt.x} y1={padTop - 10}
              x2={activePt.x} y2={H - padBottom}
              stroke={primaryColor}
              strokeWidth={1.5}
              strokeDasharray={[4, 3]}
              opacity={0.5}
            />
            <Circle cx={activePt.x} cy={activePt.y} r={11} fill={primaryColor} opacity={0.15} />
            <Circle cx={activePt.x} cy={activePt.y} r={5.5} fill={primaryColor} />
            <Circle cx={activePt.x} cy={activePt.y} r={2.5} fill="#fff" />
          </>
        )}

        {/* Peak pulse — only when idle */}
        {!activePt && dailyTotals[peakIdx] > 0 && (
          <>
            <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={9} fill={primaryColor} opacity={0.12} />
            <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={4.5} fill={primaryColor} />
            <Circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={2.2} fill="#fff" />
          </>
        )}

        {/* Day labels — anchor adjusted at edges so text doesn't overflow */}
        {labelDays.map((di) => (
          <SvgText
            key={di}
            x={pts[di].x}
            y={H - 3}
            textAnchor={di === 0 ? 'start' : di === n - 1 ? 'end' : 'middle'}
            fontSize={9}
            fill="#9CA3AF"
          >
            {di + 1}
          </SvgText>
        ))}
      </Svg>

      {/* Floating tooltip */}
      {activePt && activeVal !== null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: tooltipLeft,
            top: tooltipTop,
            width: TOOLTIP_W,
            backgroundColor: primaryColor,
            borderRadius: 12,
            paddingVertical: 7,
            paddingHorizontal: 10,
            alignItems: 'center',
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10 },
              android: { elevation: 7 },
            }),
          }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }}>
            ₪{activeVal.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 1 }}>
            יום {(activeIdx ?? 0) + 1}
          </Text>
        </View>
      )}
    </View>
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

function SectionHeader({ title, primaryColor, textColor, action }: {
  title: string;
  primaryColor: string;
  textColor: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={[shStyles.container, action && { justifyContent: 'space-between' }]}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
        <View style={[shStyles.accent, { backgroundColor: primaryColor }]} />
        <Text style={[shStyles.title, { color: textColor }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}
const shStyles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
  },
  accent: { width: 4, height: 20, borderRadius: 2 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'right', letterSpacing: -0.2 },
});

// ─────────────────────────────────────────────────────────────
// CLIENTS LEADERBOARD
// ─────────────────────────────────────────────────────────────

/** Re-maps a number from one range to another (Processing map()) */
function mapRange(v: number, lo1: number, hi1: number, lo2: number, hi2: number) {
  return lo2 + ((hi2 - lo2) * (v - lo1)) / (hi1 - lo1);
}

interface ClientBarEntry { clientId: string; name: string; revenue: number; initial: string; colorIdx: number }

const _LB_AVATAR    = 32;                     // avatar diameter
const _LB_SPACING   = 4;
const _LB_BAR_W     = _LB_AVATAR + 10;        // bar width = avatar + snug padding → 42px
const _LB_TOP_R     = _LB_BAR_W / 2;          // top radius = half width → perfect semicircle cap
const _LB_STAGGER   = 55;                     // ms between each bar entering
const _LB_DELAY     = 300;                    // initial delay before bars start
const _LB_CONTAINER = 170;                    // fixed container height

function ClientBar({
  entry, index, minMax, anim, isLast, primaryColor,
}: {
  entry: ClientBarEntry;
  index: number;
  minMax: [number, number];
  anim: SharedValue<number>;
  isLast: boolean;
  primaryColor: string;
}) {
  const isTop = entry.revenue === minMax[1];
  const accent = isTop ? primaryColor : CHART_COLORS[entry.colorIdx % CHART_COLORS.length];

  // Full bar height = body portion + avatar size + padding
  const targetBodyH = mapRange(
    entry.revenue, minMax[0], minMax[1],
    _LB_SPACING * 4,
    _LB_CONTAINER - _LB_AVATAR - 20, // 20 = name row below
  );

  const derived = useDerivedValue(() =>
    withDelay(_LB_STAGGER * index, withSpring(anim.value, { damping: 13, stiffness: 80 }))
  );

  // Bar grows from circle → full pill; border-bottom-radius collapses from circle to flat
  const barStyle = useAnimatedStyle(() => ({
    height: derived.value * targetBodyH + _LB_AVATAR + _LB_SPACING,
    borderBottomLeftRadius: interpolate(derived.value, [0, 1], [_LB_TOP_R, 4]),
    borderBottomRightRadius: interpolate(derived.value, [0, 1], [_LB_TOP_R, 4]),
    backgroundColor: isTop
      ? interpolateColor(derived.value, [0, 1], ['rgba(0,0,0,0.06)', primaryColor])
      : 'rgba(0,0,0,0.06)',
  }));

  // Amount text fades in after bar is 20% grown
  const amtFade = useAnimatedStyle(() => ({
    opacity: interpolate(derived.value, [0, 0.2, 1], [0, 0, 1]),
  }));

  const firstName = entry.name.split(' ')[0] ?? entry.name;
  const amtLabel = entry.revenue >= 1000
    ? `₪${(entry.revenue / 1000).toFixed(1)}k`
    : `₪${Math.round(entry.revenue)}`;

  return (
    <Animated.View
      entering={FadeInRight.delay(_LB_STAGGER * index + _LB_DELAY)
        .springify()
        .withCallback((finished) => {
          'worklet';
          if (finished && isLast) anim.value = 1;
        })}
      style={lbStyles.col}
    >
      {/* Bar contains avatar at top + amount text inside */}
      <Animated.View style={[
        lbStyles.bar,
        { backgroundColor: isTop ? `${primaryColor}18` : 'rgba(0,0,0,0.06)' },
        barStyle,
      ]}>
        {/* Avatar circle at top of bar */}
        <View style={[
          lbStyles.avatar,
          {
            borderColor: isTop ? 'rgba(255,255,255,0.6)' : `${accent}55`,
            padding: _LB_SPACING / 2,
          },
        ]}>
          <View style={[lbStyles.avatarInner, { backgroundColor: isTop ? 'rgba(255,255,255,0.25)' : `${accent}22` }]}>
            <Text style={[lbStyles.avatarInitial, { color: isTop ? '#FFFFFF' : accent }]}>
              {entry.initial}
            </Text>
          </View>
        </View>

        {/* Revenue amount — fades in after bar grows */}
        <Animated.Text style={[
          lbStyles.barAmt,
          { color: isTop ? '#fff' : accent },
          amtFade,
        ]}>
          {amtLabel}
        </Animated.Text>
      </Animated.View>

      {/* Client first name below bar */}
      <Text numberOfLines={1} style={lbStyles.barName}>
        {firstName}
      </Text>
    </Animated.View>
  );
}

function ClientsLeaderboard({
  entries, primaryColor,
}: {
  entries: ClientBarEntry[];
  primaryColor: string;
}) {
  const anim = useSharedValue(0);
  if (entries.length < 2) return null;

  const revenues = entries.map((e) => e.revenue);
  const maxRev = Math.max(...revenues);
  const minRev = Math.min(...revenues);
  const adjustedMin = minRev === maxRev ? 0 : minRev * 0.4;

  return (
    <View style={lbStyles.container}>
      {entries.map((entry, i) => (
        <ClientBar
          key={entry.clientId}
          entry={entry}
          index={i}
          minMax={[adjustedMin, maxRev]}
          anim={anim}
          isLast={i === entries.length - 1}
          primaryColor={primaryColor}
        />
      ))}
    </View>
  );
}

const lbStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: _LB_CONTAINER,
    paddingHorizontal: 4,
  },
  col: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 0,
    flex: 1,
    paddingHorizontal: 2,
  },
  // The animated bar wrapper — starts as a circle, expands upward
  bar: {
    width: _LB_BAR_W,
    borderTopLeftRadius: _LB_TOP_R,
    borderTopRightRadius: _LB_TOP_R,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: _LB_SPACING / 2,
    gap: _LB_SPACING / 2,
    overflow: 'hidden',
  },
  // Dashed outer ring
  avatar: {
    width: _LB_AVATAR,
    height: _LB_AVATAR,
    borderRadius: _LB_AVATAR / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: _LB_AVATAR - 8,
    height: _LB_AVATAR - 8,
    borderRadius: (_LB_AVATAR - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 11, fontWeight: '800' },
  barAmt: { fontSize: 10, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  barName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 56,
  },
});

// ─────────────────────────────────────────────────────────────
// COUNT-UP ANIMATION HOOK
// ─────────────────────────────────────────────────────────────
function useCountUp(target: number, trigger: number, duration = 950): number {
  const [display, setDisplay] = useState(0);
  const sv = useSharedValue(0);
  // Throttle JS-thread updates: only update every ~3 frames (~50ms) instead of every frame
  const lastJsUpdate = useSharedValue(0);

  useEffect(() => {
    sv.value = 0;
    sv.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, trigger]);

  useDerivedValue(() => {
    const now = sv.value;
    if (Math.abs(now - lastJsUpdate.value) >= Math.max(1, target / 20)) {
      lastJsUpdate.value = now;
      runOnJS(setDisplay)(Math.round(now));
    }
  });

  return display;
}

// ─────────────────────────────────────────────────────────────
// COLLAPSIBLE APPOINTMENT DATE GROUP (with Reanimated animation)
// ─────────────────────────────────────────────────────────────
function ApptDateGroup({
  date,
  appts,
  primaryColor,
  theme,
  formatCurrency,
  isLast,
}: {
  date: string;
  appts: CompletedAppointmentIncomeRow[];
  primaryColor: string;
  theme: ReturnType<typeof import('@/lib/hooks/useBusinessColors').useBusinessColors>['colors'];
  formatCurrency: (v: number) => string;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const progress = useSharedValue(0);
  const dayTotal = appts.reduce((s, a) => s + a.price, 0);

  const toggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    progress.value = withTiming(next ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  };

  const bodyStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, appts.length * 90 + 16]),
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.6, 1]),
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <View style={[!isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.07)' }]}>
      {/* Header row — always visible */}
      <TouchableOpacity activeOpacity={0.72} onPress={toggle} style={styles.apptCollapseRow}>
        {/* LEFT: animated chevron + price pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={15} color={theme.textSecondary ?? '#9CA3AF'} />
          </Animated.View>
          <View style={[styles.apptDayTotalPill, { backgroundColor: `${primaryColor}14` }]}>
            <Text style={[styles.apptDayTotalText, { color: primaryColor }]}>
              {formatCurrency(dayTotal)}
            </Text>
          </View>
        </View>
        {/* RIGHT: date label */}
        <Text style={[styles.apptDateLabel, { color: theme.text, flex: 1, textAlign: 'right' }]}>
          {formatDateLabel(date)}
        </Text>
      </TouchableOpacity>

      {/* Animated body */}
      <Animated.View style={bodyStyle}>
        <View style={{ paddingBottom: 12, gap: 8 }}>
          {appts.map((row) => {
            const client = row.client_label.trim() || 'לקוח';
            const initial = (client.trim().charAt(0) || '?').toUpperCase();
            const shortTime = (row.slot_time ?? '').slice(0, 5); // "HH:MM"
            const successColor = theme.success ?? '#10B981';
            return (
              <View
                key={row.id}
                style={{
                  marginHorizontal: 2,
                  backgroundColor: `${primaryColor}08`,
                  borderRadius: 16,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {/* LEFT: price */}
                <Text style={{ fontSize: 15, fontWeight: '900', color: successColor, letterSpacing: -0.3, minWidth: 48, textAlign: 'left' }}>
                  {formatCurrency(row.price)}
                </Text>

                {/* CENTER: name + service + time */}
                <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, textAlign: 'right' }} numberOfLines={1}>
                    {client}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary ?? '#6B7280', marginTop: 2, textAlign: 'right' }} numberOfLines={1}>
                    {row.service_name}
                  </Text>
                  <View style={{ backgroundColor: `${primaryColor}14`, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2, marginTop: 5, alignSelf: 'flex-end' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: primaryColor }}>{shortTime}</Text>
                  </View>
                </View>

                {/* RIGHT: avatar */}
                <View style={{ backgroundColor: `${primaryColor}1C`, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: primaryColor }}>{initial}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COLLAPSIBLE EXPENSE DATE GROUP (with Reanimated animation)
// ─────────────────────────────────────────────────────────────
function ExpenseDateGroup({
  date,
  dayExpenses,
  errorColor,
  primaryColor,
  theme,
  formatCurrency,
  isLast,
  handleDeleteExpense,
}: {
  date: string;
  dayExpenses: BusinessExpense[];
  errorColor: string;
  primaryColor: string;
  theme: ReturnType<typeof import('@/lib/hooks/useBusinessColors').useBusinessColors>['colors'];
  formatCurrency: (v: number) => string;
  isLast: boolean;
  handleDeleteExpense: (e: BusinessExpense) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const progress = useSharedValue(0);
  const dayTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const toggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    progress.value = withTiming(next ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  };

  const bodyStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, dayExpenses.length * 100 + 16]),
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.6, 1]),
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <View style={[!isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.07)' }]}>
      {/* Header row */}
      <TouchableOpacity activeOpacity={0.72} onPress={toggle} style={styles.apptCollapseRow}>
        {/* LEFT: chevron + total pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={15} color={theme.textSecondary ?? '#9CA3AF'} />
          </Animated.View>
          <View style={[styles.apptDayTotalPill, { backgroundColor: `${errorColor}14` }]}>
            <Text style={[styles.apptDayTotalText, { color: errorColor }]}>
              {formatCurrency(dayTotal)}
            </Text>
          </View>
        </View>
        {/* RIGHT: date label */}
        <Text style={[styles.apptDateLabel, { color: theme.text, flex: 1, textAlign: 'right' }]}>
          {formatDateLabel(date)}
        </Text>
      </TouchableOpacity>

      {/* Animated body */}
      <Animated.View style={bodyStyle}>
        <View style={{ paddingBottom: 12, gap: 8 }}>
          {dayExpenses.map((expense) => {
            const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
            const title = expense.description || cat.label;
            return (
              <View
                key={expense.id}
                style={{
                  marginHorizontal: 2,
                  backgroundColor: `${errorColor}07`,
                  borderRadius: 16,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {/* LEFT: amount */}
                <Text style={{ fontSize: 15, fontWeight: '900', color: errorColor, letterSpacing: -0.3, minWidth: 52, textAlign: 'left' }}>
                  {formatCurrency(Number(expense.amount))}
                </Text>

                {/* CENTER: title + category + receipt */}
                <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, textAlign: 'right' }} numberOfLines={1}>
                    {title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {expense.receipt_url && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(expense.receipt_url!)}
                        activeOpacity={0.75}
                        style={{ backgroundColor: `${primaryColor}12`, borderRadius: 8, padding: 5 }}
                      >
                        <FileImage size={14} color={primaryColor} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                    <View style={{ backgroundColor: `${cat.color}18`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: cat.color }}>{cat.label}</Text>
                    </View>
                  </View>
                </View>

                {/* RIGHT: delete button */}
                <TouchableOpacity
                  onPress={() => handleDeleteExpense(expense)}
                  activeOpacity={0.75}
                  style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${errorColor}10`, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={18} color={errorColor} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
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
  const expenseSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (showAddExpense) expenseSheetRef.current?.present();
    else expenseSheetRef.current?.dismiss();
  }, [showAddExpense]);

  const renderExpenseBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );
  const [sparklineW, setSparklineW] = useState(0);
  const [countTrigger, setCountTrigger] = useState(0);
  const extraApptSv = useSharedValue(0);
  const extraExpSv  = useSharedValue(0);
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
  // Start hidden (-200 covers any header height before first layout)
  const financeHeaderOffsetY = useSharedValue(-200);
  const financeLastScrollY = useSharedValue(0);

  // Show header only after scrolling past this Y threshold (hero card height ~= 260px)
  const HEADER_APPEAR_Y = 180;

  const financeScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      financeLastScrollY.value = y;
      const h = measuredFinanceHeaderHeight.value;
      if (y < HEADER_APPEAR_Y) {
        financeHeaderOffsetY.value = withTiming(-h, FINANCE_HEADER_HIDE);
      } else {
        financeHeaderOffsetY.value = withTiming(0, FINANCE_HEADER_SHOW);
      }
    },
  });

  const financeHeaderSlideStyle = useAnimatedStyle(() => {
    const h = Math.max(1, measuredFinanceHeaderHeight.value);
    const t = financeHeaderOffsetY.value;
    const opacity = interpolate(t, [-h, 0], [0, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY: t }] };
  });

  // No top spacer needed — hero card extends to y=0 with internal paddingTop for insets
  const financeScrollTopSpacerStyle = useAnimatedStyle(() => ({ height: 0 }));

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
      try { setStatusBarStyle('light', true); setStatusBarBackgroundColor('transparent', true); } catch { }
      financeHeaderOffsetY.value = -measuredFinanceHeaderHeight.value;
      financeLastScrollY.value = 0;
      setCountTrigger((t) => t + 1);
      return () => {
        try { setStatusBarBackgroundColor('transparent', true); } catch { }
        financeHeaderOffsetY.value = -measuredFinanceHeaderHeight.value;
        financeLastScrollY.value = 0;
      };
    }, [primaryColor, financeHeaderOffsetY, financeLastScrollY, measuredFinanceHeaderHeight]),
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

  // ── Count-up animated values (hero + KPI) ──
  const animNetProfit   = useCountUp(Math.abs(netProfit), countTrigger);
  const animIncome      = useCountUp(totalIncome, countTrigger);
  const animExpenses    = useCountUp(totalExpenses, countTrigger);
  const animTotalAppts  = useCountUp(quickStats.totalAppts, countTrigger);
  const animAvgPrice    = useCountUp(quickStats.avgPrice, countTrigger);
  const animBestWeek    = useCountUp(quickStats.bestWeek?.total ?? 0, countTrigger);

  /** Top clients by revenue — ascending order (tallest bar last = rightmost) */
  const topClients = useMemo((): ClientBarEntry[] => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const appt of monthAppointments) {
      const key = appt.user_id || appt.client_label;
      const name = appt.client_label.trim() || 'לקוח';
      const existing = map.get(key);
      if (existing) existing.revenue += appt.price;
      else map.set(key, { name, revenue: appt.price });
    }
    return Array.from(map.entries())
      .map(([id, { name, revenue }], i) => ({
        clientId: id,
        name,
        revenue,
        initial: (name.trim().charAt(0) || '?').toUpperCase(),
        colorIdx: i,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .reverse(); // ascending left→right so tallest is rightmost (like reference)
  }, [monthAppointments]);

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
      <View style={[styles.rtlRoot, { backgroundColor: theme.background }]}>
        <StatusBar style="light" backgroundColor="transparent" translucent />
        <LinearGradient
          colors={[lightenHex(primaryColor, 0.08), darkenHex(primaryColor, 0.18)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ paddingTop: insets.top + 14, paddingBottom: 14 }}
        />
        <View style={[styles.loadingWrap, { flex: 1 }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <RtlText style={[styles.loadingText, { color: theme.textSecondary }]}>טוען נתונים פיננסיים...</RtlText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.rtlRoot, { backgroundColor: theme.background }]}>
      <StatusBar style="light" backgroundColor="transparent" translucent />

      {/* ── Sticky header ── */}
      <Animated.View style={[styles.financeHeaderFixed, financeHeaderSlideStyle]} onLayout={onFinanceHeaderLayout}>
        <LinearGradient
          colors={[lightenHex(primaryColor, 0.06), darkenHex(primaryColor, 0.22)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.topBar, { paddingTop: insets.top + 14 }]}
        >
          <View style={styles.topBarTitleBlock}>
            <RtlText style={[styles.topBarTitle, { color: '#FFFFFF' }]}>מעקב פיננסי</RtlText>
            <RtlText style={[styles.topBarSubtitle, { color: 'rgba(255,255,255,0.82)' }]}>
              {MONTH_NAMES_HE[month - 1]} {year}
            </RtlText>
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces
        keyboardShouldPersistTaps="handled"
        onScroll={financeScrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Hero Card — starts at y=0, paddingTop pushes content below status bar ── */}
        <View style={styles.heroWrapper}>
          <View style={styles.heroCard} onLayout={onHeroLavaLayout}>
            <LinearGradient
              colors={[lightenHex(primaryColor, 0.08), darkenHex(primaryColor, 0.38)]}
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
            <View style={[styles.heroCardInner, { paddingTop: insets.top + 18 }]}>
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
                  {animNetProfit.toLocaleString('he-IL')}
                </Text>
                <Text style={[styles.heroNetAmountPart, { color: netProfit >= 0 ? '#A7F3D0' : '#FCA5A5' }]}>₪</Text>
              </View>

              <View style={styles.heroMiniRow}>
                <View style={styles.heroMiniCard}>
                  <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(220,252,231,0.95)' }]}>
                    <ArrowUpRight size={14} color={theme.success} />
                  </View>
                  <RtlText style={styles.heroMiniLabel}>הכנסות</RtlText>
                  <RtlText style={styles.heroMiniValue}>{formatCurrency(animIncome)}</RtlText>
                </View>
                <View style={styles.heroMiniDivider} />
                <View style={styles.heroMiniCard}>
                  <View style={[styles.heroMiniIcon, { backgroundColor: 'rgba(254,226,226,0.95)' }]}>
                    <ArrowDownRight size={14} color={theme.error} />
                  </View>
                  <RtlText style={styles.heroMiniLabel}>הוצאות</RtlText>
                  <RtlText style={styles.heroMiniValue}>{formatCurrency(animExpenses)}</RtlText>
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
          </View>
          {/* Bottom rounded overlay that creates the "card rising from hero" illusion */}
          <View style={[styles.heroBottomRound, { backgroundColor: theme.background }]} pointerEvents="none" />
        </View>

        {/* ── KPI Stats Strip ── */}
        {!analyticsLoading && quickStats.totalAppts > 0 && (
          <View style={styles.kpiStrip}>

            {/* KPI — total appointments */}
            <View style={[styles.kpiCard, { backgroundColor: `${primaryColor}09` }]}>
              <View style={[styles.kpiIconWrap, { backgroundColor: `${primaryColor}18` }]}>
                <Users size={20} color={primaryColor} />
              </View>
              <View style={styles.kpiTextBlock}>
                <RtlText style={[styles.kpiValue, { color: theme.text }]}>{animTotalAppts}</RtlText>
                <RtlText style={[styles.kpiLabel, { color: theme.textSecondary }]}>תורים בחודש</RtlText>
              </View>
            </View>

            {/* KPI — avg price per appointment */}
            <View style={[styles.kpiCard, { backgroundColor: '#F0FDF4' }]}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#DCFCE7' }]}>
                <TrendingUp size={20} color="#16A34A" />
              </View>
              <View style={styles.kpiTextBlock}>
                <RtlText style={[styles.kpiValue, { color: theme.text }]}>{formatCurrency(animAvgPrice)}</RtlText>
                <RtlText style={[styles.kpiLabel, { color: theme.textSecondary }]}>ממוצע לתור</RtlText>
              </View>
            </View>

            {/* KPI — best week */}
            {quickStats.bestWeek && quickStats.bestWeek.total > 0 && (() => {
              const weekRange = quickStats.bestWeek.label.split(' ב')[0] ?? '';
              const weekMonth = quickStats.bestWeek.label.split(' ב')[1] ?? '';
              return (
                <View style={[styles.kpiCard, { backgroundColor: '#FFFBEB' }]}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
                    <Star size={20} color="#D97706" fill="#D97706" />
                  </View>
                  <View style={styles.kpiTextBlock}>
                    <RtlText style={[styles.kpiValue, { color: '#92400E' }]} numberOfLines={1}>
                      {formatCurrency(animBestWeek)}
                    </RtlText>
                    <RtlText style={[styles.kpiLabel, { color: '#B45309' }]}>השבוע הטוב</RtlText>
                    {weekRange ? (
                      <View style={styles.kpiWeekTag}>
                        <Text style={styles.kpiWeekTagText}>{weekRange}{weekMonth ? ` ב${weekMonth}` : ''}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })()}

          </View>
        )}

        {/* ── Daily trend sparkline ── */}
        {!analyticsLoading && dailyTotals.some((v) => v > 0) && (
          <>
            <SectionHeader title="מגמת הכנסות יומית" primaryColor={primaryColor} textColor={theme.text} />
            <View style={[styles.card, { backgroundColor: theme.background, paddingVertical: 20, paddingHorizontal: 16 }]}>
              <View style={styles.sparklineTitleRow}>
                <RtlText style={[styles.sparklineTitleSub, { color: theme.textSecondary }]}>סה״כ החודש</RtlText>
                <RtlText style={[styles.sparklineTitleTotal, { color: theme.text }]}>
                  {formatCurrency(dailyTotals.reduce((s, v) => s + v, 0))}
                </RtlText>
              </View>
              <View
                onLayout={(e) => setSparklineW(Math.floor(e.nativeEvent.layout.width))}
                style={{ width: '100%' }}
              >
                <DailySparkline
                  dailyTotals={dailyTotals}
                  primaryColor={primaryColor}
                  chartWidth={sparklineW > 10 ? sparklineW : chartWidth}
                  trigger={countTrigger}
                />
              </View>
              <View style={[styles.sparklineLegend, { borderTopColor: `${theme.border}20` }]}>
                <RtlText style={[styles.sparklineLegendText, { color: theme.textSecondary }]}>
                  יום {dailyTotals.length} · · · · · · · · · · · · · · · יום 1
                </RtlText>
              </View>
            </View>
          </>
        )}

        {/* ── Top Clients Leaderboard ── */}
        {!analyticsLoading && topClients.length >= 2 && (
          <>
            <SectionHeader title="לקוחות מובילים החודש" primaryColor={primaryColor} textColor={theme.text} />
            <View style={[styles.card, { backgroundColor: theme.background, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 10 }]}>
              <ClientsLeaderboard
                entries={topClients}
                primaryColor={primaryColor}
              />
            </View>
          </>
        )}

        {/* ── Income Breakdown (Donut + Legend) ── */}
        <SectionHeader title="פירוט הכנסות לפי שירות" primaryColor={primaryColor} textColor={theme.text} />
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          {incomeBreakdown.length === 0 ? (
            <View style={styles.emptyState}>
              <TrendingUp size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין הכנסות החודש</RtlText>
              <RtlText style={styles.emptySubtitle}>תורים שהושלמו יופיעו כאן</RtlText>
            </View>
          ) : (
            <>
              {/* Donut centered */}
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <IncomeDonut breakdown={incomeBreakdown} totalIncome={totalIncome} fmtCurrency={formatCurrency} />
              </View>

              {/* 2-column service grid */}
              <View style={styles.serviceGrid}>
                {incomeBreakdown.map((item, i) => {
                  const color = CHART_COLORS[i % CHART_COLORS.length];
                  const pct = totalIncome > 0 ? Math.round((item.total / totalIncome) * 100) : 0;
                  return (
                    <View
                      key={item.service_id || item.service_name}
                      style={[styles.serviceGridCard, { backgroundColor: `${color}0C` }]}
                    >
                      {/* Top row: dot + pct pill */}
                      <View style={styles.serviceGridTop}>
                        <View style={[styles.serviceGridPct, { backgroundColor: `${color}20` }]}>
                          <Text style={[styles.serviceGridPctText, { color }]}>{pct}%</Text>
                        </View>
                        <View style={[styles.serviceGridDot, { backgroundColor: color }]} />
                      </View>
                      {/* Service name */}
                      <RtlText style={[styles.serviceGridName, { color: theme.text }]}>
                        {item.service_name}
                      </RtlText>
                      {/* Amount */}
                      <RtlText style={[styles.serviceGridAmt, { color }]}>
                        {formatCurrency(item.total)}
                      </RtlText>
                    </View>
                  );
                })}
              </View>

              {/* Total row */}
              <View style={[styles.incomeTotalRow, { borderTopColor: `${theme.border}20`, backgroundColor: `${theme.success}08`, borderRadius: 12, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 0 }]}>
                <RtlText style={[styles.totalLabel, { color: theme.text }]}>סך הכל הכנסות</RtlText>
                <RtlText style={[styles.totalAmount, { color: theme.success }]}>{formatCurrency(totalIncome)}</RtlText>
              </View>
            </>
          )}
        </View>

        {/* ── Weekly SVG Bar Chart ── */}
        <SectionHeader title="ניתוח שבועי" primaryColor={primaryColor} textColor={theme.text} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.background,
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
        <SectionHeader title="תורים החודש" primaryColor={primaryColor} textColor={theme.text} />
        <View style={[styles.card, { backgroundColor: theme.background }]}>
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
              {/* First N groups — always visible */}
              {appointmentsByDate.slice(0, APPT_GROUPS_INITIAL).map(([date, appts], groupIdx) => (
                <ApptDateGroup
                  key={date}
                  date={date}
                  appts={appts}
                  primaryColor={primaryColor}
                  theme={theme}
                  formatCurrency={formatCurrency}
                  isLast={groupIdx === APPT_GROUPS_INITIAL - 1 && appointmentsByDate.length <= APPT_GROUPS_INITIAL}
                />
              ))}

              {/* Extra groups — animated slide */}
              {appointmentsByDate.length > APPT_GROUPS_INITIAL && (() => {
                const extraGroups = appointmentsByDate.slice(APPT_GROUPS_INITIAL);
                const extraStyle = {
                  overflow: 'hidden' as const,
                  maxHeight: extraApptSv,
                };
                return (
                  <>
                    <Animated.View style={extraStyle}>
                      {extraGroups.map(([date, appts], i) => (
                        <ApptDateGroup
                          key={date}
                          date={date}
                          appts={appts}
                          primaryColor={primaryColor}
                          theme={theme}
                          formatCurrency={formatCurrency}
                          isLast={i === extraGroups.length - 1}
                        />
                      ))}
                    </Animated.View>
                    <TouchableOpacity
                      style={[styles.showMoreBtn, { backgroundColor: primaryColor }]}
                      onPress={() => {
                        const next = !showAllAppointments;
                        setShowAllAppointments(next);
                        extraApptSv.value = withTiming(
                          next ? extraGroups.length * 300 : 0,
                          { duration: 380, easing: Easing.out(Easing.cubic) },
                        );
                      }}
                      activeOpacity={0.82}
                    >
                      <Text style={[styles.showMoreBtnText, { color: '#fff' }]}>
                        {showAllAppointments ? 'הצג פחות' : 'הצג את כל הימים'}
                      </Text>
                      {showAllAppointments
                        ? <ChevronUp size={14} color="#fff" />
                        : <ChevronDown size={14} color="#fff" />}
                    </TouchableOpacity>
                  </>
                );
              })()}
            </>
          )}
        </View>

        {/* ── Expenses ── */}
        <SectionHeader
          title="הוצאות החודש"
          primaryColor={primaryColor}
          textColor={theme.text}
          action={
            <TouchableOpacity
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.82}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: primaryColor,
                borderRadius: 50,
                paddingVertical: 6,
                paddingHorizontal: 12,
              }}
            >
              <Plus size={13} color="#fff" strokeWidth={2.8} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>הוסף הוצאה</Text>
            </TouchableOpacity>
          }
        />
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          {expenses.length === 0 ? (
            <View style={styles.emptyState}>
              <ArrowDownRight size={36} color="#E5E7EB" />
              <RtlText style={styles.emptyTitle}>אין הוצאות בחודש זה</RtlText>
              <RtlText style={styles.emptySubtitle}>הוצאות יופיעו כאן לפי תאריך · לחץ על + להוספה</RtlText>
            </View>
          ) : (
            <>
              {/* First N expense groups — always visible */}
              {expensesByDate.slice(0, EXPENSE_GROUPS_INITIAL).map(([date, dayExpenses], groupIdx) => (
                <ExpenseDateGroup
                  key={date}
                  date={date}
                  dayExpenses={dayExpenses}
                  errorColor={theme.error ?? '#EF4444'}
                  primaryColor={primaryColor}
                  theme={theme}
                  formatCurrency={formatCurrency}
                  isLast={groupIdx === EXPENSE_GROUPS_INITIAL - 1 && expensesByDate.length <= EXPENSE_GROUPS_INITIAL}
                  handleDeleteExpense={handleDeleteExpense}
                />
              ))}

              {/* Extra expense groups — animated slide */}
              {expensesByDate.length > EXPENSE_GROUPS_INITIAL && (() => {
                const extraExp = expensesByDate.slice(EXPENSE_GROUPS_INITIAL);
                return (
                  <>
                    <Animated.View style={{ overflow: 'hidden', maxHeight: extraExpSv }}>
                      {extraExp.map(([date, dayExpenses], i) => (
                        <ExpenseDateGroup
                          key={date}
                          date={date}
                          dayExpenses={dayExpenses}
                          errorColor={theme.error ?? '#EF4444'}
                          primaryColor={primaryColor}
                          theme={theme}
                          formatCurrency={formatCurrency}
                          isLast={i === extraExp.length - 1}
                          handleDeleteExpense={handleDeleteExpense}
                        />
                      ))}
                    </Animated.View>
                    <TouchableOpacity
                      style={[styles.showMoreBtn, { backgroundColor: primaryColor }]}
                      onPress={() => {
                        const next = !showAllExpenseDays;
                        setShowAllExpenseDays(next);
                        extraExpSv.value = withTiming(
                          next ? extraExp.length * 300 : 0,
                          { duration: 380, easing: Easing.out(Easing.cubic) },
                        );
                      }}
                      activeOpacity={0.82}
                    >
                      <Text style={[styles.showMoreBtnText, { color: '#fff' }]}>
                        {showAllExpenseDays ? 'הצג פחות' : 'הצג את כל הימים'}
                      </Text>
                      {showAllExpenseDays
                        ? <ChevronUp size={14} color="#fff" />
                        : <ChevronDown size={14} color="#fff" />}
                    </TouchableOpacity>
                  </>
                );
              })()}

              <View style={[styles.incomeTotalRow, { borderTopColor: `${theme.border}20`, backgroundColor: `${theme.error}08`, borderRadius: 12, marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 0 }]}>
                <RtlText style={[styles.totalLabel, { color: theme.text }]}>סך הכל הוצאות</RtlText>
                <RtlText style={[styles.totalAmount, { color: theme.error }]}>{formatCurrency(totalExpenses)}</RtlText>
              </View>
            </>
          )}
        </View>

        <View style={{ height: Math.max(120, insets.bottom + 108) }} />
      </Animated.ScrollView>

      {/* ── Add Expense Modal ── */}
      <BottomSheetModal
        ref={expenseSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        onDismiss={() => { setShowAddExpense(false); setNewExpenseReceipt(null); }}
        backdropComponent={renderExpenseBackdrop}
        handleIndicatorStyle={{ backgroundColor: 'rgba(0,0,0,0.18)', width: 36, height: 4, borderRadius: 2 }}
        backgroundStyle={{ backgroundColor: theme.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
        topInset={insets.top + 8}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 24) + 16, direction: 'ltr' }}
        >
          {/* Title */}
          <RtlText style={[styles.modalTitle, { color: theme.text, marginBottom: 24 }]}>הוספת הוצאה</RtlText>

          {/* Amount — ₪ on LEFT, number on RIGHT */}
          <View style={styles.amountBox}>
            <Text style={styles.amountCurrency}>₪</Text>
            <TextInput
              style={styles.amountInput}
              value={newExpenseAmount}
              onChangeText={setNewExpenseAmount}
              placeholder="0"
              placeholderTextColor="#D1D5DB"
              keyboardType="decimal-pad"
              autoFocus={false}
              textAlign="center"
            />
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

          {/* Category */}
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
                  style={[styles.categoryGridItem, { backgroundColor: selected ? cfg.color : cfg.bg }]}
                >
                  <RtlText style={[styles.categoryGridText, { color: selected ? '#fff' : cfg.color }]}>{cfg.label}</RtlText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Receipt */}
          <RtlText style={[styles.modalSectionLabel, { color: theme.text }]}>קבלה / אסמכתא</RtlText>
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
            <TouchableOpacity
              style={[styles.receiptAddBtn, { backgroundColor: `${primaryColor}0C` }]}
              onPress={pickReceipt}
              activeOpacity={0.75}
            >
              <View style={[styles.receiptAddIconWrap, { backgroundColor: `${primaryColor}18` }]}>
                <FileImage size={20} color={primaryColor} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <RtlText style={[styles.receiptAddBtnText, { color: theme.text }]}>הוסף קבלה</RtlText>
                <RtlText style={{ fontSize: 12, color: theme.textSecondary ?? '#9CA3AF', marginTop: 1 }}>תמונה מהגלריה (אופציונלי)</RtlText>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.modalAddBtn, { backgroundColor: primaryColor, marginTop: 8 }]} onPress={handleAddExpense} disabled={savingExpense} activeOpacity={0.82}>
            {savingExpense ? <ActivityIndicator size="small" color="#fff" /> : <RtlText style={styles.modalAddBtnText}>הוסף הוצאה</RtlText>}
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const cardShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.11, shadowRadius: 18 },
  android: { elevation: 5 },
});

const styles = StyleSheet.create({
  rtlRoot: { flex: 1, direction: 'ltr' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr', alignSelf: 'stretch' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 16, textAlign: 'right' },

  safeAreaTopFill: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15 },
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
  heroWrapper: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  heroCard: {
    borderRadius: 0, overflow: 'hidden', position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 24 },
      android: { elevation: 10 },
    }),
  },
  heroCardInner: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  heroLoadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroLoadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  heroBottomRound: {
    position: 'absolute', bottom: -18, left: 0, right: 0, height: 36,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
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
  heroRatioTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', flexDirection: 'row-reverse' },
  heroRatioFill: { height: '100%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.92)' },

  // ── KPI strip ──
  kpiStrip: { flexDirection: 'row-reverse', paddingHorizontal: 16, paddingTop: 28, paddingBottom: 4, gap: 10 },
  kpiCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  kpiTopStripe: { width: '100%', height: 3, borderRadius: 0, marginBottom: 8 },
  kpiIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kpiTextBlock: { alignItems: 'center', gap: 2, width: '100%' },
  kpiValue: { fontSize: 15, fontWeight: '900', textAlign: 'center', letterSpacing: -0.4 },
  kpiLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  kpiWeekTag: {
    marginTop: 4,
    backgroundColor: 'rgba(217,119,6,0.12)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  kpiWeekTagText: { fontSize: 9, fontWeight: '700', color: '#B45309', textAlign: 'center' },

  // ── Section headings (kept for possible remnants) ──
  sectionHeading: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, alignItems: 'center' },
  sectionHeadingTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', alignSelf: 'stretch' },

  // ── Card ──
  card: { borderRadius: 24, marginHorizontal: 16, marginBottom: 4, padding: 18, direction: 'ltr', ...cardShadow },

  // ── Sparkline ──
  sparklineTitleRow: { flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginBottom: 10 },
  sparklineTitleTotal: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  sparklineTitleSub: { fontSize: 12, fontWeight: '600' },
  sparklineLegend: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  sparklineLegendText: { fontSize: 10, textAlign: 'center' },

  // ── Donut + legend ──
  donutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  donutLegend: { flex: 1, gap: 0 },
  // ── Service grid (income breakdown) ──
  serviceGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  serviceGridCard: {
    width: '47.5%',
    borderRadius: 14,
    padding: 11,
    gap: 5,
  },
  serviceGridTop: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceGridDot: { width: 8, height: 8, borderRadius: 4 },
  serviceGridPct: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  serviceGridPctText: { fontSize: 10, fontWeight: '700' },
  serviceGridName: { fontSize: 12, fontWeight: '600', textAlign: 'right', lineHeight: 17, color: '#374151' },
  serviceGridAmt: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, textAlign: 'right' },
  serviceGridBarTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  serviceGridBarFill: { height: '100%', borderRadius: 2 },

  // kept for backward compat (not used in JSX anymore but avoids TS errors)
  legendItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
  legendDot: { width: 11, height: 11, borderRadius: 6, flexShrink: 0, marginTop: 4 },
  legendBody: { flex: 1, gap: 5 },
  legendName: { fontSize: 13, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  legendMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flex: 1 },
  legendAmt: { fontSize: 13, fontWeight: '800' },
  legendPct: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  legendPctText: { fontSize: 10, fontWeight: '700' },
  legendBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#F0F2F7', overflow: 'hidden', width: '100%' },
  legendBarFill: { height: '100%', borderRadius: 3 },

  // ── Income totals ──
  incomeTotalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
  totalRow: { flexDirection: 'row-reverse', paddingTop: 14, paddingBottom: 2, justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, fontWeight: '700', textAlign: 'right' },
  totalAmount: { fontSize: 20, fontWeight: '900', textAlign: 'right' },

  // ── Appointments ──
  apptDateGroup: { paddingVertical: 12 },
  apptDateHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  apptDateLabel: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  apptCollapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 2,
  },
  apptDayTotalPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginLeft: 8 },
  apptDayTotalText: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  apptCompactRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, gap: 10 },
  apptCompactAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  apptCompactAvatarChar: { fontSize: 15, fontWeight: '900' },
  apptCompactBody: { flex: 1, minWidth: 0 },
  apptCompactName: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  apptCompactMeta: { fontSize: 12, marginTop: 2, textAlign: 'right' },
  apptCompactPrice: { fontSize: 14, fontWeight: '800', textAlign: 'left', minWidth: 56 },
  showMoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 50, paddingVertical: 9, paddingHorizontal: 20, marginTop: 10, alignSelf: 'center' },
  showMoreBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },

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
  amountCurrency: { fontSize: 36, fontWeight: '800', color: Colors.subtext, marginRight: 8, writingDirection: 'ltr' },
  amountInput: { fontSize: 52, fontWeight: '900', color: Colors.text, minWidth: 100, textAlign: 'center', direction: 'ltr' },
  descInput: { height: 50, borderWidth: 1.5, borderColor: '#E8EAF0', borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: Colors.text, backgroundColor: '#FAFBFD', marginBottom: 20, textAlign: 'right' },
  modalSectionLabel: { fontSize: 14, fontWeight: '700', textAlign: 'right', marginBottom: 12 },
  categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  categoryGridItem: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24 },
  categoryGridText: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  receiptAddBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, marginBottom: 20 },
  receiptAddIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  receiptAddBtnText: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
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
