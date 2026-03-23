import React from "react";
import { Tabs, useRouter } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LoginRequiredModal from "@/components/LoginRequiredModal";
import { MenuProvider } from "@/components/shopify-tab-bar/menu-provider";
import { AnimatedTabsContainer } from "@/components/shopify-tab-bar/animated-tabs-container";
import { ClientFloatingTabBar } from "@/components/shopify-tab-bar/client-floating-tab-bar";
import { Menu, CLIENT_MENU_ITEMS } from "@/components/shopify-tab-bar/menu";

const TAB_BAR_HEIGHT = 84;

export default function ClientTabsLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [loginModal, setLoginModal] = React.useState<{
    visible: boolean;
    title?: string;
    message?: string;
  }>({ visible: false });

  return (
<<<<<<< HEAD
    <MenuProvider>
      <View style={{ flex: 1 }}>
        <AnimatedTabsContainer>
          <Tabs
            tabBar={() => null}
            sceneContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: "none" },
            }}
          >
            <Tabs.Screen name="index" options={{ title: t("tabs.home", "Home") }} />
            <Tabs.Screen name="gallery" options={{ title: t("tabs.gallery", "Gallery") }} />
            <Tabs.Screen name="book-appointment" options={{ title: t("tabs.book", "Book") }} />
            <Tabs.Screen name="appointments" options={{ title: t("tabs.booking", "Booking") }} />
            <Tabs.Screen name="profile" options={{ title: t("tabs.profile", "Profile") }} />
            <Tabs.Screen name="waitlist" options={{ title: t("waitlist.title", "Waitlist"), href: null }} />
            <Tabs.Screen name="notifications" options={{ title: t("notifications.title", "Notifications"), href: null }} />
            <Tabs.Screen name="select-time" options={{ href: null }} />
            <Tabs.Screen name="select-barber" options={{ href: null }} />
            <Tabs.Screen name="select-service" options={{ href: null }} />
          </Tabs>
        </AnimatedTabsContainer>

        {/* Floating tab bar rendered as overlay at the layout level */}
        <ClientFloatingTabBar setLoginModal={setLoginModal} />

        <Menu items={CLIENT_MENU_ITEMS} />

        <LoginRequiredModal
          visible={loginModal.visible}
          title={loginModal.title}
          message={loginModal.message}
          onClose={() => setLoginModal({ visible: false })}
          onLogin={() => {
            setLoginModal({ visible: false });
            router.push("/login");
          }}
        />
      </View>
    </MenuProvider>
  );
}
=======
    <>
    <Tabs
      key={isHebrew ? 'tabs-rtl' : 'tabs-ltr'}
      screenOptions={({ route }) => {
        const flexDirection = 'row';
        return {
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, size, focused }) => {
            const iconSize = focused ? 26 : 24;
            const iconColor = focused ? colors.primary : '#AAAAAA';
            
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
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: '#AAAAAA',
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
              route.name
            ),
          tabBarContentContainerStyle: {
            justifyContent: 'space-between',
            alignItems: 'center',
            flexDirection,
          },
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            height: 76,
            paddingTop: 6,
            paddingBottom: 12,
            paddingHorizontal: 0,
            position: 'absolute',
            bottom: 18,
            marginHorizontal: 16,
            borderRadius: 36,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 16,
            flexDirection,
          },
          tabBarBackground: () => (
            <View style={styles.tabBarBackground} />
          ),
          headerShown: false,
        };
      }}
    >
      {mainTabOrder.map((screenName) => {
        if (screenName === 'index') {
          return (
            <Tabs.Screen
              key="index"
              name="index"
              options={{
                title: t('tabs.home', 'Home'),
              }}
            />
          );
        }
        if (screenName === 'gallery') {
          return (
            <Tabs.Screen
              key="gallery"
              name="gallery"
              options={{
                title: t('tabs.gallery', 'Gallery'),
              }}
            />
          );
        }
        if (screenName === 'appointments') {
          return (
            <Tabs.Screen
              key="appointments"
              name="appointments"
              options={{
                title: t('tabs.booking', 'Booking'),
              }}
            />
          );
        }
        if (screenName === 'profile') {
          return (
            <Tabs.Screen
              key="profile"
              name="profile"
              options={{
                title: t('tabs.profile', 'Profile'),
              }}
            />
          );
        }
        if (screenName === 'book-appointment') {
          return (
            <Tabs.Screen
              key="book-appointment"
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
          );
        }
        return null;
      })}
      <Tabs.Screen 
        name="waitlist" 
        options={{
          title: t('waitlist.title', 'Waitlist'),
          href: null,
        }}
      />
      <Tabs.Screen 
        name="notifications" 
        options={{
          title: t('notifications.title', 'Notifications'),
          href: null,
        }}
      />
      <Tabs.Screen 
        name="select-time" 
        options={{
          href: null,
        }}
      />
      <Tabs.Screen 
        name="select-barber" 
        options={{
          href: null,
        }}
      />
      <Tabs.Screen 
        name="select-service" 
        options={{
          href: null,
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
  },
  
  // Center tab item (inline, not floating)
  centerTabItem: {
    flex: 0,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
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
  
  // Center button styles (sits inside the tab bar)
  floatingButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
  },

  floatingCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // (removed) previous pulse styles
  
  tabBarBackground: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
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
>>>>>>> ba2a041786b371adf61181466dda19db3258b603
