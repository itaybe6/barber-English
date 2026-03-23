import React from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withSpring } from "react-native-reanimated";
import {
  CalendarDays,
  CalendarPlus,
  Home,
  Image,
  Menu as MenuIcon,
  User,
} from "lucide-react-native";
import { TabButton } from "./tab-button";
import { useMenu } from "./menu-provider";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "react-i18next";
import { useColors } from "@/src/theme/ThemeProvider";

const MENU_SPRING = { damping: 130, stiffness: 1400 };
const INACTIVE = "#8a8a8a";
const ICON_ACTIVE = "#ffffff";

type SetLoginModal = (v: { visible: boolean; title?: string; message?: string }) => void;

interface Props {
  setLoginModal: SetLoginModal;
}

export const ClientFloatingTabBar: React.FC<Props> = ({ setLoginModal }) => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { menuProgress } = useMenu();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isBlocked = Boolean((user as any)?.block);
  const { t } = useTranslation();
  const { primary } = useColors();

  const currentTab = segments[1] as string | undefined;
  const isActive = (tab: string) => currentTab === tab || (tab === "index" && !currentTab);
  const iconColor = (tab: string) => (isActive(tab) ? ICON_ACTIVE : INACTIVE);

  const navigate = (path: string, requireAuth = false) => {
    if (requireAuth && !isAuthenticated) {
      setLoginModal({
        visible: true,
        title: t("login.required", "Login Required"),
        message: t("login.pleaseSignInTo", "Please sign in to continue."),
      });
      return;
    }
    router.push(path as any);
  };

  const handleBook = () => {
    if (!isAuthenticated) {
      setLoginModal({
        visible: true,
        title: t("login.required", "Login Required"),
        message: t("login.pleaseSignInToBook", "Please sign in to book an appointment."),
      });
      return;
    }
    if (isBlocked) {
      Alert.alert(
        t("account.blocked", "Account Blocked"),
        t("account.blocked.message", "Your account is blocked. You cannot book appointments.")
      );
      return;
    }
    router.push("/(client-tabs)/book-appointment");
  };

  return (
    <View style={[styles.root, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      {/* Left standalone – Gallery */}
      <View style={[styles.pill, styles.single, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("gallery")}
          activeColor={primary}
          onPress={() => navigate("/(client-tabs)/gallery")}
        >
          <Image size={22} color={iconColor("gallery")} />
        </TabButton>
      </View>

      {/* Center pill */}
      <View style={[styles.pill, styles.center, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("index")}
          activeColor={primary}
          onPress={() => navigate("/(client-tabs)")}
        >
          <Home size={22} color={iconColor("index")} />
        </TabButton>

        <TabButton focused={isActive("book-appointment")} activeColor={primary} onPress={handleBook}>
          <CalendarPlus size={22} color={iconColor("book-appointment")} />
        </TabButton>

        <TabButton
          focused={isActive("appointments")}
          activeColor={primary}
          onPress={() => navigate("/(client-tabs)/appointments", true)}
        >
          <CalendarDays size={22} color={iconColor("appointments")} />
        </TabButton>

        {/* Menu trigger */}
        <TabButton focused={false} activeColor={primary} onPress={() => menuProgress.set(withSpring(1, MENU_SPRING))}>
          <MenuIcon size={22} color={INACTIVE} />
        </TabButton>
      </View>

      {/* Right standalone – Profile */}
      <View style={[styles.pill, styles.single, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("profile")}
          activeColor={primary}
          onPress={() => navigate("/(client-tabs)/profile", true)}
        >
          <User size={22} color={iconColor("profile")} />
        </TabButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    padding: 2,
  },
  single: {},
  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  border: {
    borderWidth: 1,
    borderColor: "#F1F1F1",
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
});
