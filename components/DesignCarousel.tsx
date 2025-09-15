import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  InteractionManager,
  AppState,
  Modal,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Design } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/src/theme/ThemeProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.38; // Increased from 0.32 to 0.38 for larger cards
const CARD_HEIGHT = 240; // Increased from 200 to 240 for taller cards
const CARD_SPACING = 16; // Increased spacing between cards

interface DesignCarouselProps {
  designs: Design[];
  onDesignPress?: (design: Design) => void;
  title?: string;
  subtitle?: string;
}

interface AdminUser {
  id: string;
  name: string;
  image_url?: string;
}

export default function DesignCarousel({ 
  designs, 
  onDesignPress, 
  title = "העיצובים החדשים שלנו",
  subtitle = "גלו את הטרנדים האחרונים ותבחרו את העיצוב המושלם"
}: DesignCarouselProps) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [userProfiles, setUserProfiles] = useState<{[key: string]: AdminUser}>({});
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const colors = useColors();
  
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
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (profile) {
            setAdminUser({
              id: profile.id,
              name: profile.name || 'Admin',
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
          const { data: profiles, error } = await supabase
            .from('users')
            .select('id, name, image_url')
            .in('id', userIds);
          
          if (error) {
            console.error('Error fetching user profiles:', error);
            return;
          }
          
          
          // Create a map of user profiles
          const profilesMap: {[key: string]: AdminUser} = {};
          profiles?.forEach(profile => {
            profilesMap[profile.id] = {
              id: profile.id,
              name: profile.name || 'User',
              image_url: profile.image_url
            };
          });
          
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
    setSelectedDesign(design);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedDesign(null);
  };

  const renderDesignCard = (design: Design, index: number) => {
    const imageUrl = design.image_urls && design.image_urls.length > 0 
      ? design.image_urls[0] 
      : design.image_url;
    const isPremium = design.is_premium || false;
    const userProfile = design.user_id ? userProfiles[design.user_id] : null;

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
              <Image 
                source={{ uri: imageUrl }} 
                style={styles.designImage}
                resizeMode="cover"
              />
              
              {/* Premium Crown */}
              {isPremium && (
                <View style={styles.premiumCrown}>
                  <Ionicons name="crown" size={16} color="#FFD700" />
                </View>
              )}
            </View>
            
            {/* Admin Profile Picture Overlay on Bottom Center */}
            <View style={styles.adminProfileOverlay}>
              <Image 
                source={{ 
                  uri: userProfile?.image_url || 'https://via.placeholder.com/40x40/007AFF/FFFFFF?text=👤' 
                }} 
                style={styles.adminProfileImage}
                onError={(error) => {
                }}
              />
            </View>
          </View>
          
          {/* Admin Name Below */}
          <Text style={styles.adminName} numberOfLines={1}>
            {userProfile?.name || 'Daniel Musai'}
          </Text>
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
      <View style={styles.elegantHeader}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.elegantTitle}>Design Gallery</Text>
          <Text style={styles.elegantSubtitle}>Discover our latest creations</Text>
        </View>
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="center"
        style={styles.scrollView}
      >
        {designs.map((design, index) => renderDesignCard(design, index))}
      </ScrollView>

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
                <Image
                  source={{ 
                    uri: selectedDesign.image_urls && selectedDesign.image_urls.length > 0 
                      ? selectedDesign.image_urls[0] 
                      : selectedDesign.image_url 
                  }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                
                {/* Design Info */}
                <View style={styles.modalInfo}>
                  <Text style={styles.modalTitle}>
                    {selectedDesign.title || selectedDesign.name || 'Design'}
                  </Text>
                  {selectedDesign.description && (
                    <Text style={styles.modalDescription}>
                      {selectedDesign.description}
                    </Text>
                  )}
                  {selectedDesign.user_id && userProfiles[selectedDesign.user_id] && (
                    <View style={styles.modalUserInfo}>
                      <Image
                        source={{ 
                          uri: userProfiles[selectedDesign.user_id].image_url || 'https://via.placeholder.com/24x24/007AFF/FFFFFF?text=👤' 
                        }}
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
    marginBottom: 20,
    marginTop: 20, // Add top margin to create space from the booking section above
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  elegantTitle: {
    fontSize: 26, // Increased from 24 to 26
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  elegantSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  scrollView: {
    paddingLeft: 24,
  },
  scrollContainer: {
    paddingRight: 24,
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
    overflow: 'visible', // Allow profile picture to extend outside
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
  adminProfileOverlay: {
    position: 'absolute',
    bottom: -25, // Half outside the image (25px is half of 50px profile size)
    left: '50%',
    marginLeft: -25, // Center horizontally (half of 50px profile size)
    zIndex: 3,
  },
  adminProfileImage: {
    width: 50, // Increased from 40 to 50
    height: 50, // Increased from 40 to 50
    borderRadius: 25, // Increased from 20 to 25
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
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
  adminName: {
    fontSize: 15, // Slightly larger font
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
    marginTop: 25, // Account for larger profile picture extending outside
    maxWidth: CARD_WIDTH,
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