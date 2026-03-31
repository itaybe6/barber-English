import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { superAdminApi, BusinessOverview } from '@/lib/api/superAdmin';
import { getExpoExtra } from '@/lib/getExtra';
import { PulseemBusinessModal } from '@/components/superAdmin/PulseemBusinessModal';

/** iOS-style system palette (Super Admin is its own shell — not tenant-themed) */
const ACCENT = '#007AFF';
const ACCENT_DARK = '#0056CC';
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const PINK = '#FF2D55';
const INDIGO = '#5856D6';
const BG = '#F2F2F7';
const CARD_BG = '#FFFFFF';
const CARD_BORDER = 'rgba(60,60,67,0.12)';
const TEXT_PRIMARY = '#000000';
const TEXT_SECONDARY = '#3C3C43';
const TEXT_TERTIARY = '#8E8E93';
const TEXT_MUTED = '#AEAEB2';
const SEPARATOR = 'rgba(60,60,67,0.18)';

const shadowCard = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  default: { elevation: 2 },
});

type TabKey = 'dashboard' | 'add' | 'settings';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [businesses, setBusinesses] = useState<BusinessOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newBizName, setNewBizName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newColor, setNewColor] = useState('#000000');
  const [logoAsset, setLogoAsset] = useState<{ uri: string; base64: string } | null>(null);
  const [iconAsset, setIconAsset] = useState<{ uri: string; base64: string } | null>(null);
  const [splashAsset, setSplashAsset] = useState<{ uri: string; base64: string } | null>(null);
  const [newPulseemApiKey, setNewPulseemApiKey] = useState('');
  const [newPulseemFromNumber, setNewPulseemFromNumber] = useState('');
  const [newPulseemWsUserId, setNewPulseemWsUserId] = useState('');
  const [newPulseemWsPassword, setNewPulseemWsPassword] = useState('');
  const [newPulseemSubPassword, setNewPulseemSubPassword] = useState('');

  const extra = getExpoExtra();
  const hasPulseemMainKey = !!String(extra.PULSEEM_MAIN_API_KEY ?? '').replace(/^\uFEFF/, '').trim();
  const [pulseModalBiz, setPulseModalBiz] = useState<BusinessOverview | null>(null);
  const [deleteConfirmBiz, setDeleteConfirmBiz] = useState<BusinessOverview | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<{ title: string; message: string } | null>(null);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBusinesses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) =>
        (b.display_name || '').toLowerCase().includes(q) ||
        (b.address || '').toLowerCase().includes(q) ||
        (b.branding_client_name || '').toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.phone || '').toLowerCase().includes(q) ||
        (b.adminPhone || '').toLowerCase().includes(q),
    );
  }, [businesses, searchQuery]);

  const buildDeleteSuccessMessage = (item: BusinessOverview) => {
    const folder = item.branding_client_name?.trim();
    const storageLine =
      'מ־Storage נמחקו גם ברנדינג, גלריה, באנר בית, תמונות פרופיל וקבלות הוצאות (ככל שנשמרו ב-Supabase).';
    if (!folder) {
      return `האפליקציה נמחקה מהשרת.\n${storageLine}\n\nלא נשמר שם תיקיית ברנדינג — אם יש תיקייה מקומית ב־branding/, מחק אותה ידנית.`;
    }
    return `האפליקציה נמחקה מהשרת.\n${storageLine}\n\nכדי למחוק גם את התיקייה המקומית בפרויקט (branding/${folder}), הרץ בטרמינל בשורש הפרויקט:\n\nnode scripts/delete-branding.mjs ${folder}`;
  };

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

  const pickImage = async (setter: (v: { uri: string; base64: string } | null) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0] as any;
      if (a.base64) {
        setter({ uri: a.uri, base64: a.base64 });
      }
    }
  };

  const handleCreate = async () => {
    const trimmedClient = newClientName.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!newBizName.trim() || !trimmedClient || !newAdminName.trim() || !newAdminPhone.trim() || !newAdminPassword.trim()) {
      Alert.alert('שדות חסרים', 'יש למלא את כל השדות המסומנים בכוכבית.');
      return;
    }
    if (!/^[a-zA-Z]/.test(trimmedClient)) {
      Alert.alert('שם אפליקציה לא תקין', 'שם האפליקציה (באנגלית) חייב להתחיל באות.');
      return;
    }

    setCreating(true);
    const result = await superAdminApi.createBusiness({
      businessName: newBizName.trim(),
      clientName: trimmedClient,
      adminName: newAdminName.trim(),
      adminPhone: newAdminPhone.trim(),
      adminPassword: newAdminPassword.trim(),
      address: newAddress.trim(),
      primaryColor: newColor.trim(),
      logoBase64: logoAsset?.base64,
      iconBase64: iconAsset?.base64,
      splashBase64: splashAsset?.base64,
      pulseemSubPassword: newPulseemSubPassword.trim() || undefined,
      pulseemFromNumber: newPulseemFromNumber.trim() || undefined,
      pulseemApiKey: newPulseemApiKey.trim() || undefined,
      pulseemWsUserId: newPulseemWsUserId.trim() || undefined,
      pulseemWsPassword: newPulseemWsPassword.trim() || undefined,
    });
    setCreating(false);

    if (result) {
      const pulseemLine = result.pulseemCreated
        ? '\n\n✅ חשבון Pulseem נוצר אוטומטית (20 DirectSmsCredits)'
        : result.pulseemError
        ? `\n\n⚠️ Pulseem לא הוגדר: ${result.pulseemError}`
        : !hasPulseemMainKey
        ? '\n\n⚠️ הגדר PULSEEM_MAIN_API_KEY_B64 ב-.env (Base64 — Expo חותך $) והפעל מחדש את Metro'
        : '';

      Alert.alert(
        'נוצר בהצלחה!',
        `העסק "${newBizName}" נוצר בהצלחה.\n\nמזהה עסק:\n${result.businessId}\n\nשם אפליקציה: ${result.clientName}${pulseemLine}\n\nכדי להוריד את תיקיית הברנדינג הרץ:\nnode scripts/pull-branding.mjs ${result.clientName}`,
      );
      resetForm();
      await loadBusinesses();
      setActiveTab('dashboard');
    } else {
      Alert.alert('שגיאה', 'יצירת העסק נכשלה. נסה שוב.');
    }
  };

  const resetForm = () => {
    setNewBizName('');
    setNewClientName('');
    setNewAdminName('');
    setNewAdminPhone('');
    setNewAdminPassword('');
    setNewAddress('');
    setNewColor('#000000');
    setLogoAsset(null);
    setIconAsset(null);
    setSplashAsset(null);
    setNewPulseemApiKey('');
    setNewPulseemFromNumber('');
    setNewPulseemWsUserId('');
    setNewPulseemWsPassword('');
    setNewPulseemSubPassword('');
  };

  const handleDelete = (item: BusinessOverview) => {
    setDeleteConfirmBiz(item);
  };

  const closeDeleteConfirm = () => {
    if (!deleteInProgress) setDeleteConfirmBiz(null);
  };

  const runConfirmedDelete = async () => {
    const item = deleteConfirmBiz;
    if (!item) return;
    const snapshot = item;
    setDeleteInProgress(true);
    setLoading(true);
    const success = await superAdminApi.deleteBusiness(snapshot.id);
    setDeleteInProgress(false);
    setDeleteConfirmBiz(null);
    setLoading(false);
    if (success) {
      setFeedbackDialog({ title: 'נמחק', message: buildDeleteSuccessMessage(snapshot) });
      await loadBusinesses();
    } else {
      setFeedbackDialog({ title: 'שגיאה', message: 'מחיקת האפליקציה נכשלה.' });
    }
  };

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
  };

  const runConfirmedLogout = () => {
    setLogoutConfirmVisible(false);
    logout();
    router.replace('/login');
  };

  // ─── Image Picker Tile ───
  const renderImagePicker = (label: string, asset: { uri: string; base64: string } | null, setter: (v: { uri: string; base64: string } | null) => void, hint: string) => (
    <View style={styles.imgPickerWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.imgPickerBtn} onPress={() => pickImage(setter)} activeOpacity={0.7}>
        {asset ? (
          <Image source={{ uri: asset.uri }} style={styles.imgPickerPreview} />
        ) : (
          <View style={styles.imgPickerEmpty}>
            <Ionicons name="cloud-upload-outline" size={28} color={ACCENT} />
            <Text style={styles.imgPickerHint}>{hint}</Text>
          </View>
        )}
      </TouchableOpacity>
      {asset && (
        <TouchableOpacity style={styles.imgRemoveBtn} onPress={() => setter(null)}>
          <Ionicons name="trash-outline" size={14} color="#FF3B30" />
          <Text style={styles.imgRemoveText}>הסר</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ─── Tab: Dashboard ───
  const renderDashboard = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>טוען נתונים...</Text>
        </View>
      );
    }

    const emptyBecauseFilter = businesses.length > 0 && filteredBusinesses.length === 0;

    return (
      <FlatList
        data={filteredBusinesses}
        keyExtractor={(item) => item.id}
        renderItem={renderBusinessCard}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <View style={[styles.statCardApple, shadowCard]}>
                <View style={[styles.statIconCircle, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
                  <Ionicons name="apps" size={20} color={ACCENT} />
                </View>
                <Text style={styles.statValueApple}>{businesses.length}</Text>
                <Text style={styles.statLabelApple}>אפליקציות</Text>
              </View>
              <View style={[styles.statCardApple, shadowCard]}>
                <View style={[styles.statIconCircle, { backgroundColor: 'rgba(52,199,89,0.14)' }]}>
                  <Ionicons name="people" size={20} color={GREEN} />
                </View>
                <Text style={styles.statValueApple}>{totalClients}</Text>
                <Text style={styles.statLabelApple}>לקוחות</Text>
              </View>
              <View style={[styles.statCardApple, shadowCard]}>
                <View style={[styles.statIconCircle, { backgroundColor: 'rgba(255,149,0,0.14)' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={ORANGE} />
                </View>
                <Text style={styles.statValueApple}>{totalAdmins}</Text>
                <Text style={styles.statLabelApple}>מנהלים</Text>
              </View>
            </View>

            <View style={[styles.searchShell, shadowCard]}>
              <Ionicons name="search" size={18} color={TEXT_TERTIARY} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="חיפוש לפי שם, כתובת, מזהה..."
                placeholderTextColor={TEXT_MUTED}
                value={searchQuery}
                onChangeText={setSearchQuery}
                textAlign="right"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={TEXT_TERTIARY} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>כל הארגונים</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>{filteredBusinesses.length}</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          emptyBecauseFilter ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="search-outline" size={40} color={TEXT_TERTIARY} />
              </View>
              <Text style={styles.emptyText}>לא נמצאו תוצאות</Text>
              <Text style={styles.emptySubtext}>נסה מילת חיפוש אחרת או נקה את השדה</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="business-outline" size={40} color={TEXT_TERTIARY} />
              </View>
              <Text style={styles.emptyText}>אין עסקים עדיין</Text>
              <Text style={styles.emptySubtext}>עבור ללשונית "הוספה" כדי ליצור את הארגון הראשון</Text>
            </View>
          )
        }
      />
    );
  };

  const renderBusinessCard = ({ item }: { item: BusinessOverview }) => {
    const brand = item.branding_client_name?.trim();
    const pulseOk = item.pulseemHasApiKey || (item.pulseem_user_id && item.pulseemHasPassword);
    const tint = item.primary_color && /^#([0-9A-Fa-f]{6})$/.test(item.primary_color) ? item.primary_color : ACCENT;

    return (
      <View style={[styles.bizCard, shadowCard]}>
        <View style={styles.bizCardTop}>
          <LinearGradient colors={[tint, `${tint}CC`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bizAvatar}>
            <Text style={styles.bizAvatarText}>{(item.display_name || '?')[0].toUpperCase()}</Text>
          </LinearGradient>
          <View style={styles.bizInfo}>
            <Text style={styles.bizName} numberOfLines={2}>
              {item.display_name || 'עסק ללא שם'}
            </Text>
            {brand ? (
              <Text style={styles.bizBundleId} numberOfLines={1}>
                {brand}
              </Text>
            ) : null}
            {item.address ? (
              <View style={styles.bizAddressRow}>
                <Ionicons name="location-outline" size={14} color={TEXT_TERTIARY} />
                <Text style={styles.bizAddress} numberOfLines={2}>
                  {item.address}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{item.clientCount}</Text>
            <View style={styles.metricLabelRow}>
              <Ionicons name="people-outline" size={13} color={TEXT_TERTIARY} />
              <Text style={styles.metricLabel}>לקוחות</Text>
            </View>
          </View>
          <View style={styles.metricDividerV} />
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{item.adminCount}</Text>
            <View style={styles.metricLabelRow}>
              <Ionicons name="shield-outline" size={13} color={TEXT_TERTIARY} />
              <Text style={styles.metricLabel}>מנהלים</Text>
            </View>
          </View>
          <View style={styles.metricDividerV} />
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{item.broadcastMessageCount}</Text>
            <View style={styles.metricLabelRow}>
              <Ionicons name="megaphone-outline" size={13} color={TEXT_TERTIARY} />
              <Text style={styles.metricLabel}>שידור</Text>
            </View>
          </View>
        </View>

        <View style={styles.bizMetaRow}>
          {item.phone ? (
            <View style={styles.metaPill}>
              <Ionicons name="call-outline" size={14} color={GREEN} />
              <Text style={styles.metaPillText} numberOfLines={1}>
                {item.phone}
              </Text>
            </View>
          ) : null}
          {pulseOk ? (
            <View style={[styles.metaPill, styles.metaPillAccent]}>
              <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
              <Text style={[styles.metaPillText, { color: ACCENT }]}>פולסים</Text>
            </View>
          ) : (
            <View style={[styles.metaPill, styles.metaPillMuted]}>
              <Ionicons name="remove-circle-outline" size={14} color={TEXT_MUTED} />
              <Text style={[styles.metaPillText, { color: TEXT_TERTIARY }]}>ללא פולסים</Text>
            </View>
          )}
        </View>

        {item.adminPhone || item.adminPassword ? (
          <View style={styles.adminCredentials}>
            <View style={styles.adminCredentialsHeader}>
              <Ionicons name="key-outline" size={15} color={INDIGO} />
              <Text style={styles.adminCredentialsTitle}>התחברות מנהל</Text>
            </View>
            {item.adminPhone ? (
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>טלפון</Text>
                <Text style={styles.credentialValue} selectable>
                  {item.adminPhone}
                </Text>
              </View>
            ) : null}
            {item.adminPassword ? (
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>סיסמה</Text>
                <Text style={styles.credentialValue} selectable>
                  {item.adminPassword}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bizDivider} />

        <View style={styles.bizIdRow}>
          <Text style={styles.bizIdLabel}>מזהה</Text>
          <Text style={styles.bizId} selectable numberOfLines={1}>
            {item.id}
          </Text>
        </View>

        <View style={styles.bizActions}>
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setPulseModalBiz(item)} activeOpacity={0.65}>
            <Ionicons name="chatbubble-ellipses-outline" size={17} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>פולסים SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnGhost} onPress={() => handleDelete(item)} activeOpacity={0.65}>
            <Ionicons name="trash-outline" size={17} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Tab: Add Business ───
  const renderAddBusiness = () => (
    <KeyboardAwareScreenScroll
      style={styles.addScroll}
      contentContainerStyle={[styles.addContent, { paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.addHeader}>
        <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={styles.addIconCircle}>
          <Ionicons name="add-circle" size={32} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.addTitle}>הוספת עסק חדש</Text>
        <Text style={styles.addSubtitle}>מלא את הפרטים כדי ליצור אפליקציה חדשה</Text>
      </View>

      {/* Business Details */}
      <View style={styles.formCard}>
        <Text style={styles.formSectionLabel}>פרטי העסק</Text>

        <Text style={styles.fieldLabel}>שם העסק *</Text>
        <TextInput style={styles.input} placeholder="לדוגמה: הסטודיו של שרה" placeholderTextColor={TEXT_MUTED} value={newBizName} onChangeText={setNewBizName} textAlign="right" />

        <Text style={styles.fieldLabel}>שם אפליקציה (באנגלית) *</Text>
        <TextInput style={styles.input} placeholder="לדוגמה: SarahStudio" placeholderTextColor={TEXT_MUTED} value={newClientName} onChangeText={setNewClientName} autoCapitalize="none" autoCorrect={false} textAlign="left" />
        <Text style={styles.clientNameHint}>ישמש כשם תיקייה ושם חבילה — אותיות ומספרים בלבד</Text>

        <Text style={styles.fieldLabel}>כתובת</Text>
        <TextInput style={styles.input} placeholder="לדוגמה: תל אביב, דיזנגוף 50" placeholderTextColor={TEXT_MUTED} value={newAddress} onChangeText={setNewAddress} textAlign="right" />

        <Text style={styles.fieldLabel}>צבע ראשי</Text>
        <View style={styles.colorRow}>
          <View style={[styles.colorPreview, { backgroundColor: newColor }]} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="#000000" placeholderTextColor={TEXT_MUTED} value={newColor} onChangeText={setNewColor} autoCapitalize="none" textAlign="right" />
        </View>
      </View>

      {/* Pulseem SMS */}
      <View style={styles.formCard}>
        <Text style={styles.formSectionLabel}>פולסים SMS</Text>

        {hasPulseemMainKey ? (
          <>
            <View style={styles.pulseemAutoBox}>
              <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              <Text style={[styles.brandHint, { color: GREEN, marginBottom: 0, flex: 1 }]}>
                {' '}חשבון Pulseem ייווצר אוטומטית עם 20 DirectSmsCredits
              </Text>
            </View>

            <Text style={styles.fieldLabel}>סיסמה לתת-חשבון (אופציונלי)</Text>
            <TextInput
              style={styles.input}
              placeholder="ריק = תיווצר אוטומטית"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemSubPassword}
              onChangeText={setNewPulseemSubPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>שם / מספר שולח SMS — From</Text>
            <Text style={styles.brandHint}>
              אם ריק — נשמר אוטומטית{' '}
              <Text style={{ fontWeight: '700' }}>שם האפליקציה באנגלית</Text> בעמודה pulseem_from_number (כשם מאושר בפולסים).
              אפשר למלא מספר או שם אחר אם שונה מזה.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="ריק = שם האפליקציה באנגלית, או מספר/שם מאושר אחר"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemFromNumber}
              onChangeText={setNewPulseemFromNumber}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
            />
          </>
        ) : (
          <>
            <Text style={styles.brandHint}>
              הגדר <Text style={{ fontWeight: '700' }}>PULSEEM_MAIN_API_KEY_B64</Text> ב-.env (מפתח ב-Base64 — Expo חותך $).{'\n'}
              לחילופין מלא ידנית:
            </Text>

            <Text style={styles.fieldLabel}>מפתח API (הגדרות API בחשבון משנה)</Text>
            <TextInput
              style={styles.input}
              placeholder="אופציונלי — ui-api / אינטגרציות"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemApiKey}
              onChangeText={setNewPulseemApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textAlign="right"
            />
            <Text style={styles.fieldLabel}>מזהה משתמש (לשליחת SMS / OTP)</Text>
            <TextInput
              style={styles.input}
              placeholder="pulseemsendservices — מזהה משתמש"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemWsUserId}
              onChangeText={setNewPulseemWsUserId}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
            />
            <Text style={styles.fieldLabel}>סיסמה</Text>
            <TextInput
              style={styles.input}
              placeholder="סיסמת API של המשתמש בפולסים"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemWsPassword}
              onChangeText={setNewPulseemWsPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textAlign="right"
            />
            <Text style={styles.fieldLabel}>שם / מספר שולח SMS — From</Text>
            <Text style={[styles.brandHint, { marginBottom: 8 }]}>
              אם ריק — נשמר שם האפליקציה באנגלית ב־pulseem_from_number.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="ריק = שם האפליקציה באנגלית, או מספר/שם מאושר בפולסים"
              placeholderTextColor={TEXT_MUTED}
              value={newPulseemFromNumber}
              onChangeText={setNewPulseemFromNumber}
              textAlign="right"
            />
          </>
        )}
      </View>

      {/* Admin Details */}
      <View style={styles.formCard}>
        <Text style={styles.formSectionLabel}>פרטי מנהל</Text>

        <Text style={styles.fieldLabel}>שם מנהל *</Text>
        <TextInput style={styles.input} placeholder="לדוגמה: שרה כהן" placeholderTextColor={TEXT_MUTED} value={newAdminName} onChangeText={setNewAdminName} textAlign="right" />

        <Text style={styles.fieldLabel}>טלפון מנהל *</Text>
        <TextInput style={styles.input} placeholder="לדוגמה: 0501234567" placeholderTextColor={TEXT_MUTED} value={newAdminPhone} onChangeText={setNewAdminPhone} keyboardType="phone-pad" textAlign="right" />

        <Text style={styles.fieldLabel}>סיסמת מנהל *</Text>
        <TextInput style={styles.input} placeholder="סיסמה לחשבון המנהל" placeholderTextColor={TEXT_MUTED} value={newAdminPassword} onChangeText={setNewAdminPassword} secureTextEntry textAlign="right" />
      </View>

      {/* Brand Assets */}
      <View style={styles.formCard}>
        <Text style={styles.formSectionLabel}>נכסי מיתוג</Text>
        <Text style={styles.brandHint}>התמונות יישמרו בתיקיית branding של האפליקציה</Text>

        <View style={styles.imgRow}>
          {renderImagePicker('לוגו', logoAsset, setLogoAsset, 'העלה לוגו')}
          {renderImagePicker('אייקון', iconAsset, setIconAsset, 'העלה אייקון')}
          {renderImagePicker('ספלאש', splashAsset, setSplashAsset, 'העלה ספלאש')}
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          3 שירותים יווצרו אוטומטית: שירות 1, שירות 2 ושירות 3.
        </Text>
        <Ionicons name="sparkles" size={18} color={ACCENT} />
      </View>

      <TouchableOpacity
        style={[styles.createBtn, creating && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={creating}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={styles.createBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.createBtnText}>צור עסק</Text>
              <Ionicons name="rocket" size={20} color="#FFFFFF" />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </KeyboardAwareScreenScroll>
  );

  // ─── Tab: Settings ───
  const renderSettings = () => (
    <ScrollView contentContainerStyle={[styles.settingsContent, { paddingBottom: 120 }]}>
      <View style={styles.settingsHeader}>
        <View style={styles.settingsAvatarWrap}>
          <LinearGradient colors={[ACCENT, PINK]} style={styles.settingsAvatar}>
            <Ionicons name="person" size={36} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Text style={styles.settingsName}>סופר אדמין</Text>
        <Text style={styles.settingsRole}>ניהול כלל-מערכתי</Text>
      </View>

      <View style={styles.settingsCard}>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsRowValue}>{businesses.length}</Text>
          <Text style={styles.settingsRowLabel}>סה"כ אפליקציות</Text>
          <Ionicons name="apps" size={20} color={ACCENT} />
        </View>
        <View style={styles.settingsDivider} />
        <View style={styles.settingsRow}>
          <Text style={styles.settingsRowValue}>{totalClients}</Text>
          <Text style={styles.settingsRowLabel}>סה"כ לקוחות</Text>
          <Ionicons name="people" size={20} color={GREEN} />
        </View>
        <View style={styles.settingsDivider} />
        <View style={styles.settingsRow}>
          <Text style={styles.settingsRowValue}>{totalAdmins}</Text>
          <Text style={styles.settingsRowLabel}>סה"כ מנהלים</Text>
          <Ionicons name="shield-checkmark" size={20} color={ORANGE} />
        </View>
      </View>

      <TouchableOpacity style={styles.logoutCard} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={18} color={TEXT_MUTED} />
        <Text style={styles.logoutText}>התנתקות</Text>
        <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── Bottom Tab Bar ───
  const tabs: { key: TabKey; icon: string; iconFocused: string; label: string }[] = [
    { key: 'dashboard', icon: 'grid-outline', iconFocused: 'grid', label: 'דשבורד' },
    { key: 'add', icon: 'add-circle-outline', iconFocused: 'add-circle', label: 'הוספה' },
    { key: 'settings', icon: 'settings-outline', iconFocused: 'settings', label: 'הגדרות' },
  ];

  const deleteDialogMessage = deleteConfirmBiz
    ? `בטוח שברצונך למחוק את "${deleteConfirmBiz.display_name || 'עסק ללא שם'}"?\n\nפעולה זו תמחק את כל הנתונים: משתמשים, תורים, שירותים, וקבצי ברנדינג.\n\nלא ניתן לבטל פעולה זו!`
    : '';

  return (
    <View style={styles.root}>
      <Modal visible={!!deleteConfirmBiz} transparent animationType="fade" onRequestClose={closeDeleteConfirm}>
        <View style={styles.confirmOverlay}>
          {deleteConfirmBiz ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>מחיקת אפליקציה</Text>
              <Text style={styles.confirmMessage}>{deleteDialogMessage}</Text>
              <View style={styles.confirmButtonsRow}>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={closeDeleteConfirm}
                  activeOpacity={0.8}
                  disabled={deleteInProgress}
                >
                  <Text style={styles.confirmButtonDefaultText}>ביטול</Text>
                </TouchableOpacity>
                <View style={styles.confirmButtonDivider} />
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={runConfirmedDelete}
                  activeOpacity={0.8}
                  disabled={deleteInProgress}
                >
                  {deleteInProgress ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <Text style={styles.confirmButtonDestructiveText}>מחק</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={!!feedbackDialog} transparent animationType="fade" onRequestClose={() => setFeedbackDialog(null)}>
        <View style={styles.confirmOverlay}>
          {feedbackDialog ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>{feedbackDialog.title}</Text>
              <Text style={styles.confirmMessage}>{feedbackDialog.message}</Text>
              <View style={styles.confirmButtonsRow}>
                <TouchableOpacity style={styles.confirmButton} onPress={() => setFeedbackDialog(null)} activeOpacity={0.8}>
                  <Text style={styles.confirmButtonDefaultText}>אישור</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={logoutConfirmVisible} transparent animationType="fade" onRequestClose={() => setLogoutConfirmVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>התנתקות</Text>
            <Text style={styles.confirmMessage}>בטוח שברצונך להתנתק?</Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={styles.confirmButton} onPress={() => setLogoutConfirmVisible(false)} activeOpacity={0.8}>
                <Text style={styles.confirmButtonDefaultText}>ביטול</Text>
              </TouchableOpacity>
              <View style={styles.confirmButtonDivider} />
              <TouchableOpacity style={styles.confirmButton} onPress={runConfirmedLogout} activeOpacity={0.8}>
                <Text style={styles.confirmButtonDestructiveText}>התנתק</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PulseemBusinessModal
        visible={!!pulseModalBiz}
        business={pulseModalBiz}
        onClose={() => setPulseModalBiz(null)}
        onSaved={() => loadBusinesses()}
      />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerEyebrow}>מערכת</Text>
        <Text style={styles.headerTitle}>לוח בקרה</Text>
        <Text style={styles.headerSubtitle}>ניהול ארגונים ואפליקציות</Text>
      </View>

      <View style={styles.body}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'add' && renderAddBusiness()}
        {activeTab === 'settings' && renderSettings()}
      </View>

      <View style={[styles.tabBarOuter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <BlurView intensity={90} tint="light" style={styles.tabBarBlur}>
          <View style={styles.tabBarOverlay} />
          <View style={styles.tabBarRow}>
            {tabs.map((tab) => {
              const focused = activeTab === tab.key;
              return (
                <TouchableOpacity key={tab.key} style={styles.tabItem} onPress={() => setActiveTab(tab.key)} activeOpacity={0.7}>
                  {tab.key === 'add' ? (
                    <View style={[styles.addTabBtn, focused && styles.addTabBtnFocused]}>
                      <Ionicons name={(focused ? tab.iconFocused : tab.icon) as any} size={28} color="#FFFFFF" />
                    </View>
                  ) : (
                    <>
                      <Ionicons name={(focused ? tab.iconFocused : tab.icon) as any} size={24} color={focused ? ACCENT : TEXT_MUTED} />
                      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{tab.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: TEXT_TERTIARY, fontWeight: '500' },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: BG,
    alignItems: 'flex-start',
  },
  headerEyebrow: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_TERTIARY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'right',
    alignSelf: 'stretch',
    letterSpacing: Platform.OS === 'ios' ? 0.37 : 0,
  },
  headerSubtitle: { fontSize: 15, color: TEXT_TERTIARY, marginTop: 4, textAlign: 'right', alignSelf: 'stretch', fontWeight: '400' },

  body: { flex: 1 },

  // ── Dashboard (Apple-style) ──
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCardApple: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValueApple: { fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY, fontVariant: ['tabular-nums'] },
  statLabelApple: { fontSize: 11, fontWeight: '600', color: TEXT_TERTIARY, marginTop: 2 },

  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  searchIcon: { marginEnd: 8 },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: TEXT_PRIMARY,
    paddingVertical: 0,
    fontWeight: '400',
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right', flex: 1 },
  sectionCountPill: {
    backgroundColor: 'rgba(0,122,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  sectionCountText: { fontSize: 13, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] },

  bizCard: {
    backgroundColor: CARD_BG,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  bizCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  bizAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 14,
  },
  bizAvatarText: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  bizInfo: { flex: 1, alignItems: 'flex-start', minWidth: 0 },
  bizName: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right', lineHeight: 26 },
  bizBundleId: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_TERTIARY,
    marginTop: 2,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bizAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  bizAddress: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'right', flex: 1, lineHeight: 20 },

  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: BG,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  metricCell: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  metricDividerV: { width: StyleSheet.hairlineWidth, backgroundColor: SEPARATOR },
  metricValue: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, fontVariant: ['tabular-nums'] },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metricLabel: { fontSize: 11, fontWeight: '600', color: TEXT_TERTIARY },

  bizMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(52,199,89,0.1)',
    maxWidth: '100%',
  },
  metaPillAccent: { backgroundColor: 'rgba(0,122,255,0.1)' },
  metaPillMuted: { backgroundColor: 'rgba(142,142,147,0.12)' },
  metaPillText: { fontSize: 13, fontWeight: '600', color: GREEN, flexShrink: 1 },

  adminCredentials: {
    marginTop: 10,
    backgroundColor: BG,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  adminCredentialsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  adminCredentialsTitle: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  credentialLabel: { fontSize: 12, fontWeight: '600', color: TEXT_TERTIARY },
  credentialValue: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1, textAlign: 'left' },

  bizDivider: { height: StyleSheet.hairlineWidth, backgroundColor: SEPARATOR, marginTop: 14, marginBottom: 10 },
  bizIdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  bizIdLabel: { fontSize: 12, fontWeight: '600', color: TEXT_TERTIARY },
  bizId: { fontSize: 11, color: TEXT_TERTIARY, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1, textAlign: 'left' },

  bizActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnPrimaryText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  actionBtnGhost: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.2)',
  },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(142,142,147,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY },
  emptySubtext: { fontSize: 15, color: TEXT_TERTIARY, textAlign: 'center', lineHeight: 22 },

  // ── Add Business ──
  addScroll: { flex: 1 },
  addContent: { padding: 20 },
  addHeader: { alignItems: 'center', marginBottom: 28, gap: 8 },
  addIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  addTitle: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  addSubtitle: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },

  formCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 18,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12 },
      default: { elevation: 1 },
    }),
  },
  formSectionLabel: { fontSize: 15, fontWeight: '700', color: ACCENT, marginBottom: 12, textAlign: 'right', alignSelf: 'stretch' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 6, marginTop: 12, textAlign: 'right', alignSelf: 'stretch' },
  input: {
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: TEXT_PRIMARY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    textAlign: 'right',
  },
  clientNameHint: { fontSize: 11, color: TEXT_MUTED, marginTop: 4, textAlign: 'right' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  colorPreview: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, borderColor: CARD_BORDER },

  brandHint: { fontSize: 12, color: TEXT_MUTED, textAlign: 'right', marginBottom: 12, alignSelf: 'stretch' },
  pulseemAutoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: 12, padding: 12, marginBottom: 12, gap: 6 },
  imgRow: { flexDirection: 'row', gap: 10 },
  imgPickerWrap: { flex: 1, alignItems: 'center' },
  imgPickerBtn: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: BG,
  },
  imgPickerPreview: { width: '100%', height: '100%', borderRadius: 13 },
  imgPickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  imgPickerHint: { fontSize: 10, color: TEXT_MUTED, textAlign: 'center' },
  imgRemoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  imgRemoveText: { fontSize: 11, color: '#FF3B30', fontWeight: '600' },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,122,255,0.08)', borderRadius: 14, padding: 14, gap: 10, marginBottom: 8 },
  infoText: { flex: 1, fontSize: 13, color: TEXT_SECONDARY, lineHeight: 20, textAlign: 'right' },

  createBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
  createBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  createBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },

  // ── Settings ──
  settingsContent: { padding: 20, alignItems: 'center' },
  settingsHeader: { alignItems: 'center', marginBottom: 28, marginTop: 12 },
  settingsAvatarWrap: { marginBottom: 14, shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  settingsAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  settingsName: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  settingsRole: { fontSize: 14, color: TEXT_SECONDARY, marginTop: 4 },

  settingsCard: { width: '100%', backgroundColor: CARD_BG, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, padding: 4, marginBottom: 20, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  settingsRowLabel: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, fontWeight: '500', textAlign: 'right' },
  settingsRowValue: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY },
  settingsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: SEPARATOR, marginHorizontal: 16 },

  logoutCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  logoutText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FF3B30', textAlign: 'right' },

  // ── Bottom Tab Bar ──
  tabBarOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
  tabBarBlur: { borderRadius: 28, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -2 } }, default: { elevation: 8 } }) },
  tabBarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(250,250,250,0.88)', borderRadius: 28 },
  tabBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 12 },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 4 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: TEXT_TERTIARY, marginTop: 4 },
  tabLabelFocused: { color: ACCENT },
  addTabBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    ...Platform.select({
      ios: { shadowColor: ACCENT, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      default: { elevation: 6 },
    }),
  },
  addTabBtnFocused: { backgroundColor: ACCENT_DARK, transform: [{ scale: 1.04 }] },

  confirmOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 28,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
    paddingTop: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24 },
      default: { elevation: 12 },
    }),
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  confirmMessage: {
    fontSize: 13,
    color: TEXT_TERTIARY,
    textAlign: 'center',
    paddingHorizontal: 18,
    marginBottom: 18,
    lineHeight: 20,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_BG,
    minHeight: 48,
  },
  confirmButtonDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
  },
  confirmButtonDefaultText: {
    fontSize: 17,
    color: '#0A84FF',
    fontWeight: '600',
  },
  confirmButtonDestructiveText: {
    fontSize: 17,
    color: '#FF3B30',
    fontWeight: '700',
  },
});
