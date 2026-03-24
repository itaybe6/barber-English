import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarDays,
  Clock,
  Home,
  Settings,
  Users,
  Wallet,
} from "lucide-react-native";
import { TabButton } from "./tab-button";
import { useColors } from "@/src/theme/ThemeProvider";

const INACTIVE = "#8a8a8a";
const ICON_ACTIVE = "#ffffff";

export const AdminFloatingTabBar: React.FC = () => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { primary } = useColors();

  const currentTab = segments[1] as string | undefined;
  const isActive = (tab: string) => currentTab === tab || (tab === "index" && !currentTab);

  const iconColor = (tab: string) => (isActive(tab) ? ICON_ACTIVE : INACTIVE);

  return (
    <View style={[styles.root, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={styles.inner}>
      {/* Left standalone – Home */}
      <View style={[styles.pill, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("index")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)")}
        >
          <Home size={22} color={iconColor("index")} />
        </TabButton>
      </View>

      {/* Center pill */}
      <View style={[styles.pill, styles.center, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("waitlist")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)/waitlist")}
        >
          <Users size={22} color={iconColor("waitlist")} />
        </TabButton>

        <TabButton
          focused={isActive("appointments")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)/appointments")}
        >
          <CalendarDays size={22} color={iconColor("appointments")} />
        </TabButton>

        <TabButton
          focused={isActive("business-hours")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)/business-hours")}
        >
          <Clock size={22} color={iconColor("business-hours")} />
        </TabButton>

        <TabButton
          focused={isActive("finance")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)/finance")}
        >
          <Wallet size={22} color={iconColor("finance")} />
        </TabButton>

      </View>

      {/* Right standalone – Settings */}
      <View style={[styles.pill, styles.border, styles.shadow]}>
        <TabButton
          focused={isActive("settings")}
          activeColor={primary}
          onPress={() => router.push("/(tabs)/settings")}
        >
          <Settings size={22} color={iconColor("settings")} />
        </TabButton>
      </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    padding: 2,
  },
  center: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
