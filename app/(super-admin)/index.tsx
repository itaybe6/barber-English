import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { superAdminApi, BusinessOverview } from '@/lib/api/superAdmin';

const ACCENT = '#6C5CE7';
const ACCENT_LIGHT = '#A29BFE';
const BG = '#F8F9FD';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [businesses, setBusinesses] = useState<BusinessOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newBizName, setNewBizName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newColor, setNewColor] = useState('#000000');

  const loadBusinesses = useCallback(async () => {
    const data = await superAdminApi.getAllBusinesses();
    setBusinesses(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadBusinesses();
      setLoading(false);
    })();
  }, [loadBusinesses]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBusinesses();
    setRefreshing(false);
  }, [loadBusinesses]);

  const totalClients = businesses.reduce((sum, b) => sum + b.clientCount, 0);
  const totalAdmins = businesses.reduce((sum, b) => sum + b.adminCount, 0);

  const handleCreate = async () => {
    if (!newBizName.trim() || !newAdminName.trim() || !newAdminPhone.trim() || !newAdminPassword.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    setCreating(true);
    const result = await superAdminApi.createBusiness({
      businessName: newBizName.trim(),
      adminName: newAdminName.trim(),
      adminPhone: newAdminPhone.trim(),
      adminPassword: newAdminPassword.trim(),
      address: newAddress.trim(),
      primaryColor: newColor.trim(),
    });
    setCreating(false);

    if (result) {
      Alert.alert('Success', `Business "${newBizName}" created successfully!\n\nBusiness ID:\n${result.businessId}\n\n3 default services were added.`);
      setShowAddModal(false);
      resetForm();
      await loadBusinesses();
    } else {
      Alert.alert('Error', 'Failed to create business. Check console for details.');
    }
  };

  const resetForm = () => {
    setNewBizName('');
    setNewAdminName('');
    setNewAdminPhone('');
    setNewAdminPassword('');
    setNewAddress('');
    setNewColor('#000000');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const renderStatCard = (label: string, value: number, icon: string, color: string) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderBusinessCard = ({ item }: { item: BusinessOverview }) => (
    <View style={styles.bizCard}>
      <View style={styles.bizHeader}>
        <View style={[styles.bizAvatar, { backgroundColor: item.primary_color || ACCENT }]}>
          <Text style={styles.bizAvatarText}>
            {(item.display_name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.bizInfo}>
          <Text style={styles.bizName} numberOfLines={1}>
            {item.display_name || 'Unnamed Business'}
          </Text>
          {item.address ? (
            <Text style={styles.bizAddress} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bizStats}>
        <View style={styles.bizStatItem}>
          <Ionicons name="people" size={16} color={ACCENT} />
          <Text style={styles.bizStatText}>{item.clientCount} clients</Text>
        </View>
        <View style={styles.bizStatItem}>
          <Ionicons name="shield-checkmark" size={16} color="#E17055" />
          <Text style={styles.bizStatText}>{item.adminCount} admins</Text>
        </View>
        {item.phone ? (
          <View style={styles.bizStatItem}>
            <Ionicons name="call" size={16} color="#00B894" />
            <Text style={styles.bizStatText}>{item.phone}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bizFooter}>
        <Text style={styles.bizId} numberOfLines={1}>ID: {item.id}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Loading businesses...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Super Admin</Text>
          <Text style={styles.headerSubtitle}>Business Management Dashboard</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={renderBusinessCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              {renderStatCard('Apps', businesses.length, 'apps', ACCENT)}
              {renderStatCard('Clients', totalClients, 'people', '#00B894')}
              {renderStatCard('Admins', totalAdmins, 'shield-checkmark', '#E17055')}
            </View>

            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
              <Ionicons name="add-circle" size={24} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add New Business</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>All Businesses</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={TEXT_SECONDARY} />
            <Text style={styles.emptyText}>No businesses yet</Text>
            <Text style={styles.emptySubtext}>Tap the button above to add your first business</Text>
          </View>
        }
      />

      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
              <Ionicons name="close" size={28} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Business</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Business Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Sarah's Nail Studio"
              placeholderTextColor="#9CA3AF"
              value={newBizName}
              onChangeText={setNewBizName}
            />

            <Text style={styles.fieldLabel}>Admin Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Sarah Cohen"
              placeholderTextColor="#9CA3AF"
              value={newAdminName}
              onChangeText={setNewAdminName}
            />

            <Text style={styles.fieldLabel}>Admin Phone *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 0501234567"
              placeholderTextColor="#9CA3AF"
              value={newAdminPhone}
              onChangeText={setNewAdminPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Admin Password *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Password for the admin account"
              placeholderTextColor="#9CA3AF"
              value={newAdminPassword}
              onChangeText={setNewAdminPassword}
              secureTextEntry
            />

            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Tel Aviv, Dizengoff 50"
              placeholderTextColor="#9CA3AF"
              value={newAddress}
              onChangeText={setNewAddress}
            />

            <Text style={styles.fieldLabel}>Primary Color</Text>
            <View style={styles.colorRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="#000000"
                placeholderTextColor="#9CA3AF"
                value={newColor}
                onChangeText={setNewColor}
                autoCapitalize="none"
              />
              <View style={[styles.colorPreview, { backgroundColor: newColor }]} />
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color={ACCENT} />
              <Text style={styles.infoText}>
                3 default services will be created automatically: Gel Nails, Gel Removal, and Manicure.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={creating}
              activeOpacity={0.85}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="rocket" size={20} color="#FFFFFF" />
                  <Text style={styles.createButtonText}>Create Business</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: TEXT_PRIMARY,
  },
  headerSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
  },
  statLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 24,
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  bizCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bizAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bizInfo: {
    flex: 1,
    marginLeft: 12,
  },
  bizName: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  bizAddress: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  bizStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F5',
  },
  bizStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bizStatText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: '500',
  },
  bizFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F5',
  },
  bizId: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  emptySubtext: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: BG,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: TEXT_PRIMARY,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorPreview: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: ACCENT + '10',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
    gap: 8,
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
