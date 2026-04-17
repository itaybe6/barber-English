import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  open: boolean;
  /** Called to request the sheet to close (set open=false from outside). */
  onRequestClose: () => void;
  /** Called after the sheet has fully dismissed (animation complete). */
  onDismissed: () => void;
  children: React.ReactNode;
};

/**
 * Bottom sheet replacement for AppointmentActionsAnchorSheet.
 * Slides up from the bottom with a drag handle and dim backdrop.
 * Supports drag-to-dismiss and backdrop-tap-to-dismiss.
 */
export function AppointmentActionsBottomSheet({
  open,
  onRequestClose,
  onDismissed,
  children,
}: Props) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (open) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [open]);

  const handleDismiss = useCallback(() => {
    onRequestClose();
    onDismissed();
  }, [onRequestClose, onDismissed]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.48}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      topInset={insets.top + 8}
      animationConfigs={{
        duration: 380,
      }}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  content: {
    paddingTop: 4,
  },
});
