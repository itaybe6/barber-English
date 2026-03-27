import React, { useMemo } from 'react';
import { Modal, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BookingSuccessAnimatedOverlay from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import {
  buildPendingApprovalSuccessLines,
  type PendingApprovalAnimatedVariant,
} from '@/lib/login/buildPendingApprovalSuccessLines';

interface Props {
  visible: boolean;
  /** Increment when reopening so word-by-word animation runs again. */
  replayKey: number;
  variant: PendingApprovalAnimatedVariant;
  phone: string;
  accentColor: string;
  onDismiss: () => void;
}

export function PendingApprovalAnimatedModal({
  visible,
  replayKey,
  variant,
  phone,
  accentColor,
  onDismiss,
}: Props) {
  const { t, i18n } = useTranslation();
  const rtl = (i18n.language || 'he').startsWith('he');
  const lines = useMemo(
    () => (visible ? buildPendingApprovalSuccessLines(t, variant, phone) : []),
    [visible, t, variant, phone],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      {visible ? (
        <View style={{ flex: 1 }}>
          <BookingSuccessAnimatedOverlay
            key={replayKey}
            lines={lines}
            rtl={rtl}
            accentColor={accentColor}
            onDismiss={onDismiss}
            gotItLabel={t('booking.gotIt', 'Got it')}
          />
        </View>
      ) : null}
    </Modal>
  );
}
