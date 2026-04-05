import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  I18nManager,
  Platform,
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
  const barBottom = getBookingStepBarTopFromBottom(insets.bottom);

  if (!visible) return null;

  const header = (
    <View style={localStyles.header}>
      <Text style={localStyles.title}>{t('booking.selectTimeTitle', 'בחר שעה')}</Text>
      <Text style={localStyles.subtitle}>
        {t('booking.selectTimeSubtitle', 'סמן את השעה הרצויה למטה')}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: string }) => {
    const selected = selectedTime === item;
    return (
      <Pressable
        onPress={() => onSelectTime(item)}
        style={({ pressed }) => [
          localStyles.slotRow,
          selected && { borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.96)' },
          pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={item}
      >
        <Ionicons
          name={selected ? 'checkmark-circle' : 'time-outline'}
          size={18}
          color={selected ? primaryColor : '#9CA3AF'}
        />
        <Text style={localStyles.slotTime}>{item}</Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { bottom: barBottom, zIndex: 2 }]}
    >
      <View style={[localStyles.fillColumn, { paddingTop: Math.max(0, topOffset + 12) }]}>
        {/* Fixed header — does not scroll */}
        {header}

        {availableTimeSlots && availableTimeSlots.length > 0 ? (
          <FlatList
            data={availableTimeSlots}
            keyExtractor={(item) => `t-${item}`}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            contentContainerStyle={[
              localStyles.listContent,
              { paddingBottom: Math.max(listBottomPadding, 24) },
            ]}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={7}
          />
        ) : (
          <View style={localStyles.emptyBody}>
            <Text style={localStyles.emptyTitle}>
              {t('booking.noSlots', 'אין שעות פנויות לתאריך שנבחר')}
            </Text>
            <Text style={localStyles.emptySub}>
              {t('booking.chooseAnotherDay', 'בחר/י יום אחר או חזור/י אחורה')}
            </Text>
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
    marginBottom: 24,
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
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
    alignItems: 'center',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 22,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  slotTime: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
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
