import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAdminWaitlistSheetStore } from '@/stores/adminWaitlistSheetStore';

/**
 * Legacy route used by deep links / notifications (`/(tabs)/waitlist`).
 * The waitlist UI lives in `AdminWaitlistBottomSheet` on the home tab so the backdrop shows real home content.
 */
export default function WaitlistRouteRedirect() {
  const router = useRouter();
  const openSheet = useAdminWaitlistSheetStore((s) => s.open);

  useFocusEffect(
    useCallback(() => {
      openSheet();
      queueMicrotask(() => {
        router.replace('/(tabs)');
      });
    }, [openSheet, router])
  );

  return <View style={{ flex: 1, backgroundColor: 'transparent' }} pointerEvents="none" />;
}
