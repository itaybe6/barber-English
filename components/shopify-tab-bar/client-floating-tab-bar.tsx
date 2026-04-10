import React, { useEffect } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, Home, Plus, User } from "lucide-react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuthStore } from "@/stores/authStore";
import { isClientAwaitingApproval } from "@/lib/utils/clientApproval";
import { useTranslation } from "react-i18next";
import { getClientTabBarBottomInset } from "@/constants/clientTabBarInsets";
import { TabButton } from "./tab-button";
import { useColors, usePrimaryContrast } from "@/src/theme/ThemeProvider";

const INACTIVE = "#8a8a8a";
const ICON_SIZE = 22;
const PLUS_WIGGLE_DEGREES = 18;
const PLUS_WIGGLE_DURATION = 280;
const PLUS_WIGGLE_PAUSE = 1500;

export const ClientFloatingTabBar: React.FC = () => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isBlocked = Boolean((user as any)?.block);
  const awaitingApproval = isClientAwaitingApproval(user);
  const { t } = useTranslation();
  const { primary } = useColors();
  const { onPrimary } = usePrimaryContrast();
  const plusWiggle = useSharedValue(0);

  const currentTab = segments[1] as string | undefined;

  const isActive = (tab: string) => currentTab === tab || (tab === "index" && !currentTab);

  const iconColor = (tab: string) => (isActive(tab) ? onPrimary : INACTIVE);

  const navigate = (path: string, requireAuth = false) => {
    if (requireAuth && !isAuthenticated) {
      router.push("/login");
      return;
    }
    router.push(path as any);
  };

  const handleBook = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isBlocked) {
      Alert.alert(
        t("account.blocked", "Account Blocked"),
        t("account.blocked.message", "Your account is blocked. You cannot book appointments."),
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

  useEffect(() => {
    plusWiggle.set(
      withRepeat(
        withSequence(
          withDelay(
            PLUS_WIGGLE_PAUSE,
            withTiming(-1, { duration: PLUS_WIGGLE_DURATION }),
          ),
          withTiming(0, { duration: PLUS_WIGGLE_DURATION }),
          withDelay(
            PLUS_WIGGLE_PAUSE,
            withTiming(1, { duration: PLUS_WIGGLE_DURATION }),
          ),
          withTiming(0, { duration: PLUS_WIGGLE_DURATION }),
        ),
        -1,
        false,
      ),
    );
  }, [plusWiggle]);

  const plusIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      plusWiggle.get(),
      [-1, 0, 1],
      [-PLUS_WIGGLE_DEGREES, 0, PLUS_WIGGLE_DEGREES],
    );
    const scale = interpolate(plusWiggle.get(), [-1, 0, 1], [1.08, 1, 1.08]);
    const translateY = interpolate(plusWiggle.get(), [-1, 0, 1], [-1.5, 0, -1.5]);

    return {
      transform: [
        { translateY },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <View
      style={[styles.root, { bottom: getClientTabBarBottomInset(insets.bottom) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.inner, styles.innerLtr]}>
        <View style={[styles.pill, styles.border, styles.shadow]}>
          <TabButton
            focused={false}
            activeColor={primary}
            onPress={handleBook}
            accessibilityLabel={t("tabs.book", "Book")}
            accessibilityRole="button"
          >
            <Animated.View style={plusIconStyle}>
              <Plus size={ICON_SIZE} color={primary} strokeWidth={2.4} />
            </Animated.View>
          </TabButton>
        </View>

        <View style={[styles.pill, styles.center, styles.border, styles.shadow]}>
          <TabButton
            focused={isActive("profile")}
            activeColor={primary}
            onPress={() => navigate("/(client-tabs)/profile", true)}
            accessibilityLabel={t("tabs.profile", "Profile")}
            accessibilityRole="tab"
          >
            <User size={ICON_SIZE} color={iconColor("profile")} />
          </TabButton>
          <TabButton
            focused={isActive("appointments")}
            activeColor={primary}
            onPress={() => navigate("/(client-tabs)/appointments", true)}
            accessibilityLabel={t("tabs.booking", "Booking")}
            accessibilityRole="tab"
          >
            <CalendarDays size={ICON_SIZE} color={iconColor("appointments")} />
          </TabButton>
          <TabButton
            focused={isActive("index")}
            activeColor={primary}
            onPress={() => navigate("/(client-tabs)")}
            accessibilityLabel={t("tabs.home", "Home")}
            accessibilityRole="tab"
          >
            <Home size={ICON_SIZE} color={iconColor("index")} />
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
  innerLtr: {
    direction: "ltr",
  },
  pill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    padding: 2,
  },
  center: {
    flexDirection: "row",
    alignItems: "stretch",
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
