import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { superAdminApi, type BusinessOverview } from '@/lib/api/superAdmin';
import { getExpoExtra } from '@/lib/getExtra';

const ACCENT = '#6C5CE7';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';
const CARD_BORDER = '#ECEEF4';

interface PulseemBusinessModalProps {
  visible: boolean;
  business: BusinessOverview | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PulseemBusinessModal({ visible, business, onClose, onSaved }: PulseemBusinessModalProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [hadPassword, setHadPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [autoSubPassword, setAutoSubPassword] = useState('');
  const [creditTransferAmount, setCreditTransferAmount] = useState('50');
  const [transferringCredits, setTransferringCredits] = useState(false);

  const extra = getExpoExtra();
  const hasPulseemMainKeyInApp = !!String(extra.PULSEEM_MAIN_API_KEY ?? '').replace(/^\uFEFF/, '').trim();

  const resetFields = useCallback(() => {
    setUserId('');
    setPassword('');
    setFromNumber('');
    setHadPassword(false);
    setAutoSubPassword('');
    setCreditTransferAmount('50');
  }, []);

  useEffect(() => {
    if (!visible || !business) {
      resetFields();
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const state = await superAdminApi.getPulseemEditorState(business.id);
      if (cancelled) return;
      if (state) {
        setUserId(state.userId);
        setFromNumber(state.fromNumber);
        setHadPassword(state.hasPassword);
      } else {
        resetFields();
      }
      setPassword('');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, business?.id, resetFields, business]);

  const handleTest = async () => {
    if (!business) return;
    setTesting(true);
    const result = await superAdminApi.testPulseemForBusiness(business.id, userId, password);
    setTesting(false);
    if (result.ok) {
      Alert.alert('חיבור תקין', `יתרת SMS בפולסים: ${result.credits}`);
    } else if ('message' in result) {
      Alert.alert('בדיקה נכשלה', result.message);
    }
  };

  const handleProvisionSubAccount = () => {
    if (!business) return;
    if (business.pulseemHasApiKey) return;
    Alert.alert(
      'יצירת תת-חשבון Pulseem',
      'ייווצר תת-חשבון עם DirectSmsCredits (כמו ב«הוספת עסק חדש»), והפרטים יישמרו במסד מוצפן. ודא שב-Supabase Secrets מוגדר PULSEEM_MAIN_API_KEY לפונקציה pulseem-provision-subaccount.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'צור',
          onPress: async () => {
            setProvisioning(true);
            const result = await superAdminApi.provisionPulseemSubAccountForBusiness(business.id, {
              subPassword: autoSubPassword.trim() || undefined,
              fromNumber: fromNumber.trim() || undefined,
            });
            setProvisioning(false);
            if (!result.ok) {
              Alert.alert('נכשל', result.errorMessage || 'נסה שוב');
              return;
            }
            const envNote = result.envSynced
              ? '\n\nקובץ .env ב-Storage עודכן.'
              : '\n\nלא נמצאה תיקיית ברנדינג ב-Storage — נשמר במסד בלבד.';
            Alert.alert(
              'נוצר',
              `מזהה WS: ${result.loginUserName ?? '—'}\nיתרה/קרדיטים: ${result.directSmsCredits ?? '—'}${envNote}`,
            );
            const state = await superAdminApi.getPulseemEditorState(business.id);
            if (state) {
              setUserId(state.userId);
              setFromNumber(state.fromNumber);
              setHadPassword(state.hasPassword);
            }
            setPassword('');
            onSaved();
          },
        },
      ],
    );
  };

  const handleCreditTransfer = () => {
    if (!business) return;
    const n = parseInt(creditTransferAmount.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('סכום לא תקין', 'הזן מספר שלם חיובי של קרדיטי Direct SMS להעברה.');
      return;
    }
    Alert.alert(
      'טעינת קרדיטים (CreditTransfer)',
      `יועברו ${n} קרדיטי Direct SMS מהחשבון הראשי בפולסים (מפתח ב-Supabase: PULSEEM_MAIN_API_KEY) לתת-החשבון של העסק (מפתח ה-Direct שבמסד).`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'העבר',
          onPress: async () => {
            setTransferringCredits(true);
            const result = await superAdminApi.transferPulseemCreditsForBusiness(business.id, {
              directSmsCredits: n,
            });
            setTransferringCredits(false);
            if (!result.ok) {
              Alert.alert('נכשל', result.errorMessage || 'נסה שוב');
              return;
            }
            const after =
              result.directSmsCreditsAfter != null
                ? `\nיתרת Direct SMS אחרי (לפי תשובת Pulseem): ${result.directSmsCreditsAfter}`
                : '';
            Alert.alert('בוצע', `הועברו ${n} קרדיטים.${after}`);
            onSaved();
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    const result = await superAdminApi.savePulseemCredentials(business.id, {
      userId,
      password,
      fromNumber,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('שמירה נכשלה', result.errorMessage || 'נסה שוב');
      return;
    }
    const envNote = result.envSynced
      ? '\n\nקובץ .env בתיקיית הברנדינג ב-Storage עודכן.'
      : '\n\nלא נמצאה תיקיית ברנדינג ב-Storage — הפרטים נשמרו במסד בלבד. לאחר pull-branding תוכל לעדכן שוב לסנכרן .env.';
    Alert.alert('נשמר', `הגדרות פולסים נשמרו לעסק.${envNote}`);
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={TEXT_SECONDARY} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>פולסים — SMS / OTP</Text>
            <View style={{ width: 26 }} />
          </View>
          <Text style={styles.bizLine} numberOfLines={1}>
            {business?.display_name || 'עסק'}
          </Text>

          {loading || !business ? (
            <View style={styles.centerPad}>
              {loading ? <ActivityIndicator size="large" color={ACCENT} /> : null}
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollPad}
            >
              <Text style={styles.hint}>
                מפתח ה-API החדש (מ«הגדרות API») מוזן ביצירת עסק חדש ונשמר ב-.env. כאן: ממשק ה-Web Service הישן (מזהה משתמש + סיסמה). כפתור «בדיקת חיבור» בודק רק את הישן; אם השתמשת רק במפתח API — התעלם מהבדיקה או השלם כאן פרטי WS אם יש לך.
              </Text>

              {!business.pulseemHasApiKey ? (
                <View style={styles.autoBox}>
                  <Text style={styles.autoTitle}>תת-חשבון אוטומטי (Edge)</Text>
                  <Text style={styles.autoHint}>
                    פונקציית pulseem-provision-subaccount יוצרת חשבון משנה בפולסים ומעדכנת את המסד — כמו ביצירת אפליקציה חדשה. נדרש סוד{' '}
                    <Text style={{ fontWeight: '700' }}>PULSEEM_MAIN_API_KEY</Text> ב-Supabase (לא בהכרח אותו דבר כמו PULSEEM_MAIN_API_KEY_B64 באפליקציה).
                    {!hasPulseemMainKeyInApp ? '\n\nבאפליקציה אין מפתח ראשי ב-extra — זה תקין אם ההקמה רק מהשרת.' : ''}
                  </Text>
                  <Text style={styles.label}>סיסמה לתת-חשבון (אופציונלי)</Text>
                  <TextInput
                    style={styles.input}
                    value={autoSubPassword}
                    onChangeText={setAutoSubPassword}
                    placeholder="ריק = אקראי"
                    placeholderTextColor={TEXT_MUTED}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="right"
                  />
                  <TouchableOpacity
                    style={[styles.accentOutlineBtn, provisioning && { opacity: 0.6 }]}
                    onPress={handleProvisionSubAccount}
                    disabled={provisioning}
                  >
                    {provisioning ? (
                      <ActivityIndicator color={ACCENT} />
                    ) : (
                      <>
                        <Text style={styles.accentOutlineBtnText}>צור תת-חשבון Pulseem</Text>
                        <Ionicons name="sparkles-outline" size={18} color={ACCENT} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              {business.pulseemHasApiKey ? (
                <View style={styles.creditBox}>
                  <Text style={styles.creditTitle}>טעינת קרדיטים — CreditTransfer</Text>
                  <Text style={styles.creditHint}>
                    לפי דוקומנטציית Pulseem: POST /AccountsApi/CreditTransfer. המפתח הראשי בכותרת APIKEY (סוד Edge), מפתח ה-Direct של העסק בגוף הבקשה — מתבצע בשרת בלבד.
                  </Text>
                  <Text style={styles.label}>כמות Direct SMS להעברה</Text>
                  <TextInput
                    style={styles.input}
                    value={creditTransferAmount}
                    onChangeText={setCreditTransferAmount}
                    placeholder="למשל 50"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="number-pad"
                    textAlign="right"
                  />
                  <TouchableOpacity
                    style={[styles.accentOutlineBtn, transferringCredits && { opacity: 0.6 }]}
                    onPress={handleCreditTransfer}
                    disabled={transferringCredits}
                  >
                    {transferringCredits ? (
                      <ActivityIndicator color={ACCENT} />
                    ) : (
                      <>
                        <Text style={styles.accentOutlineBtnText}>העבר קרדיטי Direct SMS</Text>
                        <Ionicons name="arrow-down-circle-outline" size={18} color={ACCENT} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.label}>מזהה משתמש (User ID)</Text>
              <TextInput
                style={styles.input}
                value={userId}
                onChangeText={setUserId}
                placeholder="לפי פולסים"
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
              />

              <Text style={styles.label}>סיסמה</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={hadPassword ? 'השאר ריק כדי לשמור סיסמה קיימת' : 'סיסמת API'}
                placeholderTextColor={TEXT_MUTED}
                secureTextEntry
                textAlign="right"
              />

              <Text style={styles.label}>מספר שולח (From)</Text>
              <TextInput
                style={styles.input}
                value={fromNumber}
                onChangeText={setFromNumber}
                placeholder="לדוגמה: שם בית עסק או מספר קצר"
                placeholderTextColor={TEXT_MUTED}
                keyboardType="default"
                textAlign="right"
              />

              <TouchableOpacity
                style={[styles.secondaryBtn, testing && { opacity: 0.6 }]}
                onPress={handleTest}
                disabled={testing}
              >
                {testing ? (
                  <ActivityIndicator color={ACCENT} />
                ) : (
                  <>
                    <Text style={styles.secondaryBtnText}>בדיקת חיבור (יתרת SMS)</Text>
                    <Ionicons name="flash-outline" size={18} color={ACCENT} />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>שמור במסד וב-.env</Text>
                    <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY },
  bizLine: { fontSize: 13, color: TEXT_SECONDARY, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  centerPad: { paddingVertical: 40, alignItems: 'center' },
  scrollPad: { paddingHorizontal: 20, paddingTop: 8 },
  hint: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 16,
  },
  label: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 6, marginTop: 10, textAlign: 'right' },
  input: {
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT_PRIMARY,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  secondaryBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: ACCENT },
  autoBox: {
    backgroundColor: 'rgba(108,92,231,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.2)',
    padding: 14,
    marginBottom: 16,
  },
  autoTitle: { fontSize: 14, fontWeight: '800', color: ACCENT, textAlign: 'right', marginBottom: 8 },
  autoHint: { fontSize: 11, color: TEXT_SECONDARY, textAlign: 'right', lineHeight: 16, marginBottom: 8 },
  accentOutlineBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ACCENT,
    backgroundColor: '#FFFFFF',
  },
  accentOutlineBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  creditBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 14,
    marginBottom: 16,
  },
  creditTitle: { fontSize: 14, fontWeight: '800', color: '#059669', textAlign: 'right', marginBottom: 6 },
  creditHint: { fontSize: 11, color: TEXT_SECONDARY, textAlign: 'right', lineHeight: 16, marginBottom: 8 },
  primaryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: ACCENT,
    marginBottom: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
