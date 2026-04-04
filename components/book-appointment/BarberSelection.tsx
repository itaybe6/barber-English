import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { SharedValue } from 'react-native-reanimated';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
const AVATAR_SIZE = 56;

type Props = {
  visible: boolean;
  styles: any;
  introFadeStyle: any;
  topOffset: number;
  safeAreaBottom: number;
  isLoading: boolean;
  barbers: User[];
  selectedBarberId?: string | number | null;
  externalScrollX?: SharedValue<number>;
  t: any;
  onSelectBarber: (barber: User) => void;
};

export default function BarberSelection({
  visible,
  styles: parentStyles,
  introFadeStyle,
  topOffset = 0,
  safeAreaBottom,
  isLoading,
  barbers,
  selectedBarberId,
  t,
  onSelectBarber,
}: Props) {
  const { colors } = useBusinessColors();

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        parentStyles.section,
        introFadeStyle,
        {
          marginTop: Math.max(topOffset + 12, 16),
          /* Bottom clearance: parent ScrollView paddingBottom + “המשך” sits in flow under list */
          marginBottom: 0,
        },
      ]}
    >
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', marginTop: 12 }]}>
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : barbers.length > 0 ? (
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('booking.selectStaffTitle', 'בחירת איש צוות')}
            </Text>
            <Text style={styles.subtitle}>
              {t('booking.selectStaffSubtitle', 'סמן את הבחירה שלך למטה')}
            </Text>
          </View>

          <View style={styles.list}>
            {barbers.map((barber, index) => {
              const isSelected = String(barber.id ?? '') === String(selectedBarberId ?? '');
              const uri = (barber?.image_url as string | undefined) || '';

              return (
                <Pressable
                  key={String(barber.id ?? `barber-${index}`)}
                  onPress={() => onSelectBarber(barber)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={barber.name || t('booking.step.barber', 'Barber')}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  {/* Avatar — outside the card, right side, white thick border */}
                  <View style={styles.avatarRing}>
                    <View
                      style={[
                        styles.avatarWrap,
                        !uri && { backgroundColor: `${colors.primary}20` },
                      ]}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.avatar} resizeMode="cover" />
                      ) : (
                        <Ionicons name="person" size={26} color={colors.primary} />
                      )}
                    </View>
                  </View>

                  {/* Name pill — wraps content, not full width */}
                  <View
                    style={[
                      styles.namePill,
                      isSelected
                        ? { backgroundColor: 'rgba(255,255,255,0.97)', borderColor: colors.primary, borderWidth: 1.5 }
                        : { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'transparent', borderWidth: 1.5 },
                    ]}
                  >
                    <Text style={styles.name} numberOfLines={1}>
                      {barber.name || ''}
                    </Text>

                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.primary}
                        style={styles.checkIcon}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.loadingState}>
          <Ionicons name="people-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text style={[parentStyles.loadingText, { color: '#9CA3AF', fontSize: 17 }]}>
            {t('booking.noBarbers', 'No specialists available')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 36,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: 8,
    alignItems: 'center',
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
  list: {
    gap: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  /* Each item row — RTL: avatar on right, pill on left */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    direction: 'rtl',
    gap: 10,
  },
  rowPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },

  /* Avatar ring — sits outside the pill */
  avatarRing: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },

  /* Name pill — shrinks to content */
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    textAlign: 'right',
  },
  checkIcon: {
    marginRight: 2,
  },
});
