import React from "react";
import { Tabs, useRouter } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import LoginRequiredModal from "@/components/LoginRequiredModal";
import { MenuProvider } from "@/components/shopify-tab-bar/menu-provider";
import { AnimatedTabsContainer } from "@/components/shopify-tab-bar/animated-tabs-container";
import { ClientFloatingTabBar } from "@/components/shopify-tab-bar/client-floating-tab-bar";
import { Menu, CLIENT_MENU_ITEMS } from "@/components/shopify-tab-bar/menu";

export default function ClientTabsLayout() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loginModal, setLoginModal] = React.useState<{
    visible: boolean;
    title?: string;
    message?: string;
  }>({ visible: false });

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
            <Tabs.Screen name="notifications" options={{ title: t("notifications.title", "Notifications"), href: null }} />
            <Tabs.Screen name="select-time" options={{ href: null }} />
            <Tabs.Screen name="select-barber" options={{ href: null }} />
            <Tabs.Screen name="select-service" options={{ href: null }} />
          </Tabs>
        </AnimatedTabsContainer>

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
