import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  InteractionManager,
  AppState,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { Design } from '@/lib/supabase';
import { ResizeMode } from 'expo-av';
import { isVideoUrl } from '@/lib/utils/mediaUrl';
import { GalleryLoopVideo } from '@/components/GalleryLoopVideo';
import { supabase, getBusinessId } from '@/lib/supabase';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { HorizontalCarouselDots, carouselIndexFromOffset } from '@/components/HorizontalCarouselDots';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.38; // Increased from 0.32 to 0.38 for larger cards
const CARD_HEIGHT = 240; // Increased from 200 to 240 for taller cards
const CARD_SPACING = 16; // Increased spacing between cards
const CARD_STRIDE = CARD_WIDTH + CARD_SPACING;

const AVATAR_PLACEHOLDER = require('@/assets/images/user.png');

function DesignCoverImage({ uri, style }: { uri: string; style: object }) {
  const [failed, setFailed] = useState(false);
  const trimmed = uri.trim();
  useEffect(() => {
    setFailed(false);
  }, [trimmed]);
  const show = trimmed.length > 0 && !failed;
  const onError = useCallback(() => setFailed(true), []);
  if (!show) {
    return <View style={[style, styles.designImagePlaceholder]} />;
  }
  if (isVideoUrl(trimmed)) {
    return <GalleryLoopVideo uri={trimmed} style={style} resizeMode={ResizeMode.COVER} />;
  }
  return (
    <ExpoImage
      source={{ uri: trimmed }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
      onError={onError}
    />
  );
}

function DesignModalImage({ uri, style }: { uri: string; style: object }) {
  const [failed, setFailed] = useState(false);
  const trimmed = uri.trim();
  useEffect(() => {
    setFailed(false);
  }, [trimmed]);
  const show = trimmed.length > 0 && !failed;
  const onError = useCallback(() => setFailed(true), []);
  if (!show) {
    return <View style={[style, styles.designImagePlaceholder]} />;
  }
  if (isVideoUrl(trimmed)) {
    return <GalleryLoopVideo uri={trimmed} style={style} resizeMode={ResizeMode.CONTAIN} />;
  }
  return (
    <ExpoImage
      source={{ uri: trimmed }}
      style={style}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={150}
      onError={onError}
    />
  );
}

/** Remote avatar with local fallback; expo-image handles Supabase public URLs more reliably than RN Image. */
function UploaderAvatar({
  imageUrl,
  style,
}: {
  imageUrl?: string | null;
  style: object;
}) {
  const [failed, setFailed] = useState(false);
  const trimmed = imageUrl?.trim();
  const useRemote = Boolean(trimmed) && !failed;
  return (
    <ExpoImage
      source={useRemote ? { uri: trimmed as string } : AVATAR_PLACEHOLDER}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
      transition={150}
    />
  );
}

interface DesignCarouselProps {
  designs: Design[];
  onDesignPress?: (design: Design) => void;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  /** When false, the line under the section title is hidden. Default true. */
  showSubtitle?: boolean;
  /** Pagination dots under the carousel (admin home keeps true). Default true. */
  showDots?: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  image_url?: string;
}

export default function DesignCarousel({ 
  designs, 
  onDesignPress, 
  title = undefined,
  subtitle = undefined,
  showHeader = true,
  showSubtitle = true,
  showDots = true,
}: DesignCarouselProps) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [userProfiles, setUserProfiles] = useState<{[key: string]: AdminUser}>({});
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const colors = useColors();
  const { t } = useTranslation();
  const sessionUserId = useAuthStore((s) => s.user?.id);
  const sessionImageUrl = useAuthStore((s) => s.user?.image_url);
  
  // Animation values for floating elements
  const floatingAnim = useRef(new Animated.Value(0)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fetchAdminUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('id, name, image_url')
            .eq('id', user.id)
            .single();
          
          if (profile) {
            setAdminUser({
              id: profile.id,
              name: profile.name || t('settings.admin.admin', 'Admin'),
              image_url: profile.image_url
            });
          }
        }
      } catch (error) {
        console.error('Error fetching admin user:', error);
      }
    };

    fetchAdminUser();
  }, []);

  useEffect(() => {
    const fetchUserProfiles = async () => {
      try {
        // Get unique user IDs from designs
        const userIds = [...new Set(designs.map(design => design.user_id).filter(Boolean))];
        
        if (userIds.length > 0) {
          const businessId = getBusinessId();
          const { data: profiles, error } = await supabase
            .from('users')
            .select('id, name, image_url')
            .in('id', userIds)
            .eq('business_id', businessId);
          
          if (error) {
            console.error('Error fetching user profiles:', error);
            return;
          }
          
          
          // Create a map of user profiles
          const profilesMap: {[key: string]: AdminUser} = {};
          profiles?.forEach(profile => {
            profilesMap[profile.id] = {
              id: profile.id,
              name: profile.name || t('common.user', 'User'),
              image_url: profile.image_url
            };
          });

          // Prefer session image_url for logged-in uploader (fresh after Settings upload; avoids stale/null DB read).
          const session = useAuthStore.getState().user;
          const sid = session?.id;
          const simg = session?.image_url?.trim();
          if (sid && simg && profilesMap[sid]) {
            profilesMap[sid] = { ...profilesMap[sid], image_url: simg };
          }

          setUserProfiles(profilesMap);
        } else {
          // Set empty map so all designs show placeholder
          setUserProfiles({});
        }
      } catch (error) {
        console.error('Error fetching user profiles:', error);
        // Set empty map on error so all designs show placeholder
        setUserProfiles({});
      }
    };

    if (designs.length > 0) {
      fetchUserProfiles();
    }
  }, [designs]);

  // Patch avatar when auth store updates (e.g. profile photo saved in Settings).
  useEffect(() => {
    const simg = sessionImageUrl?.trim();
    if (!sessionUserId || !simg) return;
    setUserProfiles((prev) => {
      if (!prev[sessionUserId]) return prev;
      if (prev[sessionUserId].image_url?.trim() === simg) return prev;
      return {
        ...prev,
        [sessionUserId]: { ...prev[sessionUserId], image_url: simg },
      };
    });
  }, [sessionUserId, sessionImageUrl]);

  useEffect(() => {
    if (!showDots) return;
    setCarouselIndex(0);
  }, [designs.length, showDots]);

  const syncCarouselIndex = useCallback(
    (offsetX: number) => {
      if (!showDots) return;
      const next = carouselIndexFromOffset(offsetX, CARD_STRIDE, designs.length);
      setCarouselIndex((prev) => (prev === next ? prev : next));
    },
    [designs.length, showDots]
  );

  useEffect(() => {
    const startAnimations = () => {
      // Floating animation
      const floatingLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(floatingAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(floatingAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

      // Sparkle animation
      const sparkleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(sparkleAnim, {
            toValue: 0,
            duration: 100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      );

      // Glow animation
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

      floatingLoop.start();
      sparkleLoop.start();
      glowLoop.start();

      return () => {
        floatingLoop.stop();
        sparkleLoop.stop();
        glowLoop.stop();
      };
    };

    const handle = InteractionManager.runAfterInteractions(startAnimations);
    const appStateListener = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        startAnimations();
      }
    });

    return () => {
      handle && typeof handle.cancel === 'function' && handle.cancel();
      appStateListener.remove();
    };
  }, []);

  const handleDesignPress = (design: Design) => {
    if (onDesignPress) {
      onDesignPress(design);
      return;
    }
    setSelectedDesign(design);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedDesign(null);
  };

  const renderDesignCard = (design: Design, index: number) => {
    const list = (design.image_urls && design.image_urls.length > 0 ? design.image_urls : [design.image_url]).filter(Boolean) as string[];
    const imageUrl = (list.find((u) => !isVideoUrl(u)) ?? list[0] ?? '') || '';
    const isPremium = design.is_premium || false;
    const userProfile = design.user_id ? userProfiles[design.user_id] : null;
    const designUri = imageUrl?.trim() ?? '';

    return (
      <View key={design.id} style={styles.storyContainer}>
        <TouchableOpacity
          style={styles.storyCard}
          onPress={() => handleDesignPress(design)}
          activeOpacity={0.8}
        >
          {/* Main Design Image with Admin Profile Overlay */}
          <View style={styles.designImageContainer}>
            <View style={styles.designImageWrapper}>
              <DesignCoverImage uri={designUri} style={styles.designImage} />

              {isPremium && (
                <View style={styles.premiumCrown}>
                  <Ionicons name="crown" size={16} color="#FFD700" />
                </View>
              )}

              <View style={styles.adminProfileOverlay} pointerEvents="none">
                <UploaderAvatar
                  key={`${design.user_id}-${userProfile?.image_url ?? ''}`}
                  imageUrl={userProfile?.image_url}
                  style={styles.adminProfileImage}
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  if (!designs || designs.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Elegant Header */}
      {showHeader ? (
        <View style={styles.elegantHeader}>
          <Text style={[styles.elegantTitle, { color: colors.text }]}>
            {title || t('admin.gallery.title', 'Gallery')}
          </Text>
          {showSubtitle ? (
            <Text style={styles.elegantSubtitle}>{subtitle || t('admin.gallery.subtitle', 'Manage your designs')}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        decelerationRate="fast"
        snapToInterval={CARD_STRIDE}
        snapToAlignment="start"
        style={styles.scrollView}
        scrollEventThrottle={showDots ? 16 : undefined}
        onScroll={
          showDots ? (e) => syncCarouselIndex(e.nativeEvent.contentOffset.x) : undefined
        }
        onMomentumScrollEnd={
          showDots ? (e) => syncCarouselIndex(e.nativeEvent.contentOffset.x) : undefined
        }
      >
        {designs.map((design, index) => renderDesignCard(design, index))}
      </ScrollView>

      {showDots ? (
        <HorizontalCarouselDots
          count={designs.length}
          minCount={2}
          activeIndex={carouselIndex}
          activeColor={colors.primary}
        />
      ) : null}

      {/* Design Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            {/* Design Image */}
            {selectedDesign && (
              <View style={styles.modalContent}>
                <DesignModalImage
                  key={selectedDesign.id}
                  uri={
                    (selectedDesign.image_urls && selectedDesign.image_urls.length > 0
                      ? selectedDesign.image_urls[0]
                      : selectedDesign.image_url) ?? ''
                  }
                  style={styles.modalImage}
                />
                
                {/* Design Info */}
                <View style={styles.modalInfo}>
                  <Text style={styles.modalTitle}>
                    {selectedDesign.title || selectedDesign.name || t('gallery.design','Design')}
                  </Text>
                  {selectedDesign.description && (
                    <Text style={styles.modalDescription}>
                      {selectedDesign.description}
                    </Text>
                  )}
                  {selectedDesign.user_id && userProfiles[selectedDesign.user_id] && (
                    <View style={styles.modalUserInfo}>
                      <UploaderAvatar
                        key={`modal-${selectedDesign.user_id}-${userProfiles[selectedDesign.user_id].image_url ?? ''}`}
                        imageUrl={userProfiles[selectedDesign.user_id].image_url}
                        style={styles.modalUserImage}
                      />
                      <Text style={styles.modalUserName}>
                        {userProfiles[selectedDesign.user_id].name}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    paddingBottom: 20,
    backgroundColor: 'transparent', // Clean transparent background
  },
  elegantHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 14,
    marginTop: 16,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  elegantTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.25,
    marginBottom: 3,
  },
  elegantSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  scrollView: {},
  scrollContainer: {
    paddingHorizontal: 16,
  },
  // Design Card Style - No Border
  storyContainer: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
    alignItems: 'center',
  },
  storyCard: {
    alignItems: 'center',
  },
  designImageContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  designImageWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  designImage: {
    width: '100%',
    height: '100%',
  },
  designImagePlaceholder: {
    backgroundColor: '#E8E8ED',
  },
  adminProfileOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 3,
  },
  adminProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  premiumCrown: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 14,
    padding: 6,
    zIndex: 5,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 10,
  },
  modalContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalImage: {
    width: '100%',
    height: '70%',
    borderRadius: 16,
  },
  modalInfo: {
    marginTop: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 22,
  },
  modalUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalUserImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  modalUserName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});