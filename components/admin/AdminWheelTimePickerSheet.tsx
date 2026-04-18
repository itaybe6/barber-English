import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

/** Match `app/(tabs)/business-hours.tsx` TimePicker + WheelPicker */
const SheetColors = {
  card: '#FFFFFF',
  text: '#1C1C1E',
};

function formatHHMM(time?: string | null): string {
  if (!time) return '';
  const parts = String(time).split(':');
  if (parts.length >= 2) {
    const hh = parts[0]?.padStart(2, '0') ?? '';
    const mm = parts[1]?.padStart(2, '0') ?? '';
    return `${hh}:${mm}`;
  }
  return String(time);
}

function formatAMPM(time?: string | null): string {
  if (!time) return '';
  const parts = String(time).split(':');
  if (parts.length >= 2) {
    const hours24 = Number(parts[0]);
    const minutes = (parts[1] ?? '00').padStart(2, '0');
    if (Number.isNaN(hours24)) return formatHHMM(time);
    const isPM = hours24 >= 12;
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  }
  return String(time);
}

function formatDisplayTime(time?: string | null, useAmPm?: boolean): string {
  return useAmPm ? formatAMPM(time) : formatHHMM(time);
}

function AdminWheelPicker({
  options,
  value,
  onChange,
  accentColor,
  useAmPm,
  openKey,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  accentColor: string;
  useAmPm: boolean;
  openKey: string;
}) {
  const listRef = useRef<ScrollView | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, options.findIndex((o) => o === value)));

  useEffect(() => {
    const idx = Math.max(0, options.findIndex((o) => o === value));
    setSelectedIndex(idx);
    const doScroll = (animated: boolean) => {
      listRef.current?.scrollTo({ y: idx * 44, animated });
    };
    const rafId = requestAnimationFrame(() => doScroll(false));
    const interactionHandle = InteractionManager.runAfterInteractions(() => doScroll(false));
    const timerId = setTimeout(() => doScroll(false), 80);
    return () => {
      cancelAnimationFrame(rafId);
      (interactionHandle as { cancel?: () => void })?.cancel?.();
      clearTimeout(timerId);
    };
  }, [value, options, openKey]);

  const handleMomentumEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const idx = Math.round(offsetY / 44);
    const clamped = Math.min(options.length - 1, Math.max(0, idx));
    setSelectedIndex(clamped);
    onChange(options[clamped]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ y: clamped * 44, animated: true });
    });
  };

  return (
    <View style={localStyles.wheelContainer}>
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 220 / 2 - 22,
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: accentColor,
          backgroundColor: 'rgba(0,0,0,0.03)',
        }}
      />
      <ScrollView
        key={openKey || value}
        ref={(ref) => {
          listRef.current = ref;
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={44}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        contentOffset={{ x: 0, y: Math.max(0, options.findIndex((o) => o === value)) * 44 }}
        onLayout={() => {
          const idx = Math.max(0, options.findIndex((o) => o === value));
          listRef.current?.scrollTo({ y: idx * 44, animated: false });
        }}
        onContentSizeChange={() => {
          const idx = Math.max(0, options.findIndex((o) => o === value));
          listRef.current?.scrollTo({ y: idx * 44, animated: false });
        }}
      >
        <View style={{ height: 220 / 2 - 22 }} />
        {options.map((opt, i) => {
          const active = i === selectedIndex;
          return (
            <View key={opt} style={localStyles.wheelItem}>
              <Text style={[localStyles.wheelText, active && { color: accentColor }]}>
                {formatDisplayTime(opt, useAmPm)}
              </Text>
            </View>
          );
        })}
        <View style={{ height: 220 / 2 - 22 }} />
      </ScrollView>
    </View>
  );
}

export type AdminWheelTimePickerSheetProps = {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  useAmPm: boolean;
  primaryColor: string;
  onConfirm: (hhmm: string) => void;
  onClose: () => void;
};

/**
 * Same motion + layout as `TimePicker` in `app/(tabs)/business-hours.tsx`.
 */
export default function AdminWheelTimePickerSheet({
  visible,
  title,
  options,
  value,
  useAmPm,
  primaryColor,
  onConfirm,
  onClose,
}: AdminWheelTimePickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [displayed, setDisplayed] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [openTick, setOpenTick] = useState(0);
  const tempValueRef = useRef(value);
  const onConfirmRef = useRef(onConfirm);
  const onCloseRef = useRef(onClose);
  onConfirmRef.current = onConfirm;
  onCloseRef.current = onClose;

  const displayedRef = useRef(false);
  const closingRef = useRef(false);
  const prevValueRef = useRef(value);

  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const animateClose = useCallback(
    (onDone: () => void) => {
      translateY.value = withSpring(600, { damping: 24, stiffness: 260, mass: 0.9 });
      backdropOpacity.value = withTiming(0, { duration: 220 }, () => {
        runOnJS(onDone)();
      });
    },
    [translateY, backdropOpacity],
  );

  const runOpenAnimation = useCallback(() => {
    translateY.value = 600;
    backdropOpacity.value = 0;
    requestAnimationFrame(() => {
      translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
      backdropOpacity.value = withTiming(1, { duration: 260 });
    });
  }, [translateY, backdropOpacity]);

  const safeAnimateClose = useCallback(
    (onDone: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      animateClose(() => {
        closingRef.current = false;
        onDone();
      });
    },
    [animateClose],
  );

  /** Open / sync wheel when parent `visible`; play exit when parent hides without our handlers */
  useEffect(() => {
    if (!visible) {
      if (displayedRef.current) {
        safeAnimateClose(() => {
          displayedRef.current = false;
          setDisplayed(false);
        });
      }
      return;
    }
    const opening = !displayedRef.current;
    if (opening) {
      displayedRef.current = true;
      setDisplayed(true);
      tempValueRef.current = value;
      setTempValue(value);
      setOpenTick((n) => n + 1);
      runOpenAnimation();
    } else if (value !== prevValueRef.current) {
      tempValueRef.current = value;
      setTempValue(value);
      setOpenTick((n) => n + 1);
    }
    prevValueRef.current = value;
  }, [visible, value, safeAnimateClose, runOpenAnimation]);

  const handleClose = useCallback(() => {
    safeAnimateClose(() => {
      displayedRef.current = false;
      setDisplayed(false);
      onCloseRef.current();
    });
  }, [safeAnimateClose]);

  const handleConfirm = useCallback(() => {
    const val = tempValueRef.current;
    safeAnimateClose(() => {
      displayedRef.current = false;
      setDisplayed(false);
      onConfirmRef.current(val);
    });
  }, [safeAnimateClose]);

  const handleTempChange = useCallback((v: string) => {
    tempValueRef.current = v;
    setTempValue(v);
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const gradientColors: [string, string] = [primaryColor, `${primaryColor}CC`];

  const modalVisible = visible || displayed;

  if (!modalVisible) return null;

  return (
    <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <Animated.View style={[StyleSheet.absoluteFill, localStyles.modalOverlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[localStyles.bottomSheet, sheetStyle]}>
        <View style={localStyles.sheetHandle} />

        <View style={localStyles.sheetHeader}>
          <Text style={localStyles.sheetTitle}>{title}</Text>
        </View>

        <AdminWheelPicker
          options={options}
          value={tempValue}
          onChange={handleTempChange}
          accentColor={primaryColor}
          useAmPm={useAmPm}
          openKey={`${openTick}-${tempValue}`}
        />

        <View style={[localStyles.sheetConfirmRow, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity onPress={handleConfirm} activeOpacity={0.88} style={localStyles.sheetConfirmTouchable}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={localStyles.sheetConfirmGradient}
            >
              <Ionicons name="checkmark" size={20} color="#FFFFFF" style={{ marginEnd: 8 }} />
              <Text style={localStyles.sheetConfirmText}>{t('confirm')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SheetColors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(60, 60, 67, 0.18)',
    marginBottom: 12,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SheetColors.text,
    letterSpacing: -0.3,
  },
  sheetConfirmRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetConfirmTouchable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  sheetConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
  },
  sheetConfirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  wheelContainer: {
    height: 220,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  wheelItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 20,
    fontWeight: '600',
    color: SheetColors.text,
  },
});
