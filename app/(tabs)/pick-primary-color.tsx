import React, { useCallback, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Colors from '@/constants/colors';
import { Flower, type GradientPair } from '@/components/color-picker/Flower';
import HsvColorPicker from '@/components/color-picker/HsvColorPicker';
import {
  PRIMARY_COLOR_PRESETS,
  EXTENDED_PRIMARY_COLOR_GRID,
  type PrimaryColorPreset,
} from '@/lib/constants/primaryColorPresets';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { useCustomColorsStore } from '@/stores/customColorsStore';

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

export default function PickPrimaryColorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, updatePrimaryColor } = useBusinessColors();
  const { triggerColorUpdate } = useColorUpdate();
  const { customColors, addCustomColor } = useCustomColorsStore();

  const [showExtendedPalette, setShowExtendedPalette] = useState(false);
  const [showHsvPicker, setShowHsvPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingLock = useRef(false);

  const flowerSize = useMemo(() => {
    const w = Dimensions.get('window').width;
    return Math.min(300, Math.max(248, Math.floor(w * 0.72)));
  }, []);

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

  // Extended grid: custom colors prepended.
  const extendedGrid: string[] = useMemo(
    () => [...customColors, ...EXTENDED_PRIMARY_COLOR_GRID],
    [customColors]
  );

  const initialActiveIndex = useMemo(() => {
    const n = (colors.primary || '#000000').replace(/\s/g, '').toUpperCase();
    const i = mergedPresets.findIndex((p) => p.hex.toUpperCase() === n);
    return i >= 0 ? i : 0;
  }, [colors.primary, mergedPresets]);

  // Separate preview (tapping a petal) from the confirmed save.
  const [previewHex, setPreviewHex] = useState<string>(
    () => colors.primary || PRIMARY_COLOR_PRESETS[0]?.hex || '#1E3A8A'
  );

  const isNewColor =
    previewHex.replace('#', '').toUpperCase() !==
    (colors.primary || '').replace('#', '').toUpperCase();

  const fg = readableOnHex(previewHex);
  const onDark = fg === '#FFFFFF';

  const gradientColors = useMemo(
    () => [darkenHex(previewHex, 0.28), previewHex] as [string, string],
    [previewHex]
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

  /** Hidden tab screen: `router.back()` often pops to the default tab (home), not settings. */
  const exitToSettings = useCallback(() => {
    router.replace('/(tabs)/settings' as const);
  }, [router]);

  const confirmAndSave = useCallback(async () => {
    if (savingLock.current) return;
    savingLock.current = true;
    setIsSaving(true);
    try {
      const ok = await updatePrimaryColor(previewHex);
      if (ok) {
        triggerColorUpdate();
        exitToSettings();
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
  }, [exitToSettings, previewHex, t, triggerColorUpdate, updatePrimaryColor]);

  return (
    <View style={styles.root}>
      {/* Full-screen gradient background */}
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(8, insets.top > 0 ? 0 : 8) }]}>
          <TouchableOpacity
            onPress={exitToSettings}
            hitSlop={12}
            disabled={isSaving}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward" size={24} color={fg} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: fg }]}>
            {t('color.chooseYourApp', 'Choose Your App Color')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.subtitle, { color: onDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.5)' }]}>
            {t('color.flowerHint', 'Tap a petal to choose a main color')}
          </Text>

          {/* Flower with merged presets */}
          <View style={styles.flowerWrap}>
            <Flower
              key={`flower-${initialActiveIndex}-${customColors.join(',')}`}
              leafs={mergedPresets.length}
              size={flowerSize}
              gradients={mergedGradients}
              initialActiveIndex={initialActiveIndex}
              onPress={onPresetLeafPress}
              duration={1000}
            />
          </View>

          {/* ── Custom color pickers row ── */}
          <View style={styles.customRow}>
            {/* Open HSV picker */}
            <TouchableOpacity
              style={[
                styles.paletteBtn,
                onDark ? { borderColor: 'rgba(255,255,255,0.35)' } : { borderColor: 'rgba(0,0,0,0.15)' },
              ]}
              onPress={() => setShowHsvPicker(true)}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Ionicons
                name="color-palette-outline"
                size={16}
                color={onDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)'}
                style={styles.paletteBtnIcon}
              />
              <Text style={[styles.paletteBtnText, { color: onDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)' }]}>
                {t('color.customPersonal', 'Custom personal color')}
              </Text>
            </TouchableOpacity>

            {/* Open grid palette */}
            <TouchableOpacity
              style={[
                styles.gridBtn,
                onDark ? { borderColor: 'rgba(255,255,255,0.35)' } : { borderColor: 'rgba(0,0,0,0.15)' },
              ]}
              onPress={() => setShowExtendedPalette(true)}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Ionicons
                name="grid-outline"
                size={16}
                color={onDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)'}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm button — inline, only if preview ≠ saved */}
          {isNewColor && (
            isSaving ? (
              <ActivityIndicator color={fg} style={styles.savingIndicator} />
            ) : (
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  onDark ? { backgroundColor: 'rgba(255,255,255,0.95)' } : { backgroundColor: '#1C1C1E' },
                  { marginBottom: 80 },
                ]}
                onPress={confirmAndSave}
                activeOpacity={0.85}
              >
                <Text style={[styles.confirmBtnText, { color: onDark ? previewHex : '#FFFFFF' }]}>
                  {t('color.confirm', 'Confirm color')}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── HSV custom picker modal ── */}
      <Modal
        visible={showHsvPicker}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={() => setShowHsvPicker(false)}
      >
        <SafeAreaView style={styles.hsvModalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t('color.customPersonal', 'Custom personal color')}
            </Text>
            <Pressable onPress={() => setShowHsvPicker(false)} hitSlop={12} style={styles.modalClose}>
              <Ionicons name="close" size={28} color={Colors.text} />
            </Pressable>
          </View>
          {/* Plain View — no ScrollView — so PanResponder gestures are never stolen */}
          <View style={styles.hsvContent}>
            <HsvColorPicker
              initialHex={previewHex}
              onConfirm={onCustomColorConfirm}
              onCancel={() => setShowHsvPicker(false)}
              confirmLabel={t('color.saveCustom', 'Save & use')}
              cancelLabel={t('cancel', 'Cancel')}
            />
          </View>
        </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerSpacer: { width: 44 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center' },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
    lineHeight: 22,
  },
  flowerWrap: { marginVertical: 12, alignItems: 'center', justifyContent: 'center' },

  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    alignSelf: 'center',
  },
  paletteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  paletteBtnIcon: { marginRight: 6 },
  paletteBtnText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.1 },
  gridBtn: {
    padding: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingIndicator: { marginTop: 20, marginBottom: 80 },
  confirmBtn: {
    marginTop: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    alignSelf: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.25 },

  hsvModalSafe: { flex: 1, backgroundColor: '#FAFAFA' },
  hsvContent: { paddingBottom: 24, flex: 1 },
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
