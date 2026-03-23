import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  SharedValue,
} from 'react-native-reanimated';

import type { User } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const SCREEN = Dimensions.get('window');

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
  topOffset,
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
        parentStyles.sectionFullBleed,
        introFadeStyle,
        { flex: 1, minHeight: SCREEN.height * 0.7 },
      ]}
    >
      {isLoading ? (
        <View style={[parentStyles.loadingContainer, { flex: 1, justifyContent: 'center' }]}>
          <Text style={[parentStyles.loadingText, { color: '#FFFFFF' }]}>
            {t('booking.loadingEmployees', 'Loading Employees...')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Math.max(safeAreaBottom, 20) + 160,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(400)}
            style={s.headerWrap}
          >
            <Text style={s.headerTitle}>
              {t('booking.selectBarber', 'Choose your specialist')}
            </Text>
            <Text style={s.headerSub}>
              {t('booking.selectBarberHint', 'Who would you like to book with?')}
            </Text>
          </Animated.View>

          {/* Barber cards */}
          <View style={s.grid}>
            {barbers.map((barber, idx) => {
              const isSelected = String(barber.id) === String(selectedBarberId ?? '');
              const imageUri = barber?.image_url || '';

              return (
                <Animated.View
                  key={barber.id}
                  entering={FadeInDown.delay(120 + idx * 60).duration(400)}
                >
                  <TouchableOpacity
                    onPress={() => onSelectBarber(barber)}
                    activeOpacity={0.88}
                    style={[
                      s.card,
                      isSelected && [s.cardSelected, { borderColor: colors.primary }],
                    ]}
                  >
                    {/* Photo */}
                    <View style={s.avatarWrap}>
                      {imageUri ? (
                        <Image
                          source={{ uri: imageUri }}
                          style={s.avatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[s.avatarImage, s.avatarPlaceholder]}>
                          <Ionicons name="person" size={44} color="rgba(255,255,255,0.5)" />
                        </View>
                      )}
                      {isSelected && (
                        <View style={[s.checkBadge, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View style={s.info}>
                      <Text
                        numberOfLines={1}
                        style={[s.name, isSelected && { color: colors.primary }]}
                      >
                        {barber.name}
                      </Text>
                      {(barber as any)?.role ? (
                        <Text numberOfLines={1} style={s.role}>
                          {(barber as any).role}
                        </Text>
                      ) : null}
                    </View>

                    {/* Selected glow ring */}
                    {isSelected && (
                      <View
                        style={[
                          s.glowRing,
                          { borderColor: colors.primary, shadowColor: colors.primary },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  headerWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
  },
  grid: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    padding: 14,
    borderWidth: 2.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
    transform: [{ scale: 1.015 }],
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    zIndex: 2,
  },
  info: {
    flex: 1,
    marginLeft: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  role: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 3,
  },
  glowRing: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 23,
    borderWidth: 2.5,
    opacity: 0.25,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 0,
  },
});
