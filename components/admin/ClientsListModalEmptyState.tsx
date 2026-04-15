import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ClientsListModalEmptyStateProps {
  primaryColor: string;
  primaryOnSurface: string;
  textColor: string;
  textSecondaryColor: string;
  surfaceColor: string;
  title: string;
  subtitle?: string;
}

/**
 * Empty state for the admin clients bottom sheet — minimal icon + title + optional hint (no card/gradient).
 */
export function ClientsListModalEmptyState({
  primaryColor,
  primaryOnSurface,
  textColor,
  textSecondaryColor,
  surfaceColor,
  title,
  subtitle,
}: ClientsListModalEmptyStateProps) {
  const a11y = subtitle ? `${title}. ${subtitle}` : title;
  return (
    <View style={styles.outer} accessibilityLabel={a11y}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: surfaceColor,
            borderColor: `${primaryColor}22`,
          },
        ]}
      >
        <Ionicons name="people-outline" size={28} color={primaryOnSurface} />
      </View>
      <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: textSecondaryColor }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 28,
    width: '100%',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.25,
    lineHeight: 24,
    maxWidth: 300,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: -0.1,
    maxWidth: 288,
    opacity: 0.88,
  },
});
