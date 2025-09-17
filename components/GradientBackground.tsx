import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface GradientBackgroundProps {
  width?: number;
  height?: number;
  style?: any;
  backgroundType?: string;
}

const GradientBackground: React.FC<GradientBackgroundProps> = ({ 
  width, 
  height, 
  style,
  backgroundType = 'gradient-background'
}) => {
  // Get colors based on background type
  const getBackgroundColors = (type: string) => {
    switch (type) {
      case 'gradient-background':
        return ['#667eea', '#764ba2', '#f093fb', '#f5576c'];
      case 'solid-blue-background':
        return ['#3b82f6', '#2563eb']; // Blue with subtle gradient
      case 'solid-purple-background':
        return ['#8b5cf6', '#7c3aed']; // Purple with subtle gradient
      case 'solid-green-background':
        return ['#10b981', '#059669']; // Green with subtle gradient
      case 'solid-orange-background':
        return ['#f59e0b', '#d97706']; // Orange with subtle gradient
      case 'light-silver-background':
        return ['#e5e7eb', '#d1d5db']; // Light silver with subtle gradient
      case 'light-white-background':
        return ['#ffffff', '#f9fafb']; // Light white with subtle gradient
      case 'light-gray-background':
        return ['#f3f4f6', '#e5e7eb']; // Light gray with subtle gradient
      case 'light-pink-background':
        return ['#fce7f3', '#fbcfe8']; // Light pink with subtle gradient
      case 'light-cyan-background':
        return ['#cffafe', '#a5f3fc']; // Light cyan with subtle gradient
      case 'light-lavender-background':
        return ['#ede9fe', '#ddd6fe']; // Light lavender with subtle gradient
      case 'light-coral-background':
        return ['#fed7d7', '#feb2b2']; // Light coral with subtle gradient
      case 'dark-black-background':
        return ['#1f2937', '#111827']; // Dark black with subtle gradient
      case 'dark-charcoal-background':
        return ['#374151', '#1f2937']; // Dark charcoal with subtle gradient
      default:
        return ['#667eea', '#764ba2', '#f093fb', '#f5576c'];
    }
  };

  const colors = getBackgroundColors(backgroundType);

  // Get circle colors based on background type for better visibility
  const getCircleColors = (type: string) => {
    const isLightBackground = type.includes('light-');
    if (isLightBackground) {
      return {
        circle1: 'rgba(0, 0, 0, 0.08)',
        circle2: 'rgba(0, 0, 0, 0.06)',
        circle3: 'rgba(0, 0, 0, 0.05)',
        circle4: 'rgba(0, 0, 0, 0.04)',
        circle5: 'rgba(0, 0, 0, 0.03)',
      };
    } else {
      return {
        circle1: 'rgba(255, 255, 255, 0.1)',
        circle2: 'rgba(255, 255, 255, 0.08)',
        circle3: 'rgba(255, 255, 255, 0.06)',
        circle4: 'rgba(255, 255, 255, 0.05)',
        circle5: 'rgba(255, 255, 255, 0.04)',
      };
    }
  };

  const circleColors = getCircleColors(backgroundType);

  return (
    <View style={[styles.container, style]}>
      {/* Main gradient background */}
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />
      
      {/* Overlay gradient for depth */}
      <LinearGradient
        colors={[
          'rgba(255, 255, 255, 0.1)',
          'rgba(255, 255, 255, 0.05)',
          'rgba(0, 0, 0, 0.1)'
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.overlay}
      />
      
      {/* Subtle blur effect */}
      <BlurView
        intensity={20}
        tint="light"
        style={styles.blur}
      />
      
      {/* Responsive decorative elements with dynamic colors */}
      <View style={[styles.decorativeCircle1, {
        top: -screenHeight * 0.08,
        right: -screenWidth * 0.12,
        width: screenWidth * 0.4,
        height: screenWidth * 0.4,
        borderRadius: screenWidth * 0.2,
        backgroundColor: circleColors.circle1,
      }]} />
      <View style={[styles.decorativeCircle2, {
        bottom: -screenHeight * 0.05,
        left: -screenWidth * 0.08,
        width: screenWidth * 0.25,
        height: screenWidth * 0.25,
        borderRadius: screenWidth * 0.125,
        backgroundColor: circleColors.circle2,
      }]} />
      <View style={[styles.decorativeCircle3, {
        top: screenHeight * 0.3,
        left: -screenWidth * 0.05,
        width: screenWidth * 0.2,
        height: screenWidth * 0.2,
        borderRadius: screenWidth * 0.1,
        backgroundColor: circleColors.circle3,
      }]} />
      
      {/* Additional responsive elements with dynamic colors */}
      <View style={[styles.decorativeCircle4, {
        top: screenHeight * 0.1,
        right: screenWidth * 0.05,
        width: screenWidth * 0.15,
        height: screenWidth * 0.15,
        borderRadius: screenWidth * 0.075,
        backgroundColor: circleColors.circle4,
      }]} />
      <View style={[styles.decorativeCircle5, {
        bottom: screenHeight * 0.2,
        right: screenWidth * 0.1,
        width: screenWidth * 0.18,
        height: screenWidth * 0.18,
        borderRadius: screenWidth * 0.09,
        backgroundColor: circleColors.circle5,
      }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    flex: 1, // Ensure it takes full available space
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  decorativeCircle1: {
    position: 'absolute',
  },
  decorativeCircle2: {
    position: 'absolute',
  },
  decorativeCircle3: {
    position: 'absolute',
  },
  decorativeCircle4: {
    position: 'absolute',
  },
  decorativeCircle5: {
    position: 'absolute',
  },
});

export default GradientBackground;
