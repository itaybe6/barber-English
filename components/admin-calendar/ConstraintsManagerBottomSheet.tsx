import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useAdminCalendarSheetTimingConfig } from '@/components/admin-calendar/useAdminCalendarSheetTiming';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react-native';
import {
  businessConstraintsApi,
  isConstraintPastAutoDeleteWindow,
} from '@/lib/api/businessConstraints';
import type { BusinessConstraint } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import dayjs from 'dayjs';
import { useColors } from '@/src/theme/ThemeProvider';
import { getPrimaryAsForegroundOnLightSurface } from '@/lib/colorContrast';

// ─── design tokens ────────────────────────────────────────────────────────────

const UI = {
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.12)',
};

/** Wait until the sheet open animation has mostly settled before hitting the network / setState — keeps the transition smooth. */
const FETCH_DEFER_MS = 320;

// ─── public handle ────────────────────────────────────────────────────────────

export interface ConstraintsManagerSheetHandle {
  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
}

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
  primaryColor: string;
  onDismiss: () => void;
  onAddConstraint: () => void;
  onEditConstraint: (constraint: BusinessConstraint) => void;
  /** After delete — refresh calendar / marks (same shape as other constraint flows). */
  onConstraintsChanged?: (payload?: { dateMin: string; dateMax: string }) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function sliceHHMM(t: string | null | undefined): string {
  return String(t || '').trim().slice(0, 5);
}

function formatDate(iso: string): string {
  try {
    const d = dayjs(iso);
    return d.format('DD/MM/YYYY');
  } catch {
    return iso;
  }
}

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getDayLabel(iso: string): string {
  const today = dayjs().startOf('day');
  const d = dayjs(iso);
  if (d.isSame(today, 'day')) return 'היום';
  if (d.isSame(today.add(1, 'day'), 'day')) return 'מחר';
  const dayIndex = d.day(); // 0 = Sunday
  return `יום ${HE_DAYS[dayIndex] ?? ''}`;
}

function groupByDate(rows: BusinessConstraint[]): { date: string; items: BusinessConstraint[] }[] {
  const map = new Map<string, BusinessConstraint[]>();
  for (const r of rows) {
    const arr = map.get(r.date) ?? [];
    arr.push(r);
    map.set(r.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  primaryColor,
  onAdd,
}: {
  primaryColor: string;
  onAdd: () => void;
}) {
  return (
    <View style={styles.emptyRoot}>
      <View style={[styles.emptyIconCircle, { backgroundColor: `${primaryColor}12` }]}>
        <CalendarOff size={48} color={primaryColor} strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>אין אילוצים פעילים</Text>
      <Text style={styles.emptySubtitle}>
        לא הגדרת חסימות זמן עתידיות.{'\n'}לחץ כדי להוסיף אילוץ חדש.
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor, shadowColor: primaryColor }]}
        onPress={onAdd}
        activeOpacity={0.88}
      >
        <Plus size={20} color="#fff" strokeWidth={2.5} />
        <Text style={styles.primaryBtnText}>הוסף אילוץ</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── constraint card ─────────────────────────────────────────────────────────

function ConstraintCard({
  constraint,
  onEdit,
  onRequestDelete,
}: {
  constraint: BusinessConstraint;
  onEdit: (c: BusinessConstraint) => void;
  onRequestDelete: (c: BusinessConstraint) => void;
}) {
  const { t } = useTranslation();
  const rtl = I18nManager.isRTL;
  const isFullDay =
    sliceHHMM(constraint.start_time) === '00:00' &&
    (sliceHHMM(constraint.end_time) === '23:59' || sliceHHMM(constraint.end_time) === '23:45');

  return (
    <View style={styles.constraintCard}>
      <TouchableOpacity
        style={styles.deleteIconWrap}
        onPress={() => onRequestDelete(constraint)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('admin.hoursAdmin.deleteConstraintA11y', 'מחיקת אילוץ')}
      >
        <Trash2 size={18} color="#FFFFFF" strokeWidth={2.2} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.constraintCardLead}
        onPress={() => onEdit(constraint)}
        activeOpacity={0.78}
      >
        <View style={[styles.constraintTextCol, rtl && styles.constraintTextColRtl]}>
          {isFullDay ? (
            <Text style={[styles.constraintTime, { color: UI.text, textAlign: rtl ? 'right' : 'left' }]}>
              חסימה כל היום
            </Text>
          ) : (
            <Text
              style={[
                styles.constraintTime,
                { writingDirection: 'ltr', textAlign: rtl ? 'right' : 'left' },
              ]}
            >
              {sliceHHMM(constraint.start_time)} – {sliceHHMM(constraint.end_time)}
            </Text>
          )}
          {constraint.reason ? (
            <Text
              style={[styles.constraintReason, { textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={1}
            >
              {constraint.reason}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.editBadge}
        onPress={() => onEdit(constraint)}
        activeOpacity={0.78}
        accessibilityRole="button"
      >
        <Pencil size={14} color={UI.textSecondary} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export const ConstraintsManagerBottomSheet = forwardRef<ConstraintsManagerSheetHandle, Props>(
  function ConstraintsManagerBottomSheet(
    { primaryColor, onDismiss, onAddConstraint, onEditConstraint, onConstraintsChanged },
    ref,
  ) {
    const { t } = useTranslation();
    const colors = useColors();
    const addMoreOnSurface = useMemo(
      () => getPrimaryAsForegroundOnLightSurface(primaryColor, colors.text),
      [primaryColor, colors.text],
    );
    const sheetRef = useRef<BottomSheetModal>(null);
    const fetchDeferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const insets = useSafeAreaInsets();
    const { user } = useAuthStore();

    const [constraints, setConstraints] = useState<BusinessConstraint[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchConstraints = useCallback(async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        /** Look back so rows that already ended +24h can be loaded and purged from DB. */
        const lookback = dayjs().subtract(120, 'day').format('YYYY-MM-DD');
        const futureLimit = dayjs().add(6, 'month').format('YYYY-MM-DD');
        const data = await businessConstraintsApi.getPersonalConstraintsForBarberInRange(
          lookback,
          futureLimit,
          user.id,
        );

        const stale = data.filter((c) => isConstraintPastAutoDeleteWindow(c));
        let deletedOkIds: string[] = [];
        if (stale.length > 0) {
          const outcomes = await Promise.all(stale.map((c) => businessConstraintsApi.deleteConstraint(c.id)));
          deletedOkIds = stale.filter((c, i) => outcomes[i]).map((c) => c.id);
          if (deletedOkIds.length > 0) {
            const dates = stale
              .filter((c) => deletedOkIds.includes(c.id))
              .map((c) => c.date)
              .sort();
            onConstraintsChanged?.({
              dateMin: dates[0]!,
              dateMax: dates[dates.length - 1]!,
            });
          }
        }

        setConstraints(
          data.filter((c) => {
            if (!isConstraintPastAutoDeleteWindow(c)) return true;
            return !deletedOkIds.includes(c.id);
          }),
        );
      } catch (e) {
        console.error('[ConstraintsManager] fetch error', e);
      } finally {
        setLoading(false);
      }
    }, [user?.id, onConstraintsChanged]);

    useEffect(() => {
      return () => {
        if (fetchDeferTimerRef.current) {
          clearTimeout(fetchDeferTimerRef.current);
          fetchDeferTimerRef.current = null;
        }
      };
    }, []);

    const animationConfigs = useAdminCalendarSheetTimingConfig();

    useImperativeHandle(ref, () => ({
      open: () => {
        if (fetchDeferTimerRef.current) {
          clearTimeout(fetchDeferTimerRef.current);
          fetchDeferTimerRef.current = null;
        }
        // present() first — gives Reanimated the earliest possible start on the UI thread.
        // setState and network calls are deferred so they don't compete with the opening frame.
        sheetRef.current?.present();
        setLoading(true);
        fetchDeferTimerRef.current = setTimeout(() => {
          fetchDeferTimerRef.current = null;
          void fetchConstraints();
        }, FETCH_DEFER_MS);
      },
      close: () => {
        if (fetchDeferTimerRef.current) {
          clearTimeout(fetchDeferTimerRef.current);
          fetchDeferTimerRef.current = null;
        }
        sheetRef.current?.dismiss();
      },
      refresh: fetchConstraints,
    }));

    const renderBackdrop = useCallback(
      (bsProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...bsProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.35}
          pressBehavior="close"
        />
      ),
      [],
    );

    const grouped = useMemo(() => groupByDate(constraints), [constraints]);
    const isEmpty = !loading && constraints.length === 0;

    const handleRequestDeleteConstraint = useCallback(
      (c: BusinessConstraint) => {
        Alert.alert(
          t('admin.hoursAdmin.deleteConstraintTitle', 'למחוק את האילוץ?'),
          t('admin.hoursAdmin.deleteConstraintMessage', 'החסימה תוסר מהיומן. לא ניתן לשחזר.'),
          [
            { text: t('cancel', 'ביטול'), style: 'cancel' },
            {
              text: t('admin.hoursAdmin.deleteConstraintConfirm', 'מחק'),
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  try {
                    const ok = await businessConstraintsApi.deleteConstraint(c.id);
                    if (ok) {
                      setConstraints((prev) => prev.filter((x) => x.id !== c.id));
                      onConstraintsChanged?.({ dateMin: c.date, dateMax: c.date });
                    } else {
                      Alert.alert(
                        t('error.generic', 'שגיאה'),
                        t('admin.hoursAdmin.deleteConstraintFailed', 'לא ניתן למחוק. נסו שוב.'),
                      );
                    }
                  } catch {
                    Alert.alert(
                      t('error.generic', 'שגיאה'),
                      t('admin.hoursAdmin.deleteConstraintFailed', 'לא ניתן למחוק. נסו שוב.'),
                    );
                  }
                })();
              },
            },
          ],
        );
      },
      [t, onConstraintsChanged],
    );

    let cardIdx = 0;

    return (
      <BottomSheetModal
        ref={sheetRef}
        onDismiss={onDismiss}
        animationConfigs={animationConfigs}
        backdropComponent={renderBackdrop}
        snapPoints={['82%']}
        index={0}
        enableDynamicSizing={false}
        enablePanDownToClose
        enableOverDrag={false}
        topInset={insets.top}
        handleIndicatorStyle={styles.dragHandle}
        backgroundStyle={styles.sheetBg}
        style={styles.sheetShadow}
      >
        <View style={styles.sheetBody}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>ניהול אילוצים</Text>
              <Text style={styles.headerSubtitle}>החלק למטה כדי לסגור</Text>
            </View>
          </View>
          <View style={styles.divider} />

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={primaryColor} size="large" />
            </View>
          ) : isEmpty ? (
            <EmptyState primaryColor={primaryColor} onAdd={onAddConstraint} />
          ) : (
            <BottomSheetScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: insets.bottom + 32 },
              ]}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {grouped.map(({ date, items }) => (
                <View key={date} style={styles.dateGroup}>
                  <View style={styles.dateGroupHeader}>
                    <Text style={styles.dateGroupDate}>{formatDate(date)}</Text>
                    <Text style={styles.dateGroupDay}>{getDayLabel(date)}</Text>
                  </View>

                  {items.map((c) => {
                    const idx = cardIdx++;
                    return (
                      <ConstraintCard
                        key={`${c.id}-${idx}`}
                        constraint={c}
                        onEdit={onEditConstraint}
                        onRequestDelete={handleRequestDeleteConstraint}
                      />
                    );
                  })}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addMoreBtn, { borderColor: `${addMoreOnSurface}99` }]}
                onPress={onAddConstraint}
                activeOpacity={0.8}
              >
                <Plus size={18} color={addMoreOnSurface} strokeWidth={2.5} />
                <Text style={[styles.addMoreText, { color: addMoreOnSurface }]}>הוסף אילוץ נוסף</Text>
              </TouchableOpacity>
            </BottomSheetScrollView>
          )}
        </View>
      </BottomSheetModal>
    );
  },
);

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBg: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  sheetShadow: {
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 24 },
      android: { elevation: 28 },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    marginTop: 2,
  },
  sheetBody: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerTextCol: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    alignSelf: 'stretch',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: UI.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    alignSelf: 'stretch',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: UI.border,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  emptyRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 14,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: UI.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 18,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16 },
      android: { elevation: 7 },
    }),
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateGroupHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  dateGroupDay: {
    fontSize: 15,
    fontWeight: '700',
    color: UI.text,
    textAlign: 'left',
  },
  dateGroupDate: {
    fontSize: 13,
    fontWeight: '500',
    color: UI.textSecondary,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  constraintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: UI.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  /** Time/reason tap opens edit; trash and pencil are separate targets. */
  constraintCardLead: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  deleteIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: '#DC2626',
  },
  constraintTextCol: {
    flexShrink: 1,
    alignItems: 'flex-start',
    gap: 3,
    maxWidth: '100%',
  },
  constraintTextColRtl: {
    alignItems: 'flex-end',
  },
  constraintTime: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.text,
  },
  constraintReason: {
    fontSize: 12,
    fontWeight: '500',
    color: UI.textSecondary,
  },
  editBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addMoreBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  addMoreText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
