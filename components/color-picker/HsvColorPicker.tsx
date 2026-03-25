/**
 * Interactive HSV colour picker.
 * Gesture strategy:
 *  - Uses onStart/MoveShouldSetPanResponder**Capture** so it captures the
 *    touch before any parent ScrollView can claim it.
 *  - Measures the absolute (page-level) origin of each draggable element
 *    on first touch, then uses pageX/pageY for all subsequent move events
 *    so the thumb tracks the finger accurately regardless of nesting.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Platform,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ─── HSV ↔ RGB ↔ HEX helpers ────────────────────────────────────────────────

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(...hsvToRgb(h, s, v));
}

export function hexToHsv(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [0, 1, 1];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r)      hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else                hue = ((r - g) / d + 4) * 60;
  }
  const sat = max === 0 ? 0 : d / max;
  return [Math.round(hue), sat, max];
}

const HUE_STOPS: string[] = [
  '#FF0000', '#FF8000', '#FFFF00', '#80FF00',
  '#00FF00', '#00FF80', '#00FFFF', '#0080FF',
  '#0000FF', '#8000FF', '#FF00FF', '#FF0080', '#FF0000',
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  initialHex?: string;
  onConfirm: (hex: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export default function HsvColorPicker({
  initialHex = '#581C87',
  onConfirm,
  onCancel,
  confirmLabel = 'Save color',
  cancelLabel = 'Cancel',
}: Props) {
  const [ih, is_, iv] = hexToHsv(initialHex);
  const [h, setH] = useState(ih);
  const [s, setS] = useState(is_);
  const [v, setV] = useState(Math.max(iv, 0.15));

  const [hexInput, setHexInput] = useState(initialHex.toUpperCase());
  const [hexError, setHexError] = useState(false);

  // Dimensions (set via onLayout — reliable even on first render)
  const svW  = useRef(0);
  const svH  = useRef(0);
  const hueW = useRef(0);

  // Keep latest h/s/v in refs so PanResponder callbacks always have fresh values
  const hRef = useRef(h);
  const sRef = useRef(s);
  const vRef = useRef(v);
  hRef.current = h;
  sRef.current = s;
  vRef.current = v;

  // ── SV plane ────────────────────────────────────────────────────────────
  // locationX/locationY are relative to the responder view's physical left edge —
  // no async measure() needed, no stale-event issues.
  const updateSV = useCallback((locX: number, locY: number) => {
    const relX = I18nManager.isRTL ? (svW.current || 1) - locX : locX;
    const newS = Math.min(1, Math.max(0, relX / (svW.current  || 1)));
    const newV = Math.min(1, Math.max(0, 1 - locY / (svH.current || 1)));
    setS(newS);
    setV(newV);
    setHexInput(hsvToHex(hRef.current, newS, newV).toUpperCase());
    setHexError(false);
  }, []);

  const svPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        updateSV(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => {
        updateSV(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
    })
  ).current;

  // ── Hue slider ──────────────────────────────────────────────────────────
  const updateH = useCallback((locX: number) => {
    const relX = I18nManager.isRTL ? (hueW.current || 1) - locX : locX;
    const newH = Math.min(360, Math.max(0, (relX / (hueW.current || 1)) * 360));
    setH(newH);
    setHexInput(hsvToHex(newH, sRef.current, vRef.current).toUpperCase());
    setHexError(false);
  }, []);

  const huePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        updateH(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => {
        updateH(e.nativeEvent.locationX);
      },
    })
  ).current;

  // ── Hex input ────────────────────────────────────────────────────────────
  const onHexChange = (text: string) => {
    const clean = text.startsWith('#') ? text : '#' + text;
    setHexInput(clean.toUpperCase());
    if (/^#([0-9A-Fa-f]{6})$/.test(clean)) {
      const [nh, ns, nv] = hexToHsv(clean);
      setH(nh); setS(ns); setV(Math.max(nv, 0.05));
      setHexError(false);
    } else {
      setHexError(true);
    }
  };

  const currentHex = hsvToHex(h, s, v);
  const pureHue = rgbToHex(...hsvToRgb(h, 1, 1));

  const isRTL = I18nManager.isRTL;
  const svThumbX  = isRTL ? (1 - s) * svW.current : s * svW.current;
  const svThumbY  = (1 - v) * svH.current;
  const hueThumbX = isRTL ? (1 - h / 360) * hueW.current : (h / 360) * hueW.current;

  return (
    <View style={styles.root}>
      {/* ── SV Plane ── */}
      <View
        style={styles.svBox}
        onLayout={(e: LayoutChangeEvent) => {
          svW.current = e.nativeEvent.layout.width;
          svH.current = e.nativeEvent.layout.height;
        }}
        {...svPan.panHandlers}
      >
        <LinearGradient
          colors={isRTL ? [pureHue, '#FFFFFF'] : ['#FFFFFF', pureHue]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['transparent', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View
          pointerEvents="none"
          style={[
            styles.svThumb,
            {
              left: svThumbX - THUMB_R,
              top:  svThumbY - THUMB_R,
              borderColor: v > 0.55 ? '#000' : '#fff',
            },
          ]}
        />
      </View>

      {/* ── Hue slider ── */}
      <View
        style={styles.hueStrip}
        onLayout={(e: LayoutChangeEvent) => {
          hueW.current = e.nativeEvent.layout.width;
        }}
        {...huePan.panHandlers}
      >
        <LinearGradient
          colors={isRTL ? [...HUE_STOPS].reverse() : HUE_STOPS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View
          pointerEvents="none"
          style={[styles.hueThumb, { left: hueThumbX - HUE_THUMB_R }]}
        />
      </View>

      {/* ── Preview + Hex input ── */}
      <View style={styles.inputRow}>
        <View style={[styles.previewDot, { backgroundColor: currentHex }]} />
        <TextInput
          style={[styles.hexInput, hexError && styles.hexInputError]}
          value={hexInput}
          onChangeText={onHexChange}
          placeholder="#000000"
          placeholderTextColor="#aaa"
          maxLength={7}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
        />
      </View>

      {/* ── Buttons ── */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: hexError ? '#ccc' : currentHex }]}
          onPress={() => !hexError && onConfirm(currentHex)}
          activeOpacity={0.85}
          disabled={hexError}
        >
          <Text style={styles.saveBtnText}>{confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const THUMB_R     = 12;
const HUE_THUMB_R = 10;

const styles = StyleSheet.create({
  root: {
    padding: 16,
    gap: 18,
  },
  svBox: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    overflow: 'hidden',
  },
  svThumb: {
    position: 'absolute',
    width:  THUMB_R * 2,
    height: THUMB_R * 2,
    borderRadius: THUMB_R,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  hueStrip: {
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  hueThumb: {
    position: 'absolute',
    top: (28 - HUE_THUMB_R * 2) / 2,
    width:  HUE_THUMB_R * 2,
    height: HUE_THUMB_R * 2,
    borderRadius: HUE_THUMB_R,
    borderWidth: 2.5,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7C7CC',
    flexShrink: 0,
  },
  hexInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#1C1C1E',
    backgroundColor: '#FAFAFA',
    letterSpacing: 1,
  },
  hexInputError: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3C3C43',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
