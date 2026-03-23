import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuProvider } from "@/components/shopify-tab-bar/menu-provider";
import { AnimatedTabsContainer } from "@/components/shopify-tab-bar/animated-tabs-container";
import { AdminFloatingTabBar } from "@/components/shopify-tab-bar/admin-floating-tab-bar";

const TAB_BAR_HEIGHT = 84;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
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
            <Tabs.Screen name="index" options={{ title: "Home" }} />
            <Tabs.Screen name="waitlist" options={{ title: "Waitlist" }} />
            <Tabs.Screen name="appointments" options={{ title: "Calendar" }} />
            <Tabs.Screen name="business-hours" options={{ title: "Hours" }} />
            <Tabs.Screen name="settings" options={{ title: "Settings" }} />
            <Tabs.Screen name="gallery" options={{ title: "Gallery", href: null }} />
            <Tabs.Screen name="client-notifications" options={{ title: "Notifications", href: null }} />
            <Tabs.Screen name="notifications" options={{ title: "התראות", href: null }} />
            <Tabs.Screen name="edit-gallery" options={{ title: "Edit Gallery", href: null }} />
            <Tabs.Screen name="edit-products" options={{ title: "Edit Products", href: null }} />
            <Tabs.Screen name="edit-home-hero" options={{ title: "Edit Home Hero", href: null }} />
          </Tabs>
        </AnimatedTabsContainer>

        {/* Floating tab bar rendered as overlay at the layout level */}
        <AdminFloatingTabBar />
      </View>
    </MenuProvider>
  );
}
