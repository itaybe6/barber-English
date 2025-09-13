import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, useColors } from '@/src/theme/ThemeProvider';

interface ThemedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const ThemedButton: React.FC<ThemedButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  style,
  textStyle,
}) => {
  const { theme } = useTheme();
  const colors = useColors();

  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled ? 0.5 : 1,
    };

    // Size styles
    const sizeStyles = {
      small: { paddingVertical: 8, paddingHorizontal: 16 },
      medium: { paddingVertical: 12, paddingHorizontal: 24 },
      large: { paddingVertical: 16, paddingHorizontal: 32 },
    };

    // Variant styles
    const variantStyles = {
      primary: {
        backgroundColor: colors.primary,
        borderWidth: 1,
        borderColor: colors.primary,
      },
      secondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.primary,
      },
      accent: {
        backgroundColor: colors.accent,
        borderWidth: 1,
        borderColor: colors.accent,
      },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: '600',
    };

    const sizeStyles = {
      small: { fontSize: 14 },
      medium: { fontSize: 16 },
      large: { fontSize: 18 },
    };

    const variantStyles = {
      primary: { color: '#ffffff' },
      secondary: { color: colors.primary },
      accent: { color: '#ffffff' },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[getTextStyle(), textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

// Example usage component
export const ThemeExample: React.FC = () => {
  const { theme, client } = useTheme();
  const colors = useColors();

  return (
    <div style={{ padding: 20, backgroundColor: colors.background }}>
      <h2 style={{ color: colors.text, marginBottom: 20 }}>
        Theme Example - Client: {client}
      </h2>
      
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ color: colors.text }}>Company: {theme.branding.companyName}</h3>
        <p style={{ color: colors.textSecondary }}>Website: {theme.branding.website}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <ThemedButton
          title="Primary Button"
          onPress={() => console.log('Primary pressed')}
          variant="primary"
        />
        <ThemedButton
          title="Secondary Button"
          onPress={() => console.log('Secondary pressed')}
          variant="secondary"
        />
        <ThemedButton
          title="Accent Button"
          onPress={() => console.log('Accent pressed')}
          variant="accent"
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <h4 style={{ color: colors.text }}>Color Palette:</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(colors).map(([name, color]) => (
            <div
              key={name}
              style={{
                width: 50,
                height: 50,
                backgroundColor: color,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ fontSize: 10, color: '#fff', textShadow: '1px 1px 1px #000' }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
