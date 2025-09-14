import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { useColors } from '@/src/theme/ThemeProvider';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function PrimaryButton({ title, onPress, disabled, loading }: PrimaryButtonProps) {
  const colors = useColors();
  
  const dynamicStyles = StyleSheet.create({
    button: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      marginVertical: 16,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    text: {
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: 18,
      textAlign: 'center',
      width: '100%',
    },
  });

  return (
    <TouchableOpacity
      style={[dynamicStyles.button, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <View style={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={dynamicStyles.text}>{title}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
}); 