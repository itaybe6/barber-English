import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';

interface ColorPickerProps {
  currentColor?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  currentColor = '#000000',
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const { colors } = useBusinessColors();

  React.useEffect(() => {
    setSelectedColor(currentColor);
  }, [currentColor]);

  React.useEffect(() => {
    if (colors.primary) {
      setSelectedColor(colors.primary);
    }
  }, [colors.primary]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('color.primary', 'Primary Color')}</Text>
      <View style={styles.selectionRow}>
        <View style={styles.chosenGroup}>
          <View style={[styles.chosenSwatch, { backgroundColor: selectedColor }]} />
          <Text style={styles.chosenLabel}>{t('color.chosenLabel', 'Chosen color')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.changeColorButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(tabs)/pick-primary-color')}
          activeOpacity={0.85}
        >
          <Text style={styles.changeColorButtonText}>
            {t('color.changeColor', 'Change color')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  label: {
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
    textAlign: 'left',
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  chosenGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  chosenSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chosenLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  changeColorButton: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  changeColorButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.25,
  },
});
