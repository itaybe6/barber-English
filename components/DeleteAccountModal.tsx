import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, AlertTriangle, Trash2 } from 'lucide-react-native';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/authStore';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteAccountModal({ visible, onClose, onSuccess }: DeleteAccountModalProps) {
  const { colors: businessColors } = useBusinessColors();
  const logout = useAuthStore((state) => state.logout);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const handleDeleteAccount = async () => {
    Alert.alert(
      t('profile.delete.title', 'Delete Account'),
      t('profile.delete.confirm', 'Are you absolutely sure you want to delete your account? This action cannot be undone and will permanently delete all your data.'),
      [
        {
          text: t('cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.delete.confirmButton', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            
            try {
              const success = await usersApi.deleteUserAndAllData();
              
              if (success) {
                Alert.alert(
                  t('success.generic', 'Success'),
                  t('profile.delete.success', 'Your account and all associated data have been permanently deleted.'),
                  [
                    {
                      text: t('ok', 'OK'),
                      onPress: () => {
                        onClose();
                        logout();
                        onSuccess();
                      }
                    }
                  ]
                );
              } else {
                Alert.alert(t('error.generic', 'Error'), t('profile.delete.failed', 'Failed to delete account'));
              }
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert(t('error.generic', 'Error'), t('profile.delete.failed', 'Failed to delete account'));
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.delete.title', 'Delete Account')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.warningContainer}>
            <AlertTriangle size={48} color="#FF3B30" style={styles.warningIcon} />
            <Text style={styles.warningTitle}>{t('profile.delete.warningTitle', 'Warning: This action is irreversible')}</Text>
            <Text style={styles.warningText}>
              {t('profile.delete.warningBody', 'Deleting your account will permanently remove:')}
            </Text>
          </View>

          <View style={styles.listContainer}>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.profile', 'Your user profile')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.appointments', 'All appointments')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.constraints', 'Business constraints')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.hours', 'Business hours')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.gallery', 'Designs and gallery')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.notifications', 'Notifications')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.recurring', 'Recurring appointments')}</Text>
            </View>
            <View style={styles.listItem}>
              <Trash2 size={16} color="#666" />
              <Text style={styles.listText}>{t('profile.delete.items.waitlist', 'Waitlist entries')}</Text>
            </View>
          </View>

          <View style={styles.noteContainer}>
            <Text style={styles.noteText}>
              {t('profile.delete.note','This action cannot be undone. Please make sure you have backed up any important data before proceeding.')}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: businessColors.primary }]}
            onPress={onClose}
            disabled={isLoading}
          >
            <Text style={[styles.cancelButtonText, { color: businessColors.primary }]}>
              {t('cancel','Cancel')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: '#FF3B30' }]}
            onPress={handleDeleteAccount}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Trash2 size={16} color="white" style={styles.deleteIcon} />
                <Text style={styles.deleteButtonText}>{t('profile.delete.title','Delete Account')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  warningContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  warningIcon: {
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  listContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  listText: {
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 12,
  },
  noteContainer: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  noteText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteIcon: {
    marginRight: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
