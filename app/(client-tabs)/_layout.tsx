import React from 'react';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Alert, Text as RNText } from 'react-native';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import LoginRequiredModal from '@/components/LoginRequiredModal';
import { useColors } from '@/src/theme/ThemeProvider';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';

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
          colors={[colors.primary, colors.primary]}
          style={styles.floatingGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
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
          const iconColor = focused ? colors.primary : '#3A3A3C';
          
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
                        title: 'Login Required',
                        message: 'Please sign in to book an appointment.',
                      });
                      return;
                    }
                    if (isBlocked) {
                      // Keep Alert for blocked users as it's a different use case
                      Alert.alert('Account Blocked', 'Your account is blocked. You cannot book appointments.');
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
                      title: 'Login Required',
                      message: `Please sign in to access ${route.name === 'appointments' ? 'booking' : 'profile'}.`,
                    });
                    return;
                  }
                }
                originalOnPress?.({} as any);
              }}
            />
          );
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#3A3A3C',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: 4,
          letterSpacing: -0.1,
        },
        tabBarItemStyle: route.name === 'book-appointment' ? styles.centerTabItem : styles.regularTabItem,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: route.name === 'book-appointment' ? '' : getTabLabel(route.name),
        tabBarContentContainerStyle: {
          justifyContent: 'space-between',
          alignItems: 'center',
          flexDirection: 'row'
        },
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderTopWidth: 0,
          height: 88,
          paddingTop: 8,
          paddingBottom: 20,
          paddingHorizontal: 0,
          position: 'absolute',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 20,
          flexDirection: 'row'
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            <View style={styles.tabBarBlur} />
          </View>
        ),
        headerShown: false,
      })}
    >
      <Tabs.Screen 
        name="index" 
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen 
        name="gallery" 
        options={{
          title: 'Gallery',
        }}
      />
      <Tabs.Screen 
        name="book-appointment" 
        options={{
          title: 'Book',
          tabBarButton: (props: any) => (
            <TouchableOpacity
              {...props}
              onPress={() => {
                if (!isAuthenticated) {
                  setLoginModal({
                    visible: true,
                    title: 'Login Required',
                    message: 'Please sign in to book an appointment.',
                  });
                  return;
                }
                if (isBlocked) {
                  Alert.alert('Account Blocked', 'Your account is blocked. You cannot book appointments.');
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
                      title: 'Login Required',
                      message: 'Please sign in to book an appointment.',
                    });
                    return;
                  }
                  if (isBlocked) {
                    Alert.alert('Account Blocked', 'Your account is blocked. You cannot book appointments.');
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
          title: 'Booking',
        }}
      />
      <Tabs.Screen 
        name="profile" 
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen 
        name="waitlist" 
        options={{
          title: 'Waitlist',
          href: null
        }}
      />

<Tabs.Screen 
        name="notifications" 
        options={{
          title: 'notifications',
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 20,
  },
  
  tabBarBlur: {
    flex: 1,
    backgroundColor: 'rgba(248, 248, 248, 0.8)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backdropFilter: 'blur(20px)',
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
