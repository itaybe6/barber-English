import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'any';

interface TimePeriodOption {
  value: TimePeriod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}

const timePeriodOptions: TimePeriodOption[] = [
  {
    value: 'morning',
    label: 'Morning',
    icon: 'sunny',
    color: '#FF9500',
    description: '8:00 - 12:00',
  },
  {
    value: 'afternoon',
    label: 'Afternoon',
    icon: 'partly-sunny',
    color: '#FF6B6B',
    description: '12:00 - 16:00',
  },
  {
    value: 'evening',
    label: 'Evening',
    icon: 'moon',
    color: '#5856D6',
    description: '16:00 - 20:00',
  },
  {
    value: 'any',
    label: 'Any time',
    icon: 'time',
    color: '#34C759',
    description: 'Flexible timing',
  },
];

interface TimePeriodSelectorProps {
  selectedPeriod: TimePeriod | null;
  onSelectPeriod: (period: TimePeriod) => void;
  disabled?: boolean;
}

export default function TimePeriodSelector({
  selectedPeriod,
  onSelectPeriod,
  disabled = false,
}: TimePeriodSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select preferred time period</Text>
      <Text style={styles.subtitle}>
        We'll notify you when a slot opens in your preferred time period
      </Text>
      
      <View style={styles.optionsContainer}>
        {timePeriodOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionCard,
              selectedPeriod === option.value && styles.selectedOption,
              disabled && styles.disabledOption,
            ]}
            onPress={() => !disabled && onSelectPeriod(option.value)}
            activeOpacity={disabled ? 1 : 0.7}
            disabled={disabled}
          >
            <View style={[styles.iconContainer, { backgroundColor: option.color + '20' }]}>
              <Ionicons 
                name={option.icon} 
                size={24} 
                color={option.color} 
              />
            </View>
            
            <View style={styles.optionContent}>
              <Text style={[
                styles.optionLabel,
                selectedPeriod === option.value && styles.selectedOptionLabel,
                disabled && styles.disabledText,
              ]}>
                {option.label}
              </Text>
              <Text style={[
                styles.optionDescription,
                selectedPeriod === option.value && styles.selectedOptionDescription,
                disabled && styles.disabledText,
              ]}>
                {option.description}
              </Text>
            </View>
            
            {selectedPeriod === option.value && (
              <View style={[styles.checkmark, { backgroundColor: option.color }]}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedOption: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  disabledOption: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
    textAlign: 'left',
  },
  selectedOptionLabel: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionDescription: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'left',
  },
  selectedOptionDescription: {
    color: Colors.primary + 'CC',
  },
  disabledText: {
    color: '#C7C7CC',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 