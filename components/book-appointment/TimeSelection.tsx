import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getBookingStepBarTopFromBottom } from '@/components/book-appointment/BookingStepTabs';

export interface TimeSelectionProps {
  visible: boolean;
  styles: any;
  topOffset: number;
  listBottomPadding?: number;
  availableTimeSlots: string[];
  selectedTime: string | null;
  primaryColor: string;
  t: any;
  onSelectTime: (time: string) => void;
}

const NUM_COLUMNS = 3;
const ROW_GAP = 10;

export default function TimeSelection({
  visible,
  topOffset,
  listBottomPadding = 0,
  availableTimeSlots,
  selectedTime,
  primaryColor,
  t,
  onSelectTime,
}: TimeSelectionProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const barBottom = getBookingStepBarTopFromBottom(insets.bottom);

  const hPad = 20;
  const slotWidth =
    (windowWidth - hPad * 2 - ROW_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  if (!visible) return null;

  const header = (
    <View style={localStyles.header}>
      <Text style={localStyles.title}>{t('booking.selectTimeTitle', 'בחר שעה')}</Text>
      <Text style={localStyles.subtitle}>
        {t('booking.selectTimeSubtitle', 'בחר/י משבצת זמן פנויה')}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: string }) => {
    const selected = selectedTime === item;
    return (
      <Pressable
        onPress={() => onSelectTime(item)}
        style={({ pressed }) => [
          localStyles.slotCard,
          { width: slotWidth },
          selected && [localStyles.slotCardSelected, { borderColor: primaryColor }],
          pressed && localStyles.slotPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={item}
      >
        {selected ? (
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={primaryColor}
            style={[
              localStyles.slotCheck,
              I18nManager.isRTL ? { right: 6, left: undefined } : { left: 6, right: undefined },
            ]}
          />
        ) : null}
        <Ionicons
          name="time-outline"
          size={20}
          color={selected ? primaryColor : '#6B7280'}
        />
        <Text style={[localStyles.slotTime, selected && { color: primaryColor }]}>{item}</Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { bottom: barBottom, zIndex: 2 }]}
    >
      <View style={[localStyles.fillColumn, { paddingTop: Math.max(0, topOffset + 12) }]}>
        {availableTimeSlots && availableTimeSlots.length > 0 ? (
          <FlatList
            data={availableTimeSlots}
            keyExtractor={(item) => `t-${item}`}
            numColumns={NUM_COLUMNS}
            renderItem={renderItem}
            ListHeaderComponent={header}
            showsVerticalScrollIndicator
            removeClippedSubviews
            columnWrapperStyle={localStyles.columnWrapper}
            contentContainerStyle={[
              localStyles.listContent,
              {
                paddingHorizontal: hPad,
                paddingBottom: Math.max(listBottomPadding, 24),
              },
            ]}
            initialNumToRender={24}
            maxToRenderPerBatch={24}
            windowSize={7}
          />
        ) : (
          <View style={localStyles.emptyWrap}>
            {header}
            <View style={localStyles.emptyBody}>
              <Text style={localStyles.emptyTitle}>
                {t('booking.noSlots', 'אין שעות פנויות לתאריך שנבחר')}
              </Text>
              <Text style={localStyles.emptySub}>
                {t('booking.chooseAnotherDay', 'בחר/י יום אחר או חזור/י אחורה')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  fillColumn: {
    flex: 1,
  },
  header: {
    gap: 8,
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 4,
  },
  columnWrapper: {
    gap: ROW_GAP,
    marginBottom: ROW_GAP,
    justifyContent: 'flex-start',
  },
  slotCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'visible',
  },
  slotCardSelected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  slotPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  slotCheck: {
    position: 'absolute',
    top: 6,
  },
  slotTime: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
