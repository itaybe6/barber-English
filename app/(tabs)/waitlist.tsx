import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, StatusBar, Alert, Linking } from 'react-native';
import Colors from '@/constants/colors';
import { Phone, Trash2 } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import WaitlistClientCard from '@/components/WaitlistClientCard';
import { supabase, WaitlistEntry } from '@/lib/supabase';
import DaySelector from '@/components/DaySelector';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/src/theme/ThemeProvider';

// Helper function to format date as YYYY-MM-DD in local timezone
function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to fetch waitlist entries by date from Supabase
async function fetchWaitlistByDate(date: Date, userId?: string): Promise<WaitlistEntry[]> {
  try {
    const dateString = formatDateToLocalString(date); // Format: YYYY-MM-DD
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();
    
    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('requested_date', dateString)
      .eq('status', 'waiting');

    // Filter by user_id if provided (for admin users)
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching waitlist:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWaitlistByDate:', error);
    return [];
  }
}

// Function to update waitlist entry status
async function updateWaitlistStatus(entryId: string, status: 'contacted' | 'booked' | 'cancelled'): Promise<boolean> {
  try {
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();
    
    const { error } = await supabase
      .from('waitlist_entries')
      .update({ status })
      .eq('business_id', businessId)
      .eq('id', entryId);

    if (error) {
      console.error('Error updating waitlist status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWaitlistStatus:', error);
    return false;
  }
}

// Function to delete waitlist entry
async function deleteWaitlistEntry(entryId: string): Promise<boolean> {
  try {
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();
    
    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting waitlist entry:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWaitlistEntry:', error);
    return false;
  }
}

// Function to make phone call
async function makePhoneCall(phoneNumber: string) {
  try {
    const url = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(url);
    
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Unable to open the phone app');
    }
  } catch (error) {
    console.error('Error making phone call:', error);
    Alert.alert('Error', 'An error occurred while starting the call');
  }
}

// Map time period preference to English label
function formatTimePreference(period?: 'morning' | 'afternoon' | 'evening' | 'any'): string {
  switch (period) {
    case 'morning':
      return 'Morning';
    case 'afternoon':
      return 'Afternoon';
    case 'evening':
      return 'Evening';
    case 'any':
      return 'Any time';
    default:
      return '';
  }
}

// Fetch waitlist entries for a date range (inclusive)
async function fetchWaitlistForRange(startDate: Date, endDate: Date, userId?: string): Promise<WaitlistEntry[]> {
  try {
    const startStr = formatDateToLocalString(startDate);
    const endStr = formatDateToLocalString(endDate);
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();

    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .gte('requested_date', startStr)
      .lte('requested_date', endStr)
      .eq('status', 'waiting');

    // Filter by user_id if provided (for admin users)
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching waitlist range:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWaitlistForRange:', error);
    return [];
  }
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function PeriodTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View style={styles.periodTitleWrapper}>
      <Text style={[styles.periodTitleNew, { textAlign: 'left' }]}>{children}</Text>
      <View style={[styles.periodTitleAccent, { backgroundColor: color }]} />
    </View>
  );
}

export default function WaitlistScreen() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneToImage, setPhoneToImage] = useState<Record<string, string>>({});
  const { user } = useAuthStore();
  const colors = useColors();

  // Next 7 days (rolling from today)
  const weekDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(() => weekDays[0]);
  const selectedDateKey = useMemo(() => formatDateToLocalString(selectedDate), [selectedDate]);
  const monthYearLabel = useMemo(() => {
    return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedDate]);

  useEffect(() => {
    loadWeekWaitlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWeekWaitlist = async () => {
    setLoading(true);
    try {
      const start = weekDays[0];
      const end = weekDays[weekDays.length - 1];
      // Pass user.id to filter waitlist entries for this admin
      const data = await fetchWaitlistForRange(start, end, user?.id);
      setWaitlist(data);
      const uniquePhones = Array.from(new Set((data || []).map((e) => e.client_phone).filter(Boolean)));
      if (uniquePhones.length > 0) {
        const imagesMap = await fetchImagesForPhones(uniquePhones);
        setPhoneToImage(imagesMap);
      } else {
        setPhoneToImage({});
      }
    } catch (error) {
      console.error('Error loading waitlist week data:', error);
      Alert.alert('Error', 'An error occurred while loading the weekly waitlist');
    } finally {
      setLoading(false);
    }
  };

  const handleCallClient = async (phoneNumber: string) => {
    Alert.alert(
      'Contact',
      'Would you like to call this client?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => makePhoneCall(phoneNumber)
        }
      ]
    );
  };

  const handleDelete = async (entryId: string) => {
    Alert.alert(
      'Delete entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteWaitlistEntry(entryId);
            if (success) {
              loadWeekWaitlist();
              Alert.alert('Deleted', 'Entry deleted successfully');
            } else {
              Alert.alert('Error', 'An error occurred while deleting the entry');
            }
          }
        }
      ]
    );
  };

  // Group waitlist entries by requested_date
  const waitlistByDate: Record<string, WaitlistEntry[]> = useMemo(() => {
    const map: Record<string, WaitlistEntry[]> = {};
    for (const entry of waitlist) {
      const key = entry.requested_date; // YYYY-MM-DD
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    return map;
  }, [waitlist]);

  const markedDates = useMemo(() => new Set(Object.keys(waitlistByDate)), [waitlistByDate]);
  const selectedDayEntries = useMemo(() => waitlistByDate[selectedDateKey] || [], [waitlistByDate, selectedDateKey]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', marginTop: 8 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {/* Header styled similarly to appointments screen */}
      <View style={styles.headerLikeAppointments}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleColumn}>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>Waitlist</Text>
            <Text style={styles.headerSubtitle}>This week</Text>
          </View>
          <View style={styles.monthBadge}>
            <Text style={styles.monthText}>{monthYearLabel}</Text>
          </View>
        </View>
      </View>

      {/* Day selector: rolling 7 days from today, with marks for days that have waitlist entries */}
      <DaySelector
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        daysToShow={7}
        mode={'week'}
        startFromToday
        markedDates={markedDates}
      />

      <View style={[styles.waitlistBg, { marginTop: 0, paddingTop: 12 }]}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { flexDirection: 'column', padding: 16 }]} showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
          ) : selectedDayEntries.length > 0 ? (
            <View style={styles.cardsContainer}>
              {selectedDayEntries.map((entry) => {
                const baseTime = entry.created_at ? new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                const pref = formatTimePreference(entry.time_period);
                const time = pref ? `${baseTime} | ${pref}` : baseTime;
                return (
                  <View key={entry.id} style={styles.waitlistCard}>
                    <WaitlistClientCard
                      name={entry.client_name}
                      image={phoneToImage[entry.client_phone] || ''}
                      time={time}
                      type={entry.service_name}
                      tag="Waiting"
                    />
                    <View style={styles.actionButtons}>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.callButton, { borderColor: colors.primary }]}
                        onPress={() => handleCallClient(entry.client_phone)}
                      >
                        <Phone size={16} color={colors.primary} />
                        <Text style={[styles.actionButtonText, { color: colors.primary }]}>Contact</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDelete(entry.id)}
                      >
                        <Trash2 size={16} color="#FF3B30" />
                        <Text style={[styles.actionButtonText, { color: '#FF3B30' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No waitlist entries for this day</Text>
              <Text style={styles.emptySubtitle}>No clients are waiting for this day</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  logo: {},
  headerContainer: {
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 2,
    alignItems: 'center',
  },
  headerLikeAppointments: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'stretch',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleColumn: {
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  monthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  monthText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  screenSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  screenRangeText: {
    marginTop: 2,
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 8,
    marginTop: 8,
    alignSelf: 'center',
    minWidth: 220,
    maxWidth: 340,
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  calendarIcon: {
    marginRight: 10,
  },
  dateTextBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
  },
  dateText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 6,
    textAlign: 'left',
  },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  periodSection: { marginBottom: 24 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  dayHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(60,60,67,0.1)'
  },
  dayBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  dayBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  dayHeaderWeekday: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  dayHeaderMonthYear: {
    marginTop: 2,
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  dayHeaderAccent: {
    width: 6,
    height: 24,
    borderRadius: 3,
    marginRight: 8,
  },
  dayHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  periodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  periodIcon: {
    marginRight: 8,
  },
  periodTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'left' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  waitlistBg: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 12,
    position: 'relative',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  cardsContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  periodTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  periodTitleNew: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginLeft: 8,
  },
  periodTitleAccent: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  waitlistCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  callButton: {
    backgroundColor: '#F0F8FF',
    borderWidth: 1,
    borderColor: '#D6EBFF',
  },
  deleteButton: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFD6D6',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateSmall: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  emptyIconCircle: {
    backgroundColor: 'rgba(123,97,255,0.10)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d1d1f',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
}); 

// Fetch profile images for a list of phones from users table, fallback to clients table
async function fetchImagesForPhones(phones: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('phone, image_url')
      .in('phone', phones);
    if (!usersError && Array.isArray(users)) {
      users.forEach((u: any) => {
        if (u?.phone && u?.image_url) {
          map[u.phone] = u.image_url as string;
        }
      });
    }
  } catch (e) {
    // ignore
  }
  return map;
}