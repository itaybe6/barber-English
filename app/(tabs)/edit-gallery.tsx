import React, { useEffect, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Dimensions, TextInput, Alert, Platform, Modal, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useDesignsStore } from '@/stores/designsStore';
import type { Design, User } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Using base64 (from ImagePicker) or fetch(uri).blob() as fallback
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { compressImage, compressImages } from '@/lib/utils/imageCompression';

const { width } = Dimensions.get('window');
const numColumns = 2;
const horizontalPadding = 16;
const tileSize = (width - horizontalPadding * 2) / numColumns;
const ACCENT_PURPLE = '#000000';

export default function EditGalleryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { designs, fetchDesigns, createDesign, deleteDesign, updateDesign, isLoading } = useDesignsStore();

  const [name, setName] = useState('');
  const [pickedAssets, setPickedAssets] = useState<Array<{ uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }>>([]);
  const [search] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [editName, setEditName] = useState('');
  const [editSelectedUserId, setEditSelectedUserId] = useState<string>('');
  type LocalAsset = { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null };
  type EditImage = { kind: 'remote'; url: string } | { kind: 'local'; asset: LocalAsset };
  const [editImages, setEditImages] = useState<EditImage[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchDesigns();
    loadAdminUsers();
  }, []);

  const loadAdminUsers = async () => {
    try {
      const users = await usersApi.getAdminUsers();
      setAdminUsers(users);
      if (users.length > 0) {
        setSelectedUserId(users[0].id); // Select the first user as default
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
    }
  };

  const filtered = designs;

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to gallery to select images');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 1.0, // Use highest quality for initial selection, we'll compress later
      selectionLimit: 10,
      base64: false, // We don't need base64 since we'll compress
    });
    if (!result.canceled) {
      try {
        // Compress all selected images
        const imageUris = result.assets.map(a => a.uri);
        const compressedImages = await compressImages(imageUris, {
          quality: 0.7,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'jpeg'
        });
        
        setPickedAssets(
          compressedImages.map((compressed, index) => ({
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          }))
        );
      } catch (error) {
        console.error('Error compressing images:', error);
        Alert.alert('Error', 'Failed to process selected images');
      }
    }
  };

  const guessMimeFromUri = (uriOrName: string): string => {
    const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  };

  const base64ToUint8Array = (base64: string): Uint8Array => {
    // remove data url prefix if present
    const clean = base64.replace(/^data:[^;]+;base64,/, '');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let outputLength = (clean.length / 4) * 3;
    if (clean.endsWith('==')) outputLength -= 2; else if (clean.endsWith('=')) outputLength -= 1;
    const bytes = new Uint8Array(outputLength);
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const enc1 = chars.indexOf(clean.charAt(i));
      const enc2 = chars.indexOf(clean.charAt(i + 1));
      const enc3 = chars.indexOf(clean.charAt(i + 2));
      const enc4 = chars.indexOf(clean.charAt(i + 3));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      bytes[p++] = chr1;
      if (enc3 !== 64) bytes[p++] = chr2;
      if (enc4 !== 64) bytes[p++] = chr3;
    }
    return bytes;
  };

  const uploadImage = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;

      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes; // pass Uint8Array; supabase-js accepts ArrayBufferView as Body
      } else {
        // For Expo, we need to use a different approach
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const arrayBuffer = await response.arrayBuffer();
        fileBody = new Uint8Array(arrayBuffer);
        contentType = response.headers.get('content-type') || contentType;
      }

      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `uploads/${Date.now()}_${randomId()}.${extGuess}`;
      let bucketUsed = 'designs';
      const firstAttempt = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
      if (firstAttempt.error) {
        const msg = String((firstAttempt.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          // Second fallback to 'public' if a different bucket is configured
          bucketUsed = 'public';
          const retry = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
          if (retry.error) {
            console.error('upload error (retry)', retry.error);
            return null;
          }
        } else {
          console.error('upload error', firstAttempt.error);
          return null;
        }
      }
      const { data } = supabase.storage.from(bucketUsed).getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('upload exception', e);
      return null;
    }
  };

  const openEdit = (design: Design) => {
    setSelectedDesign(design);
    setEditName(design.name);
    setEditSelectedUserId(design.user_id || (adminUsers.length > 0 ? adminUsers[0].id : ''));
    const urls = (design.image_urls && design.image_urls.length > 0) ? design.image_urls : [design.image_url];
    setEditImages(urls.map(u => ({ kind: 'remote', url: u })));
    setEditVisible(true);
  };

  const closeEdit = () => {
    setEditVisible(false);
    setSelectedDesign(null);
    setEditName('');
    setEditSelectedUserId('');
    setEditImages([]);
    setIsSavingEdit(false);
  };

  const addImagesToEdit = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to gallery to select images');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1.0, // Use highest quality for initial selection, we'll compress later
      base64: false, // We don't need base64 since we'll compress
    });
    if (!result.canceled && result.assets.length > 0) {
      try {
        // Compress all selected images
        const imageUris = result.assets.map(a => a.uri);
        const compressedImages = await compressImages(imageUris, {
          quality: 0.7,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'jpeg'
        });
        
        const newItems: EditImage[] = compressedImages.map((compressed, index) => ({
          kind: 'local',
          asset: {
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          }
        }));
        setEditImages(prev => [...prev, ...newItems]);
      } catch (error) {
        console.error('Error compressing images:', error);
        Alert.alert('Error', 'Failed to process selected images');
      }
    }
  };

  const saveEdit = async () => {
    if (!selectedDesign) return;
    if (!editName.trim()) {
      Alert.alert('Error', 'Please enter a design name');
      return;
    }
    try {
      setIsSavingEdit(true);
      // Prepare final image_urls: upload local assets in current order and keep remote URLs as is
      const finalUrls: string[] = [];
      for (const item of editImages) {
        if (item.kind === 'remote') {
          if (item.url) finalUrls.push(item.url);
        } else {
          const uploaded = await uploadImage(item.asset);
          if (!uploaded) {
            Alert.alert('Error', 'Failed to upload one of the images');
            setIsSavingEdit(false);
            return;
          }
          finalUrls.push(uploaded);
        }
      }
      if (finalUrls.length === 0) {
        Alert.alert('Error', 'At least one image is required');
        setIsSavingEdit(false);
        return;
      }

      const updated = await updateDesign(selectedDesign.id, {
        name: editName.trim(),
        image_url: finalUrls[0],
        image_urls: finalUrls,
        user_id: editSelectedUserId || undefined,
      });

      if (!updated) {
        Alert.alert('Error', 'Failed to save design');
        setIsSavingEdit(false);
        return;
      }

      closeEdit();
    } catch (e) {
      console.error('saveEdit error', e);
      Alert.alert('שגיאה', 'נכשלה שמירת העיצוב');
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string, imageUrls?: string[]) => {
    try {
      // Try delete DB first
      const ok = await deleteDesign(id);
      if (!ok) {
        Alert.alert('Error', 'Failed to delete design');
        return;
      }
      // If images are within our public storage bucket, attempt to delete the files as well
      if (imageUrls && imageUrls.length > 0) {
        const paths: string[] = [];
        for (const url of imageUrls) {
          if (url && url.includes('/storage/v1/object/public/designs/')) {
            const path = url.split('/storage/v1/object/public/designs/')[1];
            if (path) paths.push(path);
          }
        }
        if (paths.length > 0) {
          await supabase.storage.from('designs').remove(paths);
        }
      }
    } catch (e) {
      console.error('delete error', e);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a design name');
      return;
    }
    if (pickedAssets.length === 0) {
      Alert.alert('Error', 'Please select at least one image');
      return;
    }

    try {
      setIsCreating(true);
      const urls: string[] = [];
      
      // Upload images one by one with progress indication
      for (let i = 0; i < pickedAssets.length; i++) {
        const asset = pickedAssets[i];
        const url = await uploadImage(asset);
        if (url) {
          urls.push(url);
        } else {
          Alert.alert('Error', `Failed to upload image ${i + 1}`);
          setIsCreating(false);
          return;
        }
      }
      
      if (urls.length === 0) {
        Alert.alert('Error', 'Failed to upload images');
        setIsCreating(false);
        return;
      }

      // Create a single design with multiple images (first image is cover)
      const created = await createDesign({
        name: name.trim(),
        image_url: urls[0],
        image_urls: urls,
        user_id: selectedUserId || undefined,
      });

      if (created) {
        Alert.alert('Success', 'Design added to gallery');
        setName('');
        setPickedAssets([]);
        setCreateVisible(false);
      } else {
        Alert.alert('Error', 'Failed to add design');
      }
    } catch (e) {
      console.error('Error in handleCreate:', e);
      Alert.alert('שגיאה', 'נכשלה הוספת העיצוב');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-forward" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Gallery</Text>
          <TouchableOpacity onPress={() => setCreateVisible(true)}>
            <Ionicons name="add" size={26} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.contentWrapper}>
          {/* Create Form moved to a modal opened via the + button */}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            renderItem={({ item }) => (
              <View style={styles.tile}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => openEdit(item)} style={styles.imageContainer}>
                  <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url])}
                    style={styles.tileDelete}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={styles.gradient}>
                    <Text style={styles.designName}>{item.name}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingHorizontal: horizontalPadding }}
          />

          {/* Edit Modal */}
          <Modal
            visible={editVisible}
            animationType="slide"
            transparent
            onRequestClose={closeEdit}
          >
            <View style={styles.modalBackdrop}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                <View style={styles.modalCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.sectionTitle}>Edit Design</Text>
                    <TouchableOpacity onPress={closeEdit}>
                      <Ionicons name="close" size={22} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
                    <TouchableOpacity onPress={addImagesToEdit} activeOpacity={0.9} style={{ marginTop: 8 }}>
                      <Image
                        source={{ uri: (editImages[0]?.kind === 'local') ? editImages[0]?.asset.uri : (editImages[0] as any)?.url ?? selectedDesign?.image_url }}
                        style={styles.editPreview}
                        resizeMode="cover"
                      />
                      <View style={styles.replaceOverlay}>
                        <Ionicons name="image-outline" size={18} color="#fff" />
                        <Text style={styles.replaceText}>Cover Image</Text>
                      </View>
                    </TouchableOpacity>

                    <TextInput
                      style={[styles.input, { marginTop: 12 }]}
                      placeholder="Design name"
                      value={editName}
                      onChangeText={setEditName}
                      returnKeyType="done"
                    />

                    {/* Admin User Selection for Edit */}
                    {adminUsers.length > 1 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>Select Admin</Text>
                        <View style={styles.adminSelectorContainer}>
                          {adminUsers.map((user) => (
                            <TouchableOpacity
                              key={user.id}
                              onPress={() => setEditSelectedUserId(user.id)}
                              style={[
                                styles.adminOption,
                                editSelectedUserId === user.id && styles.adminOptionSelected
                              ]}
                            >
                              <Text style={[
                                styles.adminOptionText,
                                editSelectedUserId === user.id && styles.adminOptionTextSelected
                              ]}>
                                {user.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Thumbnails and actions */}
                    <View style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={styles.sectionTitle}>Design Images</Text>
                        <TouchableOpacity onPress={addImagesToEdit} style={[styles.pickButton, { paddingVertical: 8, paddingHorizontal: 12 }]}> 
                          <Ionicons name="images-outline" size={16} color="#1d1d1f" />
                          <Text style={styles.pickButtonText}>Add Images</Text>
                        </TouchableOpacity>
                      </View>
                      <FlatList
                        data={editImages}
                        keyExtractor={(_, idx) => `edit-thumb-${idx}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                          <View style={{ marginRight: 8, position: 'relative' }}>
                            <TouchableOpacity
                              onPress={() => {
                                setEditImages(prev => {
                                  const next = [...prev];
                                  const [spliced] = next.splice(index, 1);
                                  next.unshift(spliced);
                                  return next;
                                });
                              }}
                              activeOpacity={0.9}
                            >
                              <Image
                                source={{ uri: item.kind === 'local' ? item.asset.uri : item.url }}
                                style={styles.thumb}
                              />
                              {index === 0 && (
                                <View style={styles.coverBadge}>
                                  <Ionicons name="star" size={12} color="#fff" />
                                  <Text style={styles.coverBadgeText}>Cover</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setEditImages(prev => prev.filter((_, i) => i !== index));
                              }}
                              style={styles.thumbDelete}
                            >
                              <Ionicons name="trash" size={12} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        )}
                      />
                    </View>

                    <TouchableOpacity onPress={saveEdit} style={[styles.createButton, { marginTop: 14 }]} disabled={isSavingEdit}>
                      {isSavingEdit ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.createButtonText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
          {/* Create Modal */}
          <Modal
            visible={createVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setCreateVisible(false)}
          >
            <View style={styles.modalBackdrop}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.sectionTitle, { color: Colors.text }]}>Add Design</Text>
                    <TouchableOpacity 
                      onPress={() => !isCreating && setCreateVisible(false)} 
                      style={[styles.closeIconButton, isCreating && { opacity: 0.5 }]}
                      disabled={isCreating}
                    >
                      <Ionicons name="close" size={20} color={'#8E8E93'} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
                    <Text style={[styles.helperText, { marginBottom: 4 }]}>You can select multiple images. The first one will be used as the cover image.</Text>

                    {/* Admin User Selection */}
                    {adminUsers.length > 1 && (
                      <View style={{ marginBottom: 12, opacity: isCreating ? 0.5 : 1 }}>
                        <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>Select Admin</Text>
                        <View style={styles.adminSelectorContainer}>
                          {adminUsers.map((user) => (
                            <TouchableOpacity
                              key={user.id}
                              onPress={() => !isCreating && setSelectedUserId(user.id)}
                              style={[
                                styles.adminOption,
                                selectedUserId === user.id && styles.adminOptionSelected
                              ]}
                              disabled={isCreating}
                            >
                              <Text style={[
                                styles.adminOptionText,
                                selectedUserId === user.id && styles.adminOptionTextSelected
                              ]}>
                                {user.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    <TouchableOpacity 
                      onPress={pickImages} 
                      style={[styles.pickButton, styles.pickButtonPurple, isCreating && { opacity: 0.5 }]} 
                      activeOpacity={0.9}
                      disabled={isCreating}
                    >
                      <Ionicons name="images-outline" size={18} color={ACCENT_PURPLE} />
                      <Text style={[styles.pickButtonText, { color: ACCENT_PURPLE }]}>Select Images</Text>
                      {pickedAssets.length > 0 && (
                        <View style={[styles.badge, { backgroundColor: ACCENT_PURPLE }]}><Text style={styles.badgeText}>{pickedAssets.length}</Text></View>
                      )}
                    </TouchableOpacity>

                    {pickedAssets.length > 0 && (
                      <FlatList
                        data={pickedAssets}
                        keyExtractor={(item, idx) => `${item.uri}-${idx}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 8 }}
                        renderItem={({ item, index }) => (
                          <View style={styles.previewImageContainer}>
                            <Image source={{ uri: item.uri }} style={styles.previewImage} />
                            <TouchableOpacity
                              onPress={() => {
                                setPickedAssets(prev => prev.filter((_, i) => i !== index));
                              }}
                              style={styles.previewRemoveButton}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close" size={14} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        )}
                      />
                    )}

                    <TextInput
                      style={[styles.input, { marginTop: 8 }, isCreating && { opacity: 0.5 }]}
                      placeholder="Design name"
                      value={name}
                      onChangeText={setName}
                      editable={!isCreating}
                    />

                    <TouchableOpacity onPress={handleCreate} style={[styles.createButton, styles.createButtonPurple]} disabled={isLoading || isCreating}>
                      {isCreating ? (
                        <View style={styles.loadingContainer}>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={[styles.createButtonText, { marginLeft: 8 }]}>Uploading images...</Text>
                        </View>
                      ) : (
                        <Text style={styles.createButtonText}>{isLoading ? 'Saving...' : 'Publish'}</Text>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  formBox: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#6e6e73',
    textAlign: 'left',
  },
  input: {
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    textAlign: 'left',
  },
  pickButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickButtonPurple: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderColor: 'rgba(0,0,0,0.2)'
  },
  pickButtonText: {
    color: '#1d1d1f',
    fontWeight: '600',
  },
  badge: {
    marginRight: 6,
    backgroundColor: '#1d1d1f',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  previewImageContainer: {
    position: 'relative',
    marginRight: 8,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  previewRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  categoriesLabel: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.text,
    textAlign: 'left',
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    margin: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  selectedCategoryChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 14,
    color: Colors.text,
  },
  selectedCategoryChipText: {
    color: Colors.white,
  },
  popularityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  popularityLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  popularityDots: {
    flexDirection: 'row',
  },
  popDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e5e5ea',
    marginLeft: 6,
  },
  popDotActive: {
    backgroundColor: Colors.primary,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tile: {
    width: tileSize,
    height: tileSize,
    padding: 4,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    justifyContent: 'flex-end',
  },
  designName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 4,
  },
  popularityContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
  },
  popularityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: 2,
  },
  activePopularityDot: {
    backgroundColor: Colors.primary,
  },
  createButton: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonPurple: {
    backgroundColor: ACCENT_PURPLE,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  deletePill: {
    backgroundColor: '#ff3b30',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tileDelete: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    zIndex: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  closeIconButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  editPreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
  },
  replaceOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  replaceText: {
    color: '#fff',
    fontWeight: '600',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f2f2f7',
  },
  thumbDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  adminSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  adminOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  adminOptionSelected: {
    backgroundColor: ACCENT_PURPLE,
    borderColor: ACCENT_PURPLE,
  },
  adminOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1D1D1F',
    textAlign: 'center',
  },
  adminOptionTextSelected: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});


