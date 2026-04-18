import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  I18nManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, Calendar, StickyNote } from 'lucide-react-native';
import { useColors } from '@/src/theme/ThemeProvider';

// ─── public handle ────────────────────────────────────────────────────────────

export interface CalendarAddSheetHandle {
  open: () => void;
  close: () => void;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  primaryColor: string;
  /** Called when the sheet fully closes (drag, backdrop tap, or programmatic). */
  onDismiss: () => void;
  onPickAppointment: () => void;
  onPickReminder: () => void;
  onPickConstraints: () => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export const CalendarAddBottomSheet = forwardRef<CalendarAddSheetHandle, Props>(
  function CalendarAddBottomSheet(
    { primaryColor, onDismiss, onPickAppointment, onPickReminder, onPickConstraints },
    ref,
  ) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const insets = useSafeAreaInsets();
    const isRtl = I18nManager.isRTL;
    const colors = useColors();

    // Expose open / close directly — no React state round-trip, zero delay.
    useImperativeHandle(ref, () => ({
      open: () => sheetRef.current?.present(),
      close: () => sheetRef.current?.dismiss(),
    }));

    const animationConfigs = useBottomSheetSpringConfigs({
      damping: 68,
      stiffness: 360,
      mass: 0.85,
      overshootClamping: false,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
    });

    const handleDismiss = useCallback(() => {
      onDismiss();
    }, [onDismiss]);

    /** Same vertical gradient as `AdminBroadcastComposer` sheet (background → surface). */
    const renderSheetBackground = useCallback(
      () => (
        <View style={styles.sheetGradientHost}>
          <LinearGradient
            pointerEvents="none"
            colors={[colors.background, colors.surface]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      ),
      [colors.background, colors.surface],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.30}
          pressBehavior="close"
        />
      ),
      [],
    );

    const rowDir = isRtl ? 'row-reverse' : 'row';

    return (
      <BottomSheetModal
        ref={sheetRef}
        onDismiss={handleDismiss}
        animationConfigs={animationConfigs}
        backdropComponent={renderBackdrop}
        enableDynamicSizing
        enablePanDownToClose
        handleIndicatorStyle={styles.dragHandle}
        backgroundStyle={[styles.sheetBg, { backgroundColor: 'transparent' }]}
        backgroundComponent={renderSheetBackground}
        style={styles.sheetShadow}
      >
        <BottomSheetView
          style={[
            styles.container,
            { paddingBottom: insets.bottom + 28, backgroundColor: 'transparent' },
          ]}
        >
          {/* Header */}
          <View style={styles.headerBlock}>
            <Text style={[styles.title, { textAlign: isRtl ? 'right' : 'left' }]}>
              מה תרצה להוסיף?
            </Text>
            <Text style={[styles.subtitle, { textAlign: isRtl ? 'right' : 'left' }]}>
              בחרו תור ללקוח, תזכורת פנימית, או אילוץ שחוסם משבצות
            </Text>
          </View>

          {/* Options */}
          <View style={styles.optionList}>
            {/* Appointment — white fill on inner View so it paints reliably over the sheet gradient */}
            <Pressable onPress={onPickAppointment} accessibilityRole="button">
              {({ pressed }) => (
                <View
                  style={[
                    styles.optionCard,
                    styles.optionRow,
                    { flexDirection: rowDir },
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: primaryColor + '15' }]}>
                    <Calendar size={26} color={primaryColor} />
                  </View>
                  <View style={[styles.textCol, isRtl ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
                    <Text style={styles.optionTitle}>תור</Text>
                    <Text style={styles.optionHint}>קביעת תור ללקוח לפי שירות ושעה</Text>
                  </View>
                  <View style={[styles.chevronWrap, { transform: [{ scaleX: isRtl ? 1 : -1 }] }]}>
                    <Text style={[styles.chevron, { color: primaryColor }]}>›</Text>
                  </View>
                </View>
              )}
            </Pressable>

            {/* Reminder */}
            <Pressable onPress={onPickReminder} accessibilityRole="button">
              {({ pressed }) => (
                <View
                  style={[
                    styles.optionCard,
                    styles.optionRow,
                    { flexDirection: rowDir },
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: '#F1F3F4' }]}>
                    <StickyNote size={26} color="#5F6368" />
                  </View>
                  <View style={[styles.textCol, isRtl ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
                    <Text style={styles.optionTitle}>תזכורת ביומן</Text>
                    <Text style={styles.optionHint}>תזכורת לעצמך — לא חוסמת משבצות</Text>
                  </View>
                  <View style={[styles.chevronWrap, { transform: [{ scaleX: isRtl ? 1 : -1 }] }]}>
                    <Text style={[styles.chevron, { color: '#9CA3AF' }]}>›</Text>
                  </View>
                </View>
              )}
            </Pressable>

            {/* Constraints */}
            <Pressable onPress={onPickConstraints} accessibilityRole="button">
              {({ pressed }) => (
                <View
                  style={[
                    styles.optionCard,
                    styles.optionRow,
                    { flexDirection: rowDir },
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Ban size={26} color="#EF4444" />
                  </View>
                  <View style={[styles.textCol, isRtl ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
                    <Text style={styles.optionTitle}>אילוצים</Text>
                    <Text style={styles.optionHint}>חסימת זמן בלוח — לקוחות לא יוכלו לקבוע תור</Text>
                  </View>
                  <View style={[styles.chevronWrap, { transform: [{ scaleX: isRtl ? 1 : -1 }] }]}>
                    <Text style={[styles.chevron, { color: '#9CA3AF' }]}>›</Text>
                  </View>
                </View>
              )}
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBg: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  sheetGradientHost: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  sheetShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.10,
        shadowRadius: 20,
      },
      android: { elevation: 24 },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginTop: 2,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerBlock: {
    paddingTop: 8,
    paddingBottom: 20,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    writingDirection: 'rtl',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif-black' },
    }),
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 20,
    writingDirection: 'rtl',
  },
  optionList: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#1e293b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
    }),
  },
  optionRow: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  optionPressed: {
    backgroundColor: '#F3F4F6',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    writingDirection: 'rtl',
  },
  optionHint: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 18,
    writingDirection: 'rtl',
  },
  chevronWrap: {
    flexShrink: 0,
    width: 24,
    alignItems: 'center',
  },
  chevron: {
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 30,
  },
});
