import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Animated, Easing, Platform, KeyboardAvoidingView, I18nManager } from 'react-native';
import { ChevronRight, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

type KeyboardTypeOption = 'default' | 'url';

interface InlineEditableRowProps {
  title: string;
  value: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOption;
  onSave: (next: string) => Promise<void> | void;
  validate?: (v: string) => boolean;
}

export default function InlineEditableRow({
  title,
  value,
  placeholder = 'https://...',
  keyboardType = 'url',
  onSave,
  validate,
}: InlineEditableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current; // 0 collapsed, 1 expanded
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current; // 0 collapsed, 1 expanded

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const isValid = useMemo(() => {
    const v = draft.trim();
    if (validate) return validate(v);
    if (v.length === 0) return true; // allow empty to clear
    return /^https?:\/\//i.test(v);
  }, [draft, validate]);

  const isUnchanged = useMemo(() => (draft || '').trim() === (value || '').trim(), [draft, value]);

  const animateOpen = useCallback(() => {
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // cannot mix native driver when also animating height
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [progressAnim, opacityAnim, rotateAnim]);

  const animateClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false, // keep non-native to allow height animation
      }),
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [progressAnim, opacityAnim, rotateAnim]);

  const onRowPress = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) animateOpen(); else animateClose();
  }, [expanded, animateOpen, animateClose]);

  const onSavePress = useCallback(async () => {
    if (!isValid || isUnchanged || isSaving) return;
    try {
      setIsSaving(true);
      await onSave((draft || '').trim());
      setSavedBanner(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setSavedBanner(false), 1500);
      setExpanded(false);
      animateClose();
    } catch (e) {
      // Let parent handle errors if thrown; keep row open
    } finally {
      setIsSaving(false);
    }
  }, [animateClose, draft, isSaving, isUnchanged, isValid, onSave]);

  // No measuring needed; we animate maxHeight using a fixed cap

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  const rowDirection = I18nManager.isRTL ? 'row-reverse' : 'row';
  const maxHeight = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 160] });

  return (
    <View>
      <TouchableOpacity style={[styles.row, { flexDirection: rowDirection }]} onPress={onRowPress} activeOpacity={0.8}>
        <View style={styles.rowContent}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Animated.View style={[styles.chevronWrap, { transform: [{ rotate: chevronRotate }] }]}>
          <ChevronRight size={20} color={Colors.primary} />
        </Animated.View>
      </TouchableOpacity>
      <Animated.View style={[styles.expandWrap, { maxHeight, opacity: opacityAnim }]}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
          <View>
            <View style={[styles.inputRow, { flexDirection: rowDirection }]}>
              <TextInput
                style={styles.textInput}
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={Colors.subtext}
                keyboardType={keyboardType === 'url' ? 'url' as any : 'default'}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveButton, (!isValid || isUnchanged || isSaving) && styles.saveButtonDisabled]}
                onPress={onSavePress}
                disabled={!isValid || isUnchanged || isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <Text style={styles.saveText}>Saving...</Text>
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            {savedBanner ? (
              <View style={styles.savedBanner}>
                <Check size={16} color="#4CAF50" />
                <Text style={styles.savedText}>Saved</Text>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowContent: {
    flex: 1,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'left',
  },
  chevronWrap: {
    marginLeft: 12,
  },
  expandWrap: {
    overflow: 'hidden',
  },
  inputRow: {
    alignItems: 'center',
    // spacing handled via marginStart on save button to support RTL automatically
  },
  textInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 8,
    color: Colors.text,
  },
  saveButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    marginStart: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  savedText: {
    color: '#4CAF50',
    fontSize: 13,
  },
  divider: {
    height: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.primary,
    borderStyle: 'dashed',
  },
});


