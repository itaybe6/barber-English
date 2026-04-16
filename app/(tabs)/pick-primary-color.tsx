import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Dimensions,
  ActivityIndicator,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import Colors from '@/constants/colors';
import { Flower, type FlowerHandle, type GradientPair } from '@/components/color-picker/Flower';
import AdminAnimatedCustomColorPicker from '@/components/color-picker/AdminAnimatedCustomColorPicker';
import {
  PRIMARY_COLOR_PRESETS,
  EXTENDED_PRIMARY_COLOR_GRID,
  type PrimaryColorPreset,
} from '@/lib/constants/primaryColorPresets';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { useCustomColorsStore } from '@/stores/customColorsStore';
import { usePickPrimaryColorTabBar } from '@/contexts/PickPrimaryColorTabBarContext';
import { AnimatedSentence } from '@/components/book-appointment/AnimatedSentence';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

/** Darken a hex color by a ratio 0–1. */
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

function lightenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * ratio));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function makePreset(hex: string): PrimaryColorPreset {
  return { hex: hex.toUpperCase(), gradient: { start: hex, end: lightenHex(hex, 0.38) } };
}

/** מרווח מעל הטאב הצף בלבד — ה־SafeAreaView כבר מטפל ב־insets.bottom */
const FLOATING_TAB_BAR_CLEARANCE = 88;
/** מרכוז אנכי מעט מעל אמצע המסך, כדי שלא יידבקו לבר התחתון (עלייה קלה = ערך גבוה יותר) */
const VERTICAL_CENTER_BIAS_UP = 72;
const WORD_STAGGER_HEADLINE = 58;
const WORD_STAGGER_HINT = 48;
const LINE_GAP_MS = 108;

export default function PickPrimaryColorScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { returnSettingsTab: returnSettingsTabParam } = useLocalSearchParams<{
    returnSettingsTab?: string | string[];
  }>();
  const normalizedReturnSettingsTab = useMemo(() => {
    const raw = returnSettingsTabParam;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  }, [returnSettingsTabParam]);
  const { height: windowHeight } = useWindowDimensions();
  const { colors, updatePrimaryColor } = useBusinessColors();
  const { triggerColorUpdate } = useColorUpdate();
  const { customColors, addCustomColor } = useCustomColorsStore();
  const pickPrimaryTabBar = usePickPrimaryColorTabBar();

  const [showExtendedPalette, setShowExtendedPalette] = useState(false);
  const [showHsvPicker, setShowHsvPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [colorFanOpen, setColorFanOpen] = useState(false);
  const flowerRef = useRef<FlowerHandle | null>(null);
  const savingLock = useRef(false);
  const isSavingRef = useRef(false);
  isSavingRef.current = isSaving;

  const flowerSize = useMemo(() => {
    const w = Dimensions.get('window').width;
    return Math.min(300, Math.max(248, Math.floor(w * 0.72)));
  }, []);

  const [previewHex, setPreviewHex] = useState<string>(
    () => colors.primary || PRIMARY_COLOR_PRESETS[0]?.hex || '#1E3A8A'
  );

  // Merge custom colors into the presets (newest custom first, replaces last N slots).
  const mergedPresets: PrimaryColorPreset[] = useMemo(() => {
    const base = [...PRIMARY_COLOR_PRESETS];
    if (customColors.length === 0) return base;
    const customPresets = customColors.map(makePreset);
    // Replace the last N entries with the custom colors.
    return [...base.slice(0, base.length - customPresets.length), ...customPresets];
  }, [customColors]);

  const mergedGradients: GradientPair[] = useMemo(
    () => mergedPresets.map((p) => p.gradient),
    [mergedPresets]
  );

  /** מרכז העיגול תמיד לפי הפריוויו — גם לצבע מלוח מורחב שלא ברשימת העלים */
  const previewCenterGradient: GradientPair = useMemo(() => {
    const hex = previewHex?.trim() || PRIMARY_COLOR_PRESETS[0]?.hex || '#1E3A8A';
    return makePreset(hex).gradient;
  }, [previewHex]);

  // Extended grid: custom colors prepended.
  const extendedGrid: string[] = useMemo(
    () => [...customColors, ...EXTENDED_PRIMARY_COLOR_GRID],
    [customColors]
  );

  /** אינדקס עלה שמציג את הפריוויו הנוכחי — חייב להתאים ל־previewHex (לא רק לצבע השמור בפרופיל). */
  const previewActiveIndex = useMemo(() => {
    const n = (previewHex || '#000000').replace(/\s/g, '').toUpperCase();
    const withHash = n.startsWith('#') ? n : `#${n}`;
    const i = mergedPresets.findIndex((p) => p.hex.toUpperCase() === withHash);
    return i >= 0 ? i : 0;
  }, [previewHex, mergedPresets]);

  const isNewColor =
    previewHex.replace('#', '').toUpperCase() !==
    (colors.primary || '').replace('#', '').toUpperCase();

  const fg = readableOnHex(previewHex);
  const onDark = fg === '#FFFFFF';

  /** כמו מסך סיכום תור אחרי קביעת תור — בהיר למעלה, כהה למטה */
  const loginGradient = useMemo(
    () => [lightenHex(previewHex, 0.1), darkenHex(previewHex, 0.42)] as const,
    [previewHex]
  );
  const gradientEnd = loginGradient[1];

  const rtl = (i18n?.language || 'he').startsWith('he');
  const writingDirection = rtl ? ('rtl' as const) : ('ltr' as const);

  const headlineText = t('color.chooseYourApp', 'Choose Your App Color').trim();
  const hintText = t('color.flowerHint', 'Tap the circle to pick a main color').trim();
  const headlineWordCount = headlineText ? headlineText.split(/\s+/).filter(Boolean).length : 0;
  const hintWordCount = hintText ? hintText.split(/\s+/).filter(Boolean).length : 0;
  const subtitleBaseDelay = headlineWordCount * WORD_STAGGER_HEADLINE + LINE_GAP_MS;
  const flowerEnterDelay = subtitleBaseDelay + hintWordCount * WORD_STAGGER_HINT + 160;
  const dividerEnterDelay = Math.max(0, headlineWordCount * WORD_STAGGER_HEADLINE + 36);

  const headlineStyle = useMemo(
    () => [
      styles.pickHeadline,
      {
        textAlign: 'left' as const,
        writingDirection,
        color: fg,
      },
      onDark ? styles.pickHeadlineShadowDark : styles.pickHeadlineShadowLight,
      ...(Platform.OS === 'android' ? [styles.pickHeadlineAndroid] : []),
    ],
    [fg, onDark, writingDirection]
  );

  const hintStyle = useMemo(
    () => [
      styles.pickHint,
      {
        textAlign: 'center' as const,
        writingDirection,
        color: onDark ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.58)',
      },
    ],
    [onDark, writingDirection]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const onPresetLeafPress = useCallback((index: number) => {
    const preset = mergedPresets[index];
    if (!preset) return;
    setPreviewHex(preset.hex);
  }, [mergedPresets]);

  const onPaletteSwatchPress = useCallback((hex: string) => {
    setPreviewHex(hex);
    setShowExtendedPalette(false);
  }, []);

  /** Called from HSV picker "Save" — stores custom + sets preview. */
  const onCustomColorConfirm = useCallback((hex: string) => {
    addCustomColor(hex);
    setPreviewHex(hex);
    setShowHsvPicker(false);
  }, [addCustomColor]);

  /** מחזיר את הפריוויו לצבע השמור בפרופיל (התגית נעלמת כי isNewColor נהיה false). */
  const resetPreviewToSaved = useCallback(() => {
    const raw = colors.primary || PRIMARY_COLOR_PRESETS[0]?.hex || '#1E3A8A';
    const n = raw.replace(/\s/g, '').toUpperCase();
    setPreviewHex(n.startsWith('#') ? n : `#${n}`);
  }, [colors.primary]);

  const confirmAndSave = useCallback(async () => {
    if (savingLock.current) return;
    savingLock.current = true;
    setIsSaving(true);
    try {
      const ok = await updatePrimaryColor(previewHex);
      if (ok) {
        triggerColorUpdate();
        router.replace('/(tabs)' as const);
      } else {
        Alert.alert(t('error.generic', 'Error'), t('color.updateFailed', 'Unable to update the color'));
      }
    } catch (e) {
      console.error('pick primary color', e);
      Alert.alert(t('error.generic', 'Error'), t('color.updateFailed', 'Unable to update the color'));
    } finally {
      savingLock.current = false;
      setIsSaving(false);
    }
  }, [previewHex, router, t, triggerColorUpdate, updatePrimaryColor]);

  useEffect(() => {
    pickPrimaryTabBar.register({
      openCustomPicker: () => {
        if (isSavingRef.current) return;
        setShowHsvPicker(true);
      },
      openPaletteGrid: () => {
        if (isSavingRef.current) return;
        setShowExtendedPalette(true);
      },
      returnSettingsTab: normalizedReturnSettingsTab,
    });
    return () => pickPrimaryTabBar.register(null);
  }, [pickPrimaryTabBar, normalizedReturnSettingsTab]);

  useEffect(() => {
    setColorFanOpen(false);
  }, [customColors]);

  return (
    <View style={styles.root}>
      {/* רקע כמו אחרי קביעת תור — גרדיאנט + lava */}
      <LinearGradient
        colors={[...loginGradient]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      {Platform.OS !== 'web' ? (
        <BrandLavaLampBackground
          primaryColor={previewHex}
          baseColor={gradientEnd}
          count={4}
          duration={16000}
          blurIntensity={48}
        />
      ) : null}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              flexGrow: 1,
              /* גובה “שימושי” קצר יותר מגובה המסך — המרכוז (justifyContent) עולה, לא נדבק לטאב */
              minHeight: windowHeight - VERTICAL_CENTER_BIAS_UP,
              justifyContent: 'center',
              /* בלי insets.top: ה־SafeAreaView כבר דוחף את ה־ScrollView מתחת לסטטוס-בר */
              paddingTop: 12,
              paddingBottom: FLOATING_TAB_BAR_CLEARANCE + 20,
              /* center גורם לילדים להתכווץ לרוחב התוכן — ב־RTL נראה כאילו הכול נדחף לצד */
              alignItems: 'stretch',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {colorFanOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('color.dismissColorFan', 'Close color fan')}
              onPress={() => flowerRef.current?.collapse()}
              style={[
                styles.dismissFanOverlay,
                { minHeight: windowHeight - VERTICAL_CENTER_BIAS_UP },
              ]}
            />
          ) : null}

          <View style={styles.copyBlock}>
            <View style={styles.headlineBlock}>
              <View style={styles.lineWrap}>
                <AnimatedSentence
                  rtl={rtl}
                  fullWidth
                  rowJustify="center"
                  stagger={WORD_STAGGER_HEADLINE}
                  baseDelay={0}
                  style={headlineStyle}
                  maxFontSizeMultiplier={1.08}
                >
                  {headlineText}
                </AnimatedSentence>
              </View>
            </View>

            <Animated.View
              entering={FadeIn.duration(420).delay(dividerEnterDelay)}
              style={[
                styles.pickDivider,
                {
                  alignSelf: 'center',
                  backgroundColor: onDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.22)',
                },
              ]}
            />

            <View style={styles.lineWrapDetail}>
              <AnimatedSentence
                rtl={rtl}
                fullWidth
                rowJustify="center"
                stagger={WORD_STAGGER_HINT}
                baseDelay={subtitleBaseDelay}
                style={hintStyle}
                maxFontSizeMultiplier={1.15}
              >
                {hintText}
              </AnimatedSentence>
            </View>
          </View>

          <Animated.View
            entering={ZoomIn.delay(flowerEnterDelay).springify().damping(17).stiffness(200)}
            style={styles.flowerWrap}
          >
            <Flower
              ref={flowerRef}
              key={`flower-${customColors.join(',')}`}
              leafs={mergedPresets.length}
              size={flowerSize}
              gradients={mergedGradients}
              centerPreviewGradient={previewCenterGradient}
              initialActiveIndex={previewActiveIndex}
              onPress={onPresetLeafPress}
              onOpenChange={setColorFanOpen}
              duration={1000}
            />
          </Animated.View>

          {isNewColor &&
            (isSaving ? (
              <ActivityIndicator color={fg} style={styles.savingIndicator} />
            ) : (
              <View style={styles.confirmActionsBlock}>
                <TouchableOpacity
                  style={[
                    styles.confirmBtnPill,
                    onDark
                      ? {
                          borderColor: 'rgba(255,255,255,0.65)',
                          backgroundColor: 'rgba(255,255,255,0.18)',
                        }
                      : {
                          borderColor: 'rgba(0,0,0,0.18)',
                          backgroundColor: 'rgba(255,255,255,0.92)',
                        },
                  ]}
                  onPress={confirmAndSave}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.confirmBtnPillText, { color: onDark ? '#FFFFFF' : '#1C1C1E' }]}>
                    {t('color.confirm', 'Confirm color')}
                  </Text>
                </TouchableOpacity>

                <Pressable
                  onPress={resetPreviewToSaved}
                  style={({ pressed }) => [
                    styles.resetChip,
                    onDark
                      ? {
                          borderColor: 'rgba(255,255,255,0.42)',
                          backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
                        }
                      : {
                          borderColor: 'rgba(0,0,0,0.2)',
                          backgroundColor: pressed ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
                        },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('color.resetPreviewA11y', 'Reset to saved color')}
                >
                  <RotateCcw
                    size={17}
                    color={onDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.65)'}
                    strokeWidth={2.4}
                  />
                  <Text
                    style={[
                      styles.resetChipText,
                      { color: onDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.72)' },
                    ]}
                  >
                    {t('color.resetPreview', 'Reset')}
                  </Text>
                </Pressable>
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>

      {/* ── HSV custom picker modal ── */}
      <Modal
        visible={showHsvPicker}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
        onRequestClose={() => setShowHsvPicker(false)}
      >
        <AdminAnimatedCustomColorPicker
          initialHex={previewHex}
          onConfirm={onCustomColorConfirm}
          onCancel={() => setShowHsvPicker(false)}
        />
      </Modal>

      {/* ── Extended grid palette modal ── */}
      <Modal
        visible={showExtendedPalette}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={() => setShowExtendedPalette(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('color.paletteTitle', 'Color palette')}</Text>
            <Pressable onPress={() => setShowExtendedPalette(false)} hitSlop={12} style={styles.modalClose}>
              <Ionicons name="close" size={28} color={Colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.paletteGrid} keyboardShouldPersistTaps="handled">
            {extendedGrid.map((hex, idx) => (
              <TouchableOpacity
                key={`${hex}-${idx}`}
                style={[
                  styles.paletteSwatch,
                  { backgroundColor: hex },
                  previewHex.toUpperCase() === hex.toUpperCase() && styles.paletteSwatchSelected,
                ]}
                onPress={() => onPaletteSwatchPress(hex)}
                activeOpacity={0.85}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const SWATCH = 46;
const GAP = 10;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: {
    width: '100%',
    paddingHorizontal: 22,
  },
  /** מאחורי הטקסט; מניפה ועיגול מעל (zIndex גבוה יותר) */
  dismissFanOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
  },
  copyBlock: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 2,
    alignItems: 'center',
    zIndex: 1,
  },
  headlineBlock: {
    marginBottom: 18,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  lineWrap: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    marginBottom: 4,
    alignItems: 'center',
  },
  pickHeadline: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 40,
  },
  pickHeadlineShadowDark: {
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  pickHeadlineShadowLight: {
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pickHeadlineAndroid: { includeFontPadding: false },
  pickDivider: {
    height: 3,
    width: 56,
    borderRadius: 2,
    marginBottom: 18,
  },
  lineWrapDetail: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    marginBottom: 4,
    alignItems: 'center',
  },
  pickHint: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  flowerWrap: {
    marginTop: 22,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  savingIndicator: { marginTop: 24, alignSelf: 'center' },
  confirmActionsBlock: {
    marginTop: 22,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 14,
    zIndex: 1,
  },
  confirmBtnPill: {
    width: '100%',
    minHeight: 56,
    paddingVertical: 17,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
    }),
  },
  confirmBtnPillText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetChipText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.15,
  },

  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalClose: { position: 'absolute', right: 8, top: 4, padding: 8 },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: 16,
    gap: GAP,
    paddingBottom: 40,
  },
  paletteSwatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteSwatchSelected: { borderColor: '#007AFF', borderWidth: 3 },
});
