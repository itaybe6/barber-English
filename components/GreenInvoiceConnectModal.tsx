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
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, KeyRound } from 'lucide-react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { parseGreenInvoiceCredentialPaste } from '@/lib/greenInvoicePaste';

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
  const webRef = useRef<WebView>(null);
  const [pasteBlob, setPasteBlob] = useState('');
  const [webExpanded, setWebExpanded] = useState(false);
  const [webResetKey, setWebResetKey] = useState(0);

  useEffect(() => {
    if (visible && !connected) {
      setPasteBlob('');
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
          setPasteBlob(`${id}\n${secret}`);
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const handleConnectParsed = async () => {
    const parsed = parseGreenInvoiceCredentialPaste(pasteBlob);
    if (!parsed) {
      Alert.alert('', t('finance.greenInvoice.pasteInvalid'));
      return;
    }
    await onSubmitCredentials(parsed.apiKeyId, parsed.apiSecret);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <KeyboardAwareScreenScroll
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
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

                <Text style={[styles.sectionLabel, { color: theme.text }]}>{t('finance.greenInvoice.pasteBlockLabel')}</Text>
                <TextInput
                  style={[styles.pasteArea, { borderColor: `${theme.border}55`, color: theme.text, backgroundColor: '#FAFBFD' }]}
                  value={pasteBlob}
                  onChangeText={setPasteBlob}
                  placeholder={t('finance.greenInvoice.pastePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  textAlign="right"
                  textAlignVertical="top"
                  multiline
                  numberOfLines={4}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: accentColor }]}
                  onPress={handleConnectParsed}
                  disabled={saving}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  pasteArea: {
    minHeight: 100,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'right',
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
