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
  ScrollView,
  RefreshControl,
  Image,
  Modal,
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

const ACCENT = '#6C5CE7';
const ACCENT_DARK = '#5A4BD1';
const GREEN = '#00B894';
const ORANGE = '#E17055';
const PINK = '#FD79A8';
const BG = '#F5F6FA';
const CARD_BG = '#FFFFFF';
const CARD_BORDER = '#ECEEF4';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';

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
          <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
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

    return (
      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={renderBusinessCard}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <LinearGradient colors={['#6C5CE7', '#A29BFE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statCard}>
                <Ionicons name="apps" size={24} color="#FFFFFF" />
                <Text style={styles.statValue}>{businesses.length}</Text>
                <Text style={styles.statLabel}>אפליקציות</Text>
              </LinearGradient>

              <LinearGradient colors={['#00B894', '#55EFC4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statCard}>
                <Ionicons name="people" size={24} color="#FFFFFF" />
                <Text style={styles.statValue}>{totalClients}</Text>
                <Text style={styles.statLabel}>לקוחות</Text>
              </LinearGradient>

              <LinearGradient colors={['#E17055', '#FAB1A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statCard}>
                <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
                <Text style={styles.statValue}>{totalAdmins}</Text>
                <Text style={styles.statLabel}>מנהלים</Text>
              </LinearGradient>
            </View>

            <Text style={styles.sectionTitle}>כל העסקים</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="business-outline" size={44} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyText}>אין עסקים עדיין</Text>
            <Text style={styles.emptySubtext}>עבור ללשונית "הוספה" כדי ליצור את העסק הראשון</Text>
          </View>
        }
      />
    );
  };

  const renderBusinessCard = ({ item }: { item: BusinessOverview }) => (
    <View style={styles.bizCard}>
      <View style={styles.bizHeader}>
        <View style={styles.bizInfo}>
          <Text style={styles.bizName} numberOfLines={1}>
            {item.display_name || 'עסק ללא שם'}
          </Text>
          {item.address ? (
            <View style={styles.bizAddressRow}>
              <Text style={styles.bizAddress} numberOfLines={1}>{item.address}</Text>
              <Ionicons name="location-outline" size={13} color={TEXT_MUTED} />
            </View>
          ) : null}
        </View>
        <LinearGradient
          colors={[item.primary_color || ACCENT, (item.primary_color || ACCENT) + 'AA']}
          style={styles.bizAvatar}
        >
          <Text style={styles.bizAvatarText}>
            {(item.display_name || '?')[0].toUpperCase()}
          </Text>
        </LinearGradient>
      </View>

      <View style={styles.bizStatsRow}>
        <View style={[styles.bizChip, { backgroundColor: 'rgba(108,92,231,0.1)' }]}>
          <Text style={[styles.bizChipText, { color: ACCENT }]}>{item.clientCount} לקוחות</Text>
          <Ionicons name="people" size={14} color={ACCENT} />
        </View>
        <View style={[styles.bizChip, { backgroundColor: 'rgba(225,112,85,0.1)' }]}>
          <Text style={[styles.bizChipText, { color: ORANGE }]}>{item.adminCount} מנהלים</Text>
          <Ionicons name="shield-checkmark" size={14} color={ORANGE} />
        </View>
        <View style={[styles.bizChip, { backgroundColor: 'rgba(253,121,168,0.12)' }]}>
          <Text style={[styles.bizChipText, { color: PINK }]}>{item.broadcastMessageCount} הודעות שידור</Text>
          <Ionicons name="megaphone-outline" size={14} color={PINK} />
        </View>
        {item.phone ? (
          <View style={[styles.bizChip, { backgroundColor: 'rgba(0,184,148,0.1)' }]}>
            <Text style={[styles.bizChipText, { color: GREEN }]}>{item.phone}</Text>
            <Ionicons name="call" size={14} color={GREEN} />
          </View>
        ) : null}
        {item.pulseemHasApiKey || (item.pulseem_user_id && item.pulseemHasPassword) ? (
          <View style={[styles.bizChip, { backgroundColor: 'rgba(108,92,231,0.12)' }]}>
            <Text style={[styles.bizChipText, { color: ACCENT }]}>פולסים מוגדר</Text>
            <Ionicons name="chatbubbles" size={14} color={ACCENT} />
          </View>
        ) : null}
      </View>

      {(item.adminPhone || item.adminPassword) ? (
        <View style={styles.adminCredentials}>
          <View style={styles.adminCredentialsHeader}>
            <Text style={styles.adminCredentialsTitle}>פרטי התחברות מנהל</Text>
            <Ionicons name="key" size={14} color={ACCENT} />
          </View>
          {item.adminPhone ? (
            <View style={styles.credentialRow}>
              <Text style={styles.credentialValue} selectable>{item.adminPhone}</Text>
              <Text style={styles.credentialLabel}>טלפון:</Text>
            </View>
          ) : null}
          {item.adminPassword ? (
            <View style={styles.credentialRow}>
              <Text style={styles.credentialValue} selectable>{item.adminPassword}</Text>
              <Text style={styles.credentialLabel}>סיסמה:</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.bizFooter}>
        <View style={styles.bizFooterLeft}>
          <TouchableOpacity style={styles.pulseBtn} onPress={() => setPulseModalBiz(item)} activeOpacity={0.7}>
            <Text style={styles.pulseBtnText}>פולסים SMS</Text>
            <Ionicons name="keypad-outline" size={14} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)} activeOpacity={0.7}>
            <Text style={styles.deleteBtnText}>מחק</Text>
            <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
        <Text style={styles.bizId} selectable numberOfLines={1}>{item.id}</Text>
      </View>
    </View>
  );

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

            <Text style={styles.fieldLabel}>מספר שולח SMS — From (מומלץ)</Text>
            <Text style={styles.brandHint}>
              לרוב חובה מספר שולח מאושר בפולסים (ללא אותיות באנגלית). אם ריק — תגדיר אחר כך ב«פולסים SMS» או ב-Supabase.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="למשל: 0501234567 או מספר וירטואלי מפולסים"
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
            <Text style={styles.fieldLabel}>מספר / שם שולח SMS — From</Text>
            <TextInput
              style={styles.input}
              placeholder="מספר מאושר בפולסים (לעיתים שם באנגלית רק אחרי אימות אצלם)"
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
        <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
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
      <LinearGradient colors={['#FFFFFF', '#F5F6FA']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>לוח בקרה</Text>
        <Text style={styles.headerSubtitle}>ניהול כל האפליקציות</Text>
      </LinearGradient>

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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: TEXT_SECONDARY },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF4',
    alignItems: 'flex-start',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: TEXT_PRIMARY, textAlign: 'right' },
  headerSubtitle: { fontSize: 14, color: TEXT_SECONDARY, marginTop: 4, textAlign: 'right' },

  body: { flex: 1 },

  // ── Dashboard ──
  listContent: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 18, padding: 16, alignItems: 'flex-start', gap: 6 },
  statValue: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  statLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 14, textAlign: 'right', alignSelf: 'stretch' },

  bizCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bizHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bizAvatar: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bizAvatarText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  bizInfo: { flex: 1, marginLeft: 12, alignItems: 'flex-start' },
  bizName: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' },
  bizAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  bizAddress: { fontSize: 13, color: TEXT_MUTED, textAlign: 'right' },

  bizStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bizChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  bizChipText: { fontSize: 12, fontWeight: '600' },

  adminCredentials: {
    marginTop: 12,
    backgroundColor: 'rgba(108,92,231,0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.12)',
  },
  adminCredentialsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  adminCredentialsTitle: { fontSize: 12, fontWeight: '700', color: ACCENT },
  credentialRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  credentialLabel: { fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY },
  credentialValue: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY, fontFamily: 'monospace' },

  bizFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: CARD_BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bizFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bizId: { fontSize: 10, color: TEXT_MUTED, fontFamily: 'monospace', flex: 1, textAlign: 'left', minWidth: 0 },
  pulseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(108,92,231,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)' },
  pulseBtnText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF0F0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FFE0E0' },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#FF6B6B' },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ECEEF4', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyText: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  emptySubtext: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center', paddingHorizontal: 20 },

  // ── Add Business ──
  addScroll: { flex: 1 },
  addContent: { padding: 20 },
  addHeader: { alignItems: 'center', marginBottom: 28, gap: 8 },
  addIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  addTitle: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  addSubtitle: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },

  formCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  formSectionLabel: { fontSize: 15, fontWeight: '700', color: ACCENT, marginBottom: 12, textAlign: 'right', alignSelf: 'stretch' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 6, marginTop: 12, textAlign: 'right', alignSelf: 'stretch' },
  input: {
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: TEXT_PRIMARY,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    textAlign: 'right',
  },
  clientNameHint: { fontSize: 11, color: TEXT_MUTED, marginTop: 4, textAlign: 'right' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  colorPreview: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, borderColor: CARD_BORDER },

  brandHint: { fontSize: 12, color: TEXT_MUTED, textAlign: 'right', marginBottom: 12, alignSelf: 'stretch' },
  pulseemAutoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FFF4', borderRadius: 8, padding: 10, marginBottom: 12, gap: 4 },
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
    backgroundColor: '#F8F9FD',
  },
  imgPickerPreview: { width: '100%', height: '100%', borderRadius: 13 },
  imgPickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  imgPickerHint: { fontSize: 10, color: TEXT_MUTED, textAlign: 'center' },
  imgRemoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  imgRemoveText: { fontSize: 11, color: '#FF6B6B', fontWeight: '600' },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(108,92,231,0.08)', borderRadius: 14, padding: 14, gap: 10, marginBottom: 8 },
  infoText: { flex: 1, fontSize: 13, color: TEXT_SECONDARY, lineHeight: 20, textAlign: 'right' },

  createBtn: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  createBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  createBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  // ── Settings ──
  settingsContent: { padding: 20, alignItems: 'center' },
  settingsHeader: { alignItems: 'center', marginBottom: 28, marginTop: 12 },
  settingsAvatarWrap: { marginBottom: 14, shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  settingsAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  settingsName: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  settingsRole: { fontSize: 14, color: TEXT_SECONDARY, marginTop: 4 },

  settingsCard: { width: '100%', backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: CARD_BORDER, padding: 4, marginBottom: 20 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  settingsRowLabel: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, fontWeight: '500', textAlign: 'right' },
  settingsRowValue: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY },
  settingsDivider: { height: 1, backgroundColor: CARD_BORDER, marginHorizontal: 16 },

  logoutCard: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF5F5', borderRadius: 16, borderWidth: 1, borderColor: '#FFE0E0', paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  logoutText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FF6B6B', textAlign: 'right' },

  // ── Bottom Tab Bar ──
  tabBarOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16 },
  tabBarBlur: { borderRadius: 26, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  tabBarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 26 },
  tabBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 10 },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 4 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, marginTop: 3 },
  tabLabelFocused: { color: ACCENT },
  addTabBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginTop: -20, shadowColor: ACCENT, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  addTabBtnFocused: { backgroundColor: ACCENT_DARK, transform: [{ scale: 1.08 }] },

  confirmOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
    paddingTop: 16,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  confirmMessage: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 18,
    marginBottom: 14,
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
