import React, { useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Text, useWindowDimensions } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Clock,
  Home,
  Plus,
  Settings,
  Store,
  Wallet,
} from "lucide-react-native";
import { TabButton } from "./tab-button";
import { useColors } from "@/src/theme/ThemeProvider";
import { useAdminCalendarView } from "@/contexts/AdminCalendarViewContext";
import type { CalendarViewMode } from "@/components/admin-calendar/calendarViewMode";

/** ברירות מחדל — אם המפתח ב־JSON לא נטען (cache / Metro), עדיין יוצג טקסט תקין */
const CALENDAR_MODE_LABEL_HE: Record<CalendarViewMode, string> = {
  month: "חודשי",
  week: "שבועי",
  day: "יומי",
};
const CALENDAR_MODE_LABEL_EN: Record<CalendarViewMode, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
};
import { CalendarViewModeIcon } from "@/components/admin-calendar/CalendarViewMenuIcons";
import {
  useAdminCalendarReminderFab,
  useAdminCalendarSetPlusAnchorWindow,
} from "@/contexts/AdminCalendarReminderFabContext";

const INACTIVE = "#8a8a8a";
const ICON_ACTIVE = "#ffffff";

/** חודשי משמאל, שבועי במרכז, יומי מימין — direction: ltr על ה־inner */
const CALENDAR_VIEW_ORDER: CalendarViewMode[] = ["month", "week", "day"];

export const AdminFloatingTabBar: React.FC = () => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { primary } = useColors();
  const { calendarView, setCalendarView } = useAdminCalendarView();
  const reminderFab = useAdminCalendarReminderFab();
  const setPlusAnchorWindow = useAdminCalendarSetPlusAnchorWindow();
  const plusPillRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const currentTab = segments[1] as string | undefined;
  const isActive = (tab: string) =>
    currentTab === tab || (tab === "index" && !currentTab);

  const iconColor = (tab: string) => (isActive(tab) ? ICON_ACTIVE : INACTIVE);

  const measurePlusInWindow = useCallback(() => {
    plusPillRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setPlusAnchorWindow({ x, y, width, height });
      }
    });
  }, [setPlusAnchorWindow]);

  useEffect(() => {
    if (currentTab !== "appointments") {
      setPlusAnchorWindow(null);
    }
  }, [currentTab, setPlusAnchorWindow]);

  useEffect(() => {
    if (currentTab !== "appointments") return;
    const id = requestAnimationFrame(() => measurePlusInWindow());
    return () => cancelAnimationFrame(id);
  }, [currentTab, measurePlusInWindow, windowWidth, windowHeight]);

  if (isActive("appointments")) {
    return (
      <View
        style={[styles.root, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        {/* direction: ltr — פלוס משמאל, בית מימין, תצוגות באמצע (גם ב־RTL) */}
        <View style={[styles.inner, styles.innerCalendarBar]}>
          <View
            ref={plusPillRef}
            onLayout={measurePlusInWindow}
            style={[styles.pill, styles.border, styles.shadow]}
          >
            <TabButton
              focused={!!reminderFab?.isOpen}
              activeColor={primary}
              onPress={() => reminderFab?.onPress()}
            >
              <Plus
                size={22}
                color={reminderFab?.isOpen ? ICON_ACTIVE : INACTIVE}
              />
            </TabButton>
          </View>

          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            {CALENDAR_VIEW_ORDER.map((mode) => {
              const focused = calendarView === mode;
              const fg = focused ? ICON_ACTIVE : INACTIVE;
              const lng = typeof i18n.language === "string" ? i18n.language : "";
              const fallback = lng.startsWith("he")
                ? CALENDAR_MODE_LABEL_HE[mode]
                : CALENDAR_MODE_LABEL_EN[mode];
              const label = String(
                t(`admin.calendarViewMode.${mode}`, { defaultValue: fallback })
              );
              return (
                <TabButton
                  key={mode}
                  focused={focused}
                  activeColor={primary}
                  onPress={() => setCalendarView(mode)}
                  buttonPadding={6}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                >
                  <View style={styles.calendarModeCell}>
                    <CalendarViewModeIcon mode={mode} color={fg} iconSize={20} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.calendarModeLabel,
                        { color: fg },
                        lng.startsWith("he") ? { writingDirection: "rtl" as const } : null,
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                </TabButton>
              );
            })}
          </View>

          <View style={[styles.pill, styles.border, styles.shadow]}>
            <TabButton
              focused={isActive("index")}
              activeColor={primary}
              onPress={() => router.push("/(tabs)")}
            >
              <Home size={22} color={iconColor("index")} />
            </TabButton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { bottom: insets.bottom + 12 }]}
      pointerEvents="box-none"
    >
      <View style={styles.inner}>
        <View style={[styles.pill, styles.border, styles.shadow]}>
          <TabButton
            focused={isActive("index")}
            activeColor={primary}
            onPress={() => router.push("/(tabs)")}
          >
            <Home size={22} color={iconColor("index")} />
          </TabButton>
        </View>

        <View
          style={[styles.pill, styles.center, styles.border, styles.shadow]}
        >
          <TabButton
            focused={isActive("edit-products")}
            activeColor={primary}
            onPress={() => router.push("/(tabs)/edit-products")}
            accessibilityLabel={t("admin.tab.store", "Store")}
            accessibilityRole="button"
          >
            <Store size={22} color={iconColor("edit-products")} />
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
  innerCalendarBar: {
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
  calendarModeCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 3,
    minWidth: 54,
    maxWidth: 76,
  },
  calendarModeLabel: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.15,
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
