/**
 * מסך בחירת צבע מותאם אישית למנהל — טקסטים בעברית בלבד.
 * פאנל RV + גוון: HsvColorPicker (תומך RTL). אנימציות כניסה בסגנון animations/colorpickeranimattion.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  I18nManager,
  KeyboardAvoidingView,
  StatusBar as RNStatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, RotateInDownLeft, RotateInDownRight } from 'react-native-reanimated';
import HsvColorPicker from '@/components/color-picker/HsvColorPicker';

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(n * f).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const HEX_OK = /^#([0-9A-Fa-f]{6})$/;

export interface AdminAnimatedCustomColorPickerProps {
  initialHex: string;
  onConfirm: (hex: string) => void;
  onCancel: () => void;
}

export default function AdminAnimatedCustomColorPicker({
  initialHex,
  onConfirm,
  onCancel,
}: AdminAnimatedCustomColorPickerProps) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** מודאל מסך מלא: לפעמים רק padding ידני נותן מרווח אמיתי מתחת ל־status bar / נוטש */
  const topInset =
    insets.top > 0
      ? insets.top
      : Platform.OS === 'android'
        ? RNStatusBar.currentHeight ?? 0
        : 0;
  const contentTopPadding = topInset + 12;

  const normalizedInitial = useMemo(() => {
    const h = (initialHex || '#9333EA').trim();
    return h.startsWith('#') ? h : `#${h}`;
  }, [initialHex]);

  const [liveHex, setLiveHex] = useState(normalizedInitial);
  const [hexInput, setHexInput] = useState(normalizedInitial.toUpperCase());
  const [rStr, setRStr] = useState(() => String(hexToRgb(normalizedInitial).r));
  const [gStr, setGStr] = useState(() => String(hexToRgb(normalizedInitial).g));
  const [bStr, setBStr] = useState(() => String(hexToRgb(normalizedInitial).b));
  const [manualMode, setManualMode] = useState<'hex' | 'rgb'>('hex');
  const [hexError, setHexError] = useState(false);

  useEffect(() => {
    setLiveHex(normalizedInitial);
    setHexInput(normalizedInitial.toUpperCase());
    const { r, g, b } = hexToRgb(normalizedInitial);
    setRStr(String(r));
    setGStr(String(g));
    setBStr(String(b));
    setHexError(false);
  }, [normalizedInitial]);

  const entering = useMemo(
    () => (Math.random() > 0.5 ? RotateInDownLeft.duration(520) : RotateInDownRight.duration(520)),
    []
  );

  const panelSize = Math.min(Math.max(winW - 40, 220), 340);

  const gradientColors = useMemo(
    () => [darkenHex(liveHex, 0.42), liveHex] as [string, string],
    [liveHex]
  );

  const { r, g, b } = hexToRgb(liveHex);
  const rgbLabel = `RGB ${r}, ${g}, ${b}`;

  const applyHex = useCallback((hex: string) => {
    const withHash = hex.startsWith('#') ? hex : `#${hex}`;
    if (!HEX_OK.test(withHash)) {
      setHexError(true);
      return;
    }
    setHexError(false);
    const upper = withHash.toUpperCase();
    setLiveHex(withHash);
    setHexInput(upper);
    const comp = hexToRgb(withHash);
    setRStr(String(comp.r));
    setGStr(String(comp.g));
    setBStr(String(comp.b));
  }, []);

  const applyRgb = useCallback(() => {
    const rN = parseInt(rStr, 10);
    const gN = parseInt(gStr, 10);
    const bN = parseInt(bStr, 10);
    if ([rN, gN, bN].some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      setHexError(true);
      return;
    }
    setHexError(false);
    const hex = rgbToHex(rN, gN, bN);
    setLiveHex(hex);
    setHexInput(hex.toUpperCase());
  }, [rStr, gStr, bStr]);

  const onSurfaceHexChange = useCallback((hex: string) => {
    setLiveHex(hex);
    setHexInput(hex.toUpperCase());
    const comp = hexToRgb(hex);
    setRStr(String(comp.r));
    setGStr(String(comp.g));
    setBStr(String(comp.b));
    setHexError(false);
  }, []);

  const normalizedLive = liveHex.startsWith('#') ? liveHex : `#${liveHex}`;
  const canSave = !hexError && HEX_OK.test(normalizedLive);

  const pillFg = '#2D1B3D';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={[styles.scrollInner, { paddingTop: contentTopPadding }]}>
            {/* כותרת */}
            <View style={styles.topBar}>
              <Pressable onPress={onCancel} hitSlop={14} style={styles.iconBtn} accessibilityRole="button">
                <Ionicons name={I18nManager.isRTL ? 'arrow-back' : 'arrow-forward'} size={26} color="#FFFFFF" />
              </Pressable>
              <View style={styles.pillsRow}>
                <View style={styles.pill}>
                  <Text style={[styles.pillText, { color: pillFg }]}>{hexInput}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={[styles.pillText, { color: pillFg }]} numberOfLines={1}>
                    {rgbLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.iconBtn} />
            </View>

            <Animated.View entering={entering} style={styles.panelWrap}>
              <View style={styles.pickerHost}>
                <HsvColorPicker
                  embedded
                  valueHex={normalizedLive}
                  onSurfaceHexChange={onSurfaceHexChange}
                  onConfirm={() => {}}
                  onCancel={() => {}}
                  initialHex={normalizedInitial}
                  svBoxHeight={Math.round(panelSize * 0.72)}
                  svBorderRadius={20}
                  hueStripHeight={28}
                />
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(420).delay(120)} style={[styles.copyBlock, styles.copyBlockCenter]}>
              <Text style={[styles.emojiLead, styles.copyTextCenter]}>🎨 צבע ראשי</Text>
              <Text style={[styles.bodyText, styles.copyTextCenter, styles.copyBodyMeasure]}>
                הצבע הראשי הוא הצבע החשוב ביותר בעיצוב. צבע זה צריך למשוך את העין אך לא להיות צורם מדי.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(380).delay(200)} style={[styles.manualSection, styles.manualSectionCenter]}>
              <Text style={[styles.manualLabel, styles.copyTextCenter]}>הזנה ידנית:</Text>
              <View style={[styles.modeRow, styles.modeRowCenter]}>
                <Pressable
                  onPress={() => setManualMode('hex')}
                  style={[styles.modeChip, manualMode === 'hex' && styles.modeChipOn]}
                >
                  <Text style={[styles.modeChipText, manualMode === 'hex' && styles.modeChipTextOn]}>HEX</Text>
                </Pressable>
                <Pressable
                  onPress={() => setManualMode('rgb')}
                  style={[styles.modeChip, manualMode === 'rgb' && styles.modeChipOn]}
                >
                  <Text style={[styles.modeChipText, manualMode === 'rgb' && styles.modeChipTextOn]}>RGB</Text>
                </Pressable>
              </View>

              {manualMode === 'hex' ? (
                <TextInput
                  style={[styles.hexField, styles.hexFieldCentered, hexError && styles.hexFieldErr]}
                  value={hexInput}
                  onChangeText={(t) => {
                    const clean = t.startsWith('#') ? t : `#${t}`;
                    setHexInput(clean.toUpperCase());
                    if (HEX_OK.test(clean)) {
                      setHexError(false);
                      applyHex(clean);
                    } else {
                      const incomplete = clean.length < 7;
                      setHexError(!incomplete && clean.length === 7);
                    }
                  }}
                  onBlur={() => {
                    if (HEX_OK.test(hexInput)) applyHex(hexInput);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={7}
                  placeholder="#000000"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                />
              ) : (
                <View style={[styles.rgbRow, styles.rgbRowCenter]}>
                  <TextInput
                    style={[styles.rgbField, styles.rgbFieldFixed, hexError && styles.hexFieldErr]}
                    value={rStr}
                    onChangeText={setRStr}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="R"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                  />
                  <TextInput
                    style={[styles.rgbField, styles.rgbFieldFixed, hexError && styles.hexFieldErr]}
                    value={gStr}
                    onChangeText={setGStr}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="G"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                  />
                  <TextInput
                    style={[styles.rgbField, styles.rgbFieldFixed, hexError && styles.hexFieldErr]}
                    value={bStr}
                    onChangeText={setBStr}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="B"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                  />
                  <Pressable onPress={applyRgb} style={styles.rgbApply}>
                    <Text style={styles.rgbApplyText}>עדכן</Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </View>

          <View style={styles.saveDock}>
            <Pressable
              onPress={() => canSave && onConfirm(normalizedLive.toUpperCase())}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveCircle,
                !canSave && styles.saveCircleDisabled,
                pressed && canSave && styles.saveCirclePressed,
              ]}
            >
              <Text style={styles.saveLabel}>שמור</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a0a24' },
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrollInner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pillsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    maxWidth: '48%',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  panelWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  pickerHost: {
    width: '100%',
    alignItems: 'stretch',
  },
  copyBlock: {
    marginTop: 10,
    paddingHorizontal: 0,
  },
  copyBlockCenter: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
  },
  copyTextCenter: {
    textAlign: 'center',
  },
  /** רוחב קריאות לפסקה — המרכז לפי המסך */
  copyBodyMeasure: {
    maxWidth: 360,
    alignSelf: 'center',
  },
  emojiLead: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  bodyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  manualSection: {
    marginTop: 22,
  },
  manualSectionCenter: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
  },
  manualLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    marginBottom: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  modeRowCenter: {
    justifyContent: 'center',
    alignSelf: 'center',
  },
  modeChip: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modeChipOn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  modeChipTextOn: {
    color: '#3C3C43',
  },
  hexField: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  hexFieldCentered: {
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
  },
  hexFieldErr: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(80,20,20,0.35)',
  },
  rgbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    gap: 8,
  },
  rgbRowCenter: {
    justifyContent: 'center',
    alignSelf: 'center',
    flexWrap: 'wrap',
    width: '100%',
    maxWidth: 360,
  },
  rgbField: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rgbFieldFixed: {
    flexGrow: 0,
    flexShrink: 0,
    width: 58,
    minWidth: 52,
  },
  rgbApply: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rgbApplyText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  saveDock: {
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  saveCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  saveCircleDisabled: {
    opacity: 0.45,
  },
  saveCirclePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  saveLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#3C3C43',
    letterSpacing: 0.3,
  },
});
