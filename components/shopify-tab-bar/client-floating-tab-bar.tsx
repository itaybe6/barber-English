import React from "react";
import { View, StyleSheet, Alert, Pressable } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CalendarDays, Home, Image, Plus, User } from "lucide-react-native";
import { useAuthStore } from "@/stores/authStore";
import { isClientAwaitingApproval } from "@/lib/utils/clientApproval";
import { useTranslation } from "react-i18next";
import { getClientTabBarBottomInset } from "@/constants/clientTabBarInsets";

const ACTIVE = "#000000";
const INACTIVE = "#9CA3AF";
const BAR_BG = "#F2F2F7";
const ICON_STROKE = 1.85;
const ICON_SIZE = 24;
const BOOK_FAB_SIZE = 40;
const PLUS_ICON_SIZE = 20;

type SetLoginModal = (v: { visible: boolean; title?: string; message?: string }) => void;

interface Props {
  setLoginModal: SetLoginModal;
}

interface TabSlotProps {
  focused: boolean;
  Icon: typeof Home;
  onPress: () => void;
  accessibilityLabel: string;
}

const TabSlot: React.FC<TabSlotProps> = ({ focused, Icon, onPress, accessibilityLabel }) => {
  const color = focused ? ACTIVE : INACTIVE;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      style={styles.tabSlot}
    >
      <Icon size={ICON_SIZE} color={color} strokeWidth={ICON_STROKE} />
    </Pressable>
  );
};

export const ClientFloatingTabBar: React.FC<Props> = ({ setLoginModal }) => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isBlocked = Boolean((user as any)?.block);
  const awaitingApproval = isClientAwaitingApproval(user);
  const { t } = useTranslation();

  const currentTab = segments[1] as string | undefined;
  if (currentTab === "book-appointment") {
    return null;
  }

  const isActive = (tab: string) => currentTab === tab || (tab === "index" && !currentTab);

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
    if (awaitingApproval) {
      Alert.alert(
        t("account.awaitingApproval", "Awaiting approval"),
        t(
          "account.awaitingApproval.message",
          "Your registration is waiting for the business to approve. You cannot book appointments yet.",
        ),
      );
      return;
    }
    router.push("/(client-tabs)/book-appointment");
  };

  const bottomInset = getClientTabBarBottomInset(insets.bottom);

  return (
    <View style={[styles.root, { bottom: bottomInset }]} pointerEvents="box-none">
      <View style={[styles.capsule, styles.capsuleShadow]}>
        <TabSlot
          focused={isActive("index")}
          Icon={Home}
          accessibilityLabel={t("tabs.home", "Home")}
          onPress={() => navigate("/(client-tabs)")}
        />
        <TabSlot
          focused={isActive("gallery")}
          Icon={Image}
          accessibilityLabel={t("tabs.gallery", "Gallery")}
          onPress={() => navigate("/(client-tabs)/gallery")}
        />
        <View style={styles.tabSlot}>
          <Pressable
            accessibilityLabel={t("tabs.book", "Book")}
            accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
              handleBook();
            }}
          >
            {({ pressed }) => (
              <View style={[styles.bookFab, pressed && styles.bookFabPressed]}>
                <Plus size={PLUS_ICON_SIZE} color="#FFFFFF" strokeWidth={2} />
              </View>
            )}
          </Pressable>
        </View>
        <TabSlot
          focused={isActive("appointments")}
          Icon={CalendarDays}
          accessibilityLabel={t("tabs.booking", "Booking")}
          onPress={() => navigate("/(client-tabs)/appointments", true)}
        />
        <TabSlot
          focused={isActive("profile")}
          Icon={User}
          accessibilityLabel={t("tabs.profile", "Profile")}
          onPress={() => navigate("/(client-tabs)/profile", true)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 28,
    right: 28,
    alignItems: "center",
  },
  capsule: {
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 340,
    backgroundColor: BAR_BG,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  capsuleShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  tabSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  bookFab: {
    width: BOOK_FAB_SIZE,
    height: BOOK_FAB_SIZE,
    borderRadius: BOOK_FAB_SIZE / 2,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  bookFabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
