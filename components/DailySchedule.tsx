
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// import { useFonts } from 'expo-font';
import { AvailableTimeSlot, supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColors } from '@/src/theme/ThemeProvider';

interface DailyScheduleProps {
  nextAppointment: AvailableTimeSlot | null;
  loading: boolean;
  onRefresh: () => void;
  todayAppointmentsCount: number;
  loadingTodayCount: boolean;
}

export default function DailySchedule({ nextAppointment, loading, onRefresh, todayAppointmentsCount, loadingTodayCount }: DailyScheduleProps) {
  const router = useRouter();
  const colors = useColors();
  const [clientImageUrl, setClientImageUrl] = useState<string | undefined>(undefined);
  const styles = createStyles(colors);
  // Remove custom font usage; rely on system/default fonts
  const getInitials = (fullName?: string | null): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return `${first}${second}`.toUpperCase();
  };

  const getColorForName = (name?: string | null): string => {
    const palette = [
      '#7B61FF', // purple
      '#34C759', // green
      '#FF9500', // orange
      '#FF2D55', // pink/red
      '#007AFF', // blue
      '#AF52DE', // violet
      '#5AC8FA', // light blue
      '#FF9F0A', // amber
    ];
    if (!name) return palette[0];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % palette.length;
    return palette[idx];
  };

  const formatTimeToHoursMinutes = (time?: string | null): string => {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return time;
  };

  // Load client's profile image for the next appointment
  useEffect(() => {
    let isMounted = true;
    setClientImageUrl(undefined);
    const fetchImage = async () => {
      try {
        if (!nextAppointment?.client_phone) return;
        const { data, error } = await supabase
          .from('users')
          .select('image_url')
          .eq('phone', nextAppointment.client_phone)
          .maybeSingle?.() ?? { data: null, error: null };
        // Fallback if maybeSingle is not available
        let finalData = data;
        if (!finalData && !error) {
          const { data: singleData } = await supabase
            .from('users')
            .select('image_url')
            .eq('phone', nextAppointment.client_phone)
            .single();
          finalData = singleData as any;
        }
        if (isMounted && finalData?.image_url) {
          setClientImageUrl(finalData.image_url);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchImage();
    return () => {
      isMounted = false;
    };
  }, [nextAppointment?.client_phone]);

  return (
    <View style={styles.container}>
      <View style={styles.dailyTitleWrapper}>
        <Text style={styles.dailyTitle}>Daily schedule</Text>
        <View style={styles.dailyTitleAccent} />
      </View>
      <View style={styles.cardsRow}>
        {/* Appointments Today Card (top) */}
        <TouchableOpacity 
          style={[styles.card, styles.cardAppointments]} 
          activeOpacity={0.85}
          onPress={() => router.push('/appointments')}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerIconCircle}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit'
              })} {new Date().toLocaleDateString('en-US', { weekday: 'short' })}
            </Text>
            {loadingTodayCount ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.timePillHeader}>
                <Text style={styles.timeTextPill}>
                  {todayAppointmentsCount} today
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Time Card (bottom) */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={onRefresh}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerIconCircle}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.nextTitle}>Next appointment</Text>
          </View>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : nextAppointment ? (
            <>
              <View style={styles.nextInfoRow}>
                <View style={styles.nextInfoRightColumn}>
                  <View style={styles.clientRow}>
                    <View style={styles.clientAvatar}>
                      {clientImageUrl ? (
                        <Image source={{ uri: clientImageUrl }} style={styles.clientAvatarImage} />
                      ) : (
                        <Image source={require('@/assets/images/user.png')} style={styles.clientAvatarImage} />
                      )}
                    </View>
                    <Text style={styles.clientNameBlack}>
                      {nextAppointment.client_name || 'Unknown client'}
                    </Text>
                  </View>
                  {nextAppointment.service_name && (
                    <Text style={styles.serviceText}>
                      {nextAppointment.service_name}
                    </Text>
                  )}
                </View>
                <Text style={styles.bigTimeText}>
                  {formatTimeToHoursMinutes(nextAppointment.slot_time)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No upcoming appointments today</Text>
              <Text style={styles.emptySubtitle}>No appointments scheduled for today</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 18,
    marginHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  cardsRow: {
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 86,
    marginHorizontal: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  cardNext: {},
  cardAppointments: {
    minHeight: 58,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    width: '100%',
  },
  // align icon and text to same baseline
  dateText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
    marginLeft: 6,
    textAlign: 'left',
    lineHeight: 20,
  },
  nextTitle: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
    marginLeft: 6,
    textAlign: 'left',
    lineHeight: 20,
  },
  icon: {
    marginLeft: 6,
  },
  headerIconCircle: {
    backgroundColor: `${colors.primary}15`, // 15% opacity of primary color
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
    textAlign: 'left',
  },
  cardLabelBlack: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222',
    marginBottom: 4,
    textAlign: 'left',
  },
  updatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginLeft: 5,
  },
  updatesText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'left',
  },
  clientName: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
    marginLeft: 6,
    textAlign: 'left',
    flex: 1,
  },
  clientNameBlack: {
    fontSize: 15,
    color: '#222',
    fontWeight: '700',
    marginLeft: 4,
    textAlign: 'left',
    flex: 1,
  },
  timeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222',
    marginTop: 8,
    textAlign: 'left',
  },
  bigTimeText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
    marginTop: -44,
    marginRight: 28,
  },
  nextInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginTop: 2,
  },
  nextInfoRightColumn: {
    flex: 1,
    alignItems: 'flex-start',
  },
  timeTextSmall: {
    fontSize: 16, // smaller font size for time
    fontWeight: 'bold',
    color: '#222',
    marginTop: 8,
    textAlign: 'left',
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginLeft: 0,
  },
  avatarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#eee',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  
  avatarPlusText: {
    color: '#222',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    width: '100%',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  detailsRight: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  detailsLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  clientAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 4,
    marginLeft: 0,
    overflow: 'hidden',
  },
  initialAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  initialsText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  timePill: {
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 10,
  },
  timePillHeader: {
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    paddingVertical: 2,
    paddingHorizontal: 10,
    marginLeft: 8,
    maxWidth: 120,
    flexShrink: 1,
  },
  timePillAppointments: {
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 0,
    marginBottom: 10,
  },
  timeTextPill: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#222',
    textAlign: 'center',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  cardLabelMargin: {
    marginBottom: 10,
  },
  avatarsRowMargin: {
    marginTop: 0,
  },
  dailyTitleWrapper: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    marginTop: 6,
    marginBottom: 14,
    marginLeft: 12,
  },
  dailyTitle: {
    fontSize: 22,
    color: '#222',
    fontWeight: '800',
    textAlign: 'left',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  dailyTitleAccent: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 0,
    marginLeft: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  noAppointmentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  noAppointmentText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    gap: 8,
    alignSelf: 'center',
    width: '100%',
  },
  emptyIconCircle: {
    backgroundColor: `${colors.primary}20`, // 20% opacity of primary color
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d1d1f',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  serviceText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'left',
    marginTop: 4,
    marginLeft: 8,
  },
}); 