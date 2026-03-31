import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
  KeyboardAvoidingView,
  type ScrollView,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, KeyRound } from 'lucide-react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { greenInvoiceConnectApi } from '@/lib/api/greenInvoiceConnect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GI_SIGNIN = 'https://auth.greeninvoice.co.il/signin';
const GI_API_KEYS = 'https://app.greeninvoice.co.il/settings/developers/api';

type ThemeSlice = {
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  connected: boolean;
  storedKeyId: string | null;
  accentColor: string;
  theme: ThemeSlice;
  saving: boolean;
  onSubmitCredentials: (apiKeyId: string, apiSecret: string) => Promise<void>;
  onDisconnect: () => void;
};

const INJECT_SCAN_INPUTS = `
(function(){
  try {
    var values = [];
    document.querySelectorAll('input').forEach(function(inp){
      var v = String(inp.value || '').trim();
      if (v.length >= 12) values.push(v);
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'gi_scan', values: values.slice(0, 8) }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'gi_scan', values: [] }));
  }
  true;
})();
`;

export function GreenInvoiceConnectModal({
  visible,
  onClose,
  connected,
  storedKeyId,
  accentColor,
  theme,
  saving,
  onSubmitCredentials,
  onDisconnect,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const kbdScrollRef = useRef<ScrollView | null>(null);
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [webExpanded, setWebExpanded] = useState(false);
  const [webResetKey, setWebResetKey] = useState(0);

  const giErrorMessage = useCallback(
    (code: string, serverMessage?: string) => {
      if (serverMessage && code === 'greeninvoice_auth_failed') return serverMessage;
      const key = `finance.greenInvoice.errors.${code}` as const;
      const translated = t(key);
      const base = translated !== key ? translated : t('finance.greenInvoice.errors.unknown');
      if (code === 'invoke_network' && serverMessage) {
        return `${base}\n\n${serverMessage}`;
      }
      return base;
    },
    [t],
  );

  useEffect(() => {
    if (visible && !connected) {
      setApiKeyId('');
      setApiSecret('');
      setWebExpanded(false);
      setWebResetKey((k) => k + 1);
    }
  }, [visible, connected]);

  const onWebMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(String(e.nativeEvent.data || '{}')) as { type?: string; values?: string[] };
        if (data.type !== 'gi_scan' || !Array.isArray(data.values)) return;
        const vals = data.values.filter(Boolean);
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const id = vals.find((v) => uuidRe.test(v));
        const secret = vals.find((v) => v !== id && v.length >= 16);
        if (id && secret) {
          setApiKeyId(id);
          setApiSecret(secret);
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const trimmedKeyId = apiKeyId.trim();
  const trimmedSecret = apiSecret.trim();

  const handleTestConnection = async () => {
    if (!trimmedKeyId || !trimmedSecret) {
      Alert.alert('', t('finance.greenInvoice.errors.missing_credentials'));
      return;
    }
    setVerifying(true);
    try {
      const res = await greenInvoiceConnectApi.verify({ apiKeyId: trimmedKeyId, apiSecret: trimmedSecret });
      if (res.ok) {
        Alert.alert('', t('finance.greenInvoice.connectionVerified'));
      } else {
        Alert.alert(t('finance.greenInvoice.testFailedTitle'), giErrorMessage(res.error, res.message));
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveConnect = async () => {
    if (!trimmedKeyId || !trimmedSecret) {
      Alert.alert('', t('finance.greenInvoice.errors.missing_credentials'));
      return;
    }
    await onSubmitCredentials(trimmedKeyId, trimmedSecret);
  };

  const scrollCredentialsIntoView = useCallback(() => {
    const scroll = () => kbdScrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 160);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.kbdRoot}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAwareScreenScroll
            ref={kbdScrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            enableOnAndroid
            extraScrollHeight={Platform.OS === 'ios' ? 180 : 220}
            extraHeight={28}
            keyboardOpeningTime={Platform.OS === 'ios' ? 0 : 250}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            style={styles.kbdScroll}
            contentContainerStyle={[
              styles.kbdScrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTopRow}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('finance.greenInvoice.modalTitle')}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.modalCloseBtn, { backgroundColor: '#F4F6FB' }]}
              >
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {connected ? (
              <View style={styles.block}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('finance.greenInvoice.keyIdLabel')}</Text>
                <Text style={[styles.value, { color: theme.text }]}>{storedKeyId || '—'}</Text>
                <Text style={[styles.comingSoon, { color: theme.textSecondary }]}>{t('finance.greenInvoice.comingSoon')}</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.disconnectBtn]}
                  onPress={onDisconnect}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: theme.error }]}>{t('finance.greenInvoice.disconnect')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.limitNote, { color: theme.textSecondary }]}>
                  {t('finance.greenInvoice.oauthLimitNote')}
                </Text>

                <View style={[styles.webToolbar, { borderColor: `${theme.border}33` }]}>
                  <TouchableOpacity
                    style={[styles.toolbarBtn, { backgroundColor: `${accentColor}18` }]}
                    onPress={() => webRef.current?.reload()}
                  >
                    <Text style={[styles.toolbarBtnText, { color: accentColor }]}>{t('finance.greenInvoice.reloadWeb')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toolbarBtn, { backgroundColor: `${accentColor}18` }]}
                    onPress={() =>
                      webRef.current?.injectJavaScript(
                        `window.location.href = ${JSON.stringify(GI_API_KEYS)}; true;`,
                      )
                    }
                  >
                    <KeyRound size={16} color={accentColor} />
                    <Text style={[styles.toolbarBtnText, { color: accentColor }]}>{t('finance.greenInvoice.openApiKeysPage')}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.expandToggle, { borderColor: `${accentColor}44` }]}
                  onPress={() => setWebExpanded((v) => !v)}
                >
                  <Text style={[styles.expandToggleText, { color: accentColor }]}>
                    {webExpanded ? t('finance.greenInvoice.shrinkBrowser') : t('finance.greenInvoice.expandBrowser')}
                  </Text>
                </TouchableOpacity>

                <WebView
                  ref={webRef}
                  key={webResetKey}
                  source={{ uri: GI_SIGNIN }}
                  style={[styles.webview, { height: webExpanded ? 360 : 200 }]}
                  onMessage={onWebMessage}
                  javaScriptEnabled
                  domStorageEnabled
                  sharedCookiesEnabled
                  thirdPartyCookiesEnabled
                  setSupportMultipleWindows={false}
                  originWhitelist={['https://*', 'http://*']}
                />

                <TouchableOpacity
                  style={[styles.helpLink, { borderColor: `${accentColor}55` }]}
                  onPress={() => webRef.current?.injectJavaScript(INJECT_SCAN_INPUTS)}
                >
                  <ExternalLink size={18} color={accentColor} />
                  <Text style={[styles.helpLinkText, { color: accentColor }]}>
                    {t('finance.greenInvoice.tryReadFromPage')}
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.sectionLabel, { color: theme.text }]}>{t('finance.greenInvoice.credentialsSection')}</Text>
                <Text style={[styles.label, { color: theme.textSecondary, marginBottom: 6 }]}>{t('finance.greenInvoice.keyIdLabel')}</Text>
                <TextInput
                  style={[styles.credentialInput, { borderColor: `${theme.border}55`, color: theme.text, backgroundColor: '#FAFBFD' }]}
                  value={apiKeyId}
                  onChangeText={setApiKeyId}
                  onFocus={scrollCredentialsIntoView}
                  placeholder={t('finance.greenInvoice.keyIdPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  textAlign="right"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.label, { color: theme.textSecondary, marginBottom: 6, marginTop: 12 }]}>{t('finance.greenInvoice.secretLabel')}</Text>
                <TextInput
                  style={[styles.credentialInput, { borderColor: `${theme.border}55`, color: theme.text, backgroundColor: '#FAFBFD' }]}
                  value={apiSecret}
                  onChangeText={setApiSecret}
                  onFocus={scrollCredentialsIntoView}
                  placeholder={t('finance.greenInvoice.secretPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  textAlign="right"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: `${accentColor}99` }]}
                  onPress={handleTestConnection}
                  disabled={saving || verifying}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : (
                    <Text style={[styles.secondaryBtnText, { color: accentColor }]}>{t('finance.greenInvoice.testConnection')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: accentColor }]}
                  onPress={handleSaveConnect}
                  disabled={saving || verifying}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('finance.greenInvoice.finishConnect')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => Linking.openURL('https://www.greeninvoice.co.il/help-center/generating-api-key')}
                  style={styles.footerHelp}
                >
                  <Text style={[styles.footerHelpText, { color: theme.textSecondary }]}>
                    {t('finance.greenInvoice.openHelp')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAwareScreenScroll>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kbdRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  kbdScroll: {
    flex: 1,
    width: '100%',
    maxHeight: '100%',
  },
  kbdScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    direction: 'rtl',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitNote: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'right',
    marginBottom: 12,
  },
  webToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  expandToggle: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  expandToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  webview: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#F4F6FB',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  helpLinkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  credentialInput: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 0,
    textAlign: 'right',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
  primaryBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  disconnectBtn: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
  },
  block: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  comingSoon: {
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 12,
  },
  footerHelp: {
    alignItems: 'center',
    marginTop: 12,
  },
  footerHelpText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
