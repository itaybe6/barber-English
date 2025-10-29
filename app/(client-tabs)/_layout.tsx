import React from 'react';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Alert, Text as RNText } from 'react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import LoginRequiredModal from '@/components/LoginRequiredModal';
import { useColors } from '@/src/theme/ThemeProvider';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';

// Utility to convert hex color to rgba string with alpha for translucent tints
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const isShort = normalized.length === 3;
  const r = parseInt(isShort ? normalized[0] + normalized[0] : normalized.slice(0, 2), 16);
  const g = parseInt(isShort ? normalized[1] + normalized[1] : normalized.slice(2, 4), 16);
  const b = parseInt(isShort ? normalized[2] + normalized[2] : normalized.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

// Custom floating button component
const FloatingBookButton = ({ onPress, focused }: { onPress: () => void; focused: boolean }) => {
  const colors = useColors();
  
  // Distinct animation: wobble (rotate) + bob (translateY) + brief pop (scale) with pauses
  const wobble = React.useRef(new Animated.Value(0)).current; // -1 .. 1
  const bob = React.useRef(new Animated.Value(0)).current;    // -1 .. 1
  const pop = React.useRef(new Animated.Value(0)).current;    // 0 .. 1

  React.useEffect(() => {
    const sequence = Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        // wobble
        Animated.sequence([
          Animated.timing(wobble, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(wobble, { toValue: -1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.timing(wobble, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        // bob
        Animated.sequence([
          Animated.timing(bob, { toValue: -1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        // pop
        Animated.sequence([
          Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(pop, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(1100),
    ]);
    const loop = Animated.loop(sequence);
    loop.start();
    return () => {
      loop.stop();
    };
  }, [wobble, bob, pop]);

  const motionStyle = {
    transform: [
      { translateY: bob.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, -2] }) },
      { rotate: wobble.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-14deg', '0deg', '14deg'] }) },
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  } as const;

  return (
    <TouchableOpacity 
      style={styles.floatingButton} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Animated.View style={motionStyle}>
        <LinearGradient
          // Stronger color presence, lighter blur
          colors={[hexToRgba(colors.primary, 0.9), hexToRgba(colors.primary, 0.78)]}
          style={styles.floatingGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          {/* Subtle blur only to soften edges */}
          <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFillObject} />
          {/* Subtle inner highlight for glass edge */}
          <View style={styles.floatingGlassEdge} />
          <View style={[styles.floatingIcon, focused && styles.floatingIconFocused]}>
            <Ionicons 
              name="add" 
              size={28} 
              color="#FFFFFF" 
              style={{ 
                transform: [{ scale: focused ? 1.1 : 1 }],
                fontWeight: '700'
              }} 
            />
          </View>
        </LinearGradient>
      </Animated.View>
      {/* Floating shadow effect */}
      <View style={styles.floatingShadow} />
    </TouchableOpacity>
  );
};

export default function ClientTabsLayout() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isBlocked = Boolean((user as any)?.block);
  const colors = useColors();
  const { colorUpdateTrigger } = useColorUpdate();
  const { t } = useTranslation();
  
  const [loginModal, setLoginModal] = React.useState<{ visible: boolean; title?: string; message?: string }>({ visible: false });
  
  // Force re-render when colors change
  React.useEffect(() => {
    // This effect will trigger re-render when colorUpdateTrigger changes
  }, [colorUpdateTrigger]);
  
  // RTL debug removed; rely on explicit layout directions



  return (
    <>
    <Tabs
      screenOptions={({ route }) => ({
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => {
          const iconSize = focused ? 26 : 24;
          const iconColor = focused ? '#FFFFFF' : 'rgba(255,255,255,0.7)';
          
          let iconName;
          switch (route.name) {
            case 'index':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'gallery':
              iconName = focused ? 'images' : 'images-outline';
              break;
            case 'appointments':
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case 'profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
            case 'book-appointment':
              return (
                <FloatingBookButton 
                  onPress={() => {
                    if (!isAuthenticated) {
                      setLoginModal({
                        visible: true,
                        title: t('login.required', 'Login Required'),
                        message: t('login.pleaseSignInToBook', 'Please sign in to book an appointment.'),
                      });
                      return;
                    }
                    if (isBlocked) {
                      // Keep Alert for blocked users as it's a different use case
                      Alert.alert(t('account.blocked', 'Account Blocked'), t('account.blocked.message', 'Your account is blocked. You cannot book appointments.'));
                      return;
                    }
                    router.push('/(client-tabs)/book-appointment');
                  }}
                  focused={focused}
                />
              );
            default:
              return null;
          }
          return (
            <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
              <Ionicons 
                name={iconName as any} 
                size={iconSize} 
                color={iconColor}
                style={{ fontWeight: focused ? '700' : '400' }}
              />
            </View>
          );
        },
        tabBarButton: (props: any) => {
          // Intercept presses for specific routes to enforce auth
          const originalOnPress = props.onPress;
          
          return (
            <TouchableOpacity
              {...(props as any)}
              onPress={() => {
                // Check if this is a protected route based on route name
                if (route.name === 'appointments' || route.name === 'profile') {
                  if (!isAuthenticated) {
                    setLoginModal({
                      visible: true,
                      title: t('login.required', 'Login Required'),
                      message: t('login.pleaseSignInTo', 'Please sign in to {{action}}.', { action: route.name === 'appointments' ? t('appointments.title', 'Appointments') : t('profile.title', 'Settings and Profile') }),
                    });
                    return;
                  }
                }
                originalOnPress?.({} as any);
              }}
            />
          );
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: 4,
          letterSpacing: -0.1,
        },
        tabBarItemStyle: route.name === 'book-appointment' ? styles.centerTabItem : styles.regularTabItem,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: route.name === 'book-appointment'
          ? ''
          : (
            route.name === 'index' ? t('tabs.home', 'Home') :
            route.name === 'gallery' ? t('tabs.gallery', 'Gallery') :
            route.name === 'appointments' ? t('tabs.booking', 'Booking') :
            route.name === 'profile' ? t('tabs.profile', 'Profile') :
            route.name === 'waitlist' ? t('waitlist.title', 'Waitlist') :
            route.name === 'notifications' ? t('notifications.title', 'Notifications') :
            t('tabs.home', 'Home')
          ),
        tabBarContentContainerStyle: {
          justifyContent: 'space-between',
          alignItems: 'center',
          flexDirection: 'row'
        },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 76,
          paddingTop: 6,
          paddingBottom: 12,
          paddingHorizontal: 0,
          position: 'absolute',
          bottom: 18,
          marginHorizontal:16,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 22 },
          shadowOpacity: 0.22,
          shadowRadius: 38,
          elevation: 28,
          flexDirection: 'row'
        },
        tabBarBackground: () => (
          <BlurView intensity={96} tint="dark" style={styles.tabBarBackground}>
            {/* Subtle white tint for refraction */}
            <View style={styles.glassTint} />
            {/* Static light sweep for depth (no animation) */}
            <LinearGradient
              colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.00)']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glassLight}
            />
            {/* Top edge highlight */}
            <LinearGradient
              colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 0.55 }}
              style={styles.glassTopEdge}
            />
            {/* Uniform subtle vertical vignette across the whole bar */}
            <LinearGradient
              colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.glassVignette}
            />
            {/* Thin inner edge highlight */}
            <View style={styles.glassEdge} />
            {/* Subtle bottom sheen for underside reflection */}
            <LinearGradient
              colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.0)']}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0.8 }}
              style={styles.glassBottomSheen}
            />
          </BlurView>
        ),
        headerShown: false,
      })}
    >
      <Tabs.Screen 
        name="index" 
        options={{
          title: t('tabs.home', 'Home'),
        }}
      />
      <Tabs.Screen 
        name="gallery" 
        options={{
          title: t('tabs.gallery', 'Gallery'),
        }}
      />
      <Tabs.Screen 
        name="book-appointment" 
        options={{
          title: t('tabs.book', 'Book'),
          tabBarButton: (props: any) => (
            <TouchableOpacity
              {...props}
              onPress={() => {
                if (!isAuthenticated) {
                  setLoginModal({
                    visible: true,
                    title: t('login.required', 'Login Required'),
                    message: t('login.pleaseSignInToBook', 'Please sign in to book an appointment.'),
                  });
                  return;
                }
                if (isBlocked) {
                  Alert.alert(t('account.blocked', 'Account Blocked'), t('account.blocked.message', 'Your account is blocked. You cannot book appointments.'));
                  return;
                }
                router.push('/(client-tabs)/book-appointment');
              }}
              style={styles.centerTabItem}
            >
              <FloatingBookButton 
                onPress={() => {
                  if (!isAuthenticated) {
                    setLoginModal({
                      visible: true,
                      title: t('login.required', 'Login Required'),
                      message: t('login.pleaseSignInToBook', 'Please sign in to book an appointment.'),
                    });
                    return;
                  }
                  if (isBlocked) {
                    Alert.alert(t('account.blocked', 'Account Blocked'), t('account.blocked.message', 'Your account is blocked. You cannot book appointments.'));
                    return;
                  }
                  router.push('/(client-tabs)/book-appointment');
                }}
                focused={false}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen 
        name="appointments" 
        options={{
          title: t('tabs.booking', 'Booking'),
        }}
      />
      <Tabs.Screen 
        name="profile" 
        options={{
          title: t('tabs.profile', 'Profile'),
        }}
      />
      <Tabs.Screen 
        name="waitlist" 
        options={{
          title: t('waitlist.title', 'Waitlist'),
          href: null
        }}
      />

<Tabs.Screen 
        name="notifications" 
        options={{
          title: t('notifications.title', 'Notifications'),
          href: null
        }}
      />
      <Tabs.Screen 
        name="select-time" 
        options={{
          href: null
        }}
      />
    </Tabs>
    
    {/* Login required modal */}
    <LoginRequiredModal
      visible={loginModal.visible}
      title={loginModal.title}
      message={loginModal.message}
      onClose={() => setLoginModal({ visible: false })}
      onLogin={() => {
        setLoginModal({ visible: false });
        router.push('/login');
      }}
    />
    </>
  );
}

// Helper function to get tab labels
function getTabLabel(routeName: string): string {
  // This function remains as a fallback. Actual labels are provided via options and screenOptions.
  switch (routeName) {
    case 'index':
      return 'Home';
    case 'gallery':
      return 'Gallery';
    case 'appointments':
      return 'Booking';
    case 'profile':
      return 'Profile';
    case 'book-appointment':
      return 'Book';
    default:
      return routeName;
  }
}

const styles = StyleSheet.create({
  // Regular tab items
  regularTabItem: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    maxWidth: '20%',
  },
  
  // Center tab item (floating button)
  centerTabItem: {
    marginTop: -10,
    marginBottom: 8,
    flex: 0,
    width: 72,
    alignItems: 'center',
    marginHorizontal: 8,
    zIndex: 1000,
  },
  
  // Icon containers with subtle effects
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  
  iconContainerFocused: {
    backgroundColor: 'transparent',
    transform: [{ scale: 1.1 }],
  },
  
  // Floating button styles
  floatingButton: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    marginBottom: 8,
    zIndex: 1000,
  },
  
  floatingGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  
  floatingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  
  floatingIconFocused: {
    transform: [{ scale: 1.05 }],
  },
  
  // Subtle inner edge/highlight for glass look
  floatingGlassEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)'
  },

  floatingShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
    zIndex: -1,
  },

  // (removed) previous pulse styles
  
  // Tab bar background with blur effect
  tabBarBackground: {
    flex: 1,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 20,
  },
  
  // Subtle translucent tint over the blur to simulate refraction
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  // Static light gradient for depth (Apple-like lighting)
  glassLight: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  // Top edge highlight (soft inner glow at the top)
  glassTopEdge: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  // Side vignettes to suggest glass thickness
  glassSideVignetteLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '36%',
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
  },
  glassSideVignetteRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '36%',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
  },

  // Bottom inner shadow
  glassVignette: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  // Thin inner edge highlight to catch light
  glassEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },

  // Bottom sheen overlay
  glassBottomSheen: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  tabBarBlur: {
    flex: 1,
    backgroundColor: 'rgba(248, 248, 248, 0.8)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  
  // Manual label style for custom tab buttons (matches tabBarLabelStyle)
  manualTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: -0.1,
  },
});
