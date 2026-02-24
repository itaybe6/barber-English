import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  styles: any;
  topOffset: number;
  availableTimeSlots: string[];
  selectedTime: string | null;
  primaryColor: string;
  t: any;
  onSelectTime: (time: string) => void;
};

export default function TimeSelection({
  visible,
  styles,
  topOffset,
  availableTimeSlots,
  selectedTime,
  primaryColor,
  t,
  onSelectTime,
}: Props) {
  if (!visible) return null;

  return (
    <View>
      <View style={{ height: Math.max(0, topOffset + 12) }} />
      <View style={[styles.section, styles.calendarSectionCard]}>
        {availableTimeSlots && availableTimeSlots.length > 0 ? (
          <View style={styles.timeScrollBox}>
            <BlurView intensity={18} tint="light" style={styles.timeGridSharedBlur} />
            <FlatList
              data={availableTimeSlots}
              keyExtractor={(item) => `t-${item}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.glassTimeCard, selectedTime === item && styles.glassTimeCardSelected]}
                  onPress={() => onSelectTime(item)}
                  activeOpacity={0.92}
                >
                  <View style={styles.glassTimeTint} />
                  <View style={[styles.glassTimeSheen, selectedTime === item && styles.glassTimeSheenActive]} />
                  <View style={styles.glassTimeInnerBorder} />
                  {selectedTime === item && <View style={styles.glassTimeGlow} />}
                  <View style={styles.glassTimeContent}>
                    <Ionicons name="time-outline" size={18} color={selectedTime === item ? primaryColor : '#374151'} />
                    <Text style={[styles.glassTimeText, selectedTime === item && styles.glassTimeTextSelected]}>{item}</Text>
                  </View>
                  {selectedTime === item && (
                    <View style={styles.glassTimeCheck}>
                      <Ionicons name="checkmark-circle" size={20} color={primaryColor} />
                    </View>
                  )}
                </TouchableOpacity>
              )}
              numColumns={3}
              showsVerticalScrollIndicator
              removeClippedSubviews
              windowSize={7}
              initialNumToRender={21}
              maxToRenderPerBatch={21}
              updateCellsBatchingPeriod={50}
              decelerationRate="fast"
              contentContainerStyle={styles.timeGridList}
            />
          </View>
        ) : (
          <View style={styles.noSlotsContainer}>
            <Text style={styles.noSlotsText}>{t('booking.noSlots', 'אין שעות פנויות לתאריך שנבחר')}</Text>
            <Text style={styles.noSlotsSubtext}>{t('booking.chooseAnotherDay', 'בחר/י יום אחר או חזור/י אחורה')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

