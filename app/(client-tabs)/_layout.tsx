import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { MenuProvider } from "@/components/shopify-tab-bar/menu-provider";
import { AnimatedTabsContainer } from "@/components/shopify-tab-bar/animated-tabs-container";
import { ClientFloatingTabBar } from "@/components/shopify-tab-bar/client-floating-tab-bar";
export default function ClientTabsLayout() {
  const { t } = useTranslation();

  return (
    <MenuProvider>
      <View style={{ flex: 1 }}>
        <AnimatedTabsContainer>
          <Tabs
            tabBar={() => null}
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
            <Tabs.Screen name="select-time" options={{ href: null }} />
            <Tabs.Screen name="select-barber" options={{ href: null }} />
            <Tabs.Screen name="select-service" options={{ href: null }} />
          </Tabs>
        </AnimatedTabsContainer>

        <ClientFloatingTabBar />
      </View>
    </MenuProvider>
  );
}
