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
  ArrowDownUp,
  Check,
  Trash2,
  Settings,
  Wallet,
  Palette,
  LayoutGrid,
  FileText,
  ChevronRight,
} from "lucide-react-native";
import { TabButton } from "./tab-button";
import { useColors, usePrimaryContrast } from "@/src/theme/ThemeProvider";
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
import { useEditGalleryTabBar } from "@/contexts/EditGalleryTabBarContext";
import { useEditProductsTabBar } from "@/contexts/EditProductsTabBarContext";
import { usePickPrimaryColorTabBar } from "@/contexts/PickPrimaryColorTabBarContext";

const INACTIVE = "#8a8a8a";

/** חודשי משמאל, שבועי במרכז, יומי מימין — direction: ltr על ה־inner */
const CALENDAR_VIEW_ORDER: CalendarViewMode[] = ["month", "week", "day"];

export const AdminFloatingTabBar: React.FC = () => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { primary } = useColors();
  const { onPrimary } = usePrimaryContrast();
  const { calendarView, setCalendarView } = useAdminCalendarView();
  const reminderFab = useAdminCalendarReminderFab();
  const setPlusAnchorWindow = useAdminCalendarSetPlusAnchorWindow();
  const plusPillRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const editGalleryTabBar = useEditGalleryTabBar();
  const editProductsTabBar = useEditProductsTabBar();
  const pickPrimaryTabBar = usePickPrimaryColorTabBar();

  const currentTab = segments[1] as string | undefined;
  const isActive = (tab: string) =>
    currentTab === tab || (tab === "index" && !currentTab);

  const iconColor = (tab: string) => (isActive(tab) ? onPrimary : INACTIVE);

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
                color={reminderFab?.isOpen ? onPrimary : INACTIVE}
              />
            </TabButton>
          </View>

          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            {CALENDAR_VIEW_ORDER.map((mode) => {
              const focused = calendarView === mode;
              const fg = focused ? onPrimary : INACTIVE;
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

  if (currentTab === "edit-gallery" && editGalleryTabBar.floatingBarHidden) {
    return null;
  }

  if (currentTab === "edit-products" && editProductsTabBar.floatingBarHidden) {
    return null;
  }

  if (currentTab === "edit-products") {
    return (
      <View
        style={[styles.root, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.inner, styles.innerCalendarBar, styles.editGalleryRow]}
        >
          <View style={[styles.pill, styles.border, styles.shadow]}>
            <TabButton
              focused={false}
              activeColor={primary}
              onPress={() => editProductsTabBar.get()?.openCreate()}
              accessibilityLabel={t("admin.store.tabAddProduct", "הוספת מוצר")}
              accessibilityRole="button"
            >
              <Plus size={22} color={INACTIVE} />
            </TabButton>
          </View>

          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            <TabButton
              focused={editProductsTabBar.reorderMode}
              activeColor={primary}
              onPress={() => {
                if (
                  editProductsTabBar.reorderMode &&
                  editProductsTabBar.reorderDirty
                ) {
                  void editProductsTabBar.get()?.commitReorder?.();
                  return;
                }
                editProductsTabBar.toggleReorderMode();
              }}
              accessibilityLabel={
                editProductsTabBar.reorderMode && editProductsTabBar.reorderDirty
                  ? t("admin.store.tabSaveReorder", "שמירת סדר")
                  : t("admin.store.tabReorderMode", "סידור מוצרים")
              }
              accessibilityRole="button"
            >
              {editProductsTabBar.reorderMode && editProductsTabBar.reorderDirty ? (
                <Check size={22} color={onPrimary} strokeWidth={2.5} />
              ) : (
                <ArrowDownUp
                  size={22}
                  color={editProductsTabBar.reorderMode ? onPrimary : INACTIVE}
                />
              )}
            </TabButton>
            <TabButton
              focused={editProductsTabBar.deleteMode}
              activeColor={primary}
              onPress={() => editProductsTabBar.toggleDeleteMode()}
              accessibilityLabel={t("admin.store.tabDeleteMode", "מחיקת מוצרים")}
              accessibilityRole="button"
            >
              <Trash2
                size={22}
                color={editProductsTabBar.deleteMode ? onPrimary : INACTIVE}
              />
            </TabButton>
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

  if (currentTab === "edit-gallery") {
    return (
      <View
        style={[styles.root, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.inner, styles.innerCalendarBar, styles.editGalleryRow]}
        >
          {/* direction: ltr — פלוס משמאל, סדר+מחיקה, בית מימין */}
          <View style={[styles.pill, styles.border, styles.shadow]}>
            <TabButton
              focused={false}
              activeColor={primary}
              onPress={() => editGalleryTabBar.get()?.openCreate()}
              accessibilityLabel={t(
                "admin.gallery.tabAddDesign",
                "Add design"
              )}
              accessibilityRole="button"
            >
              <Plus size={22} color={INACTIVE} />
            </TabButton>
          </View>

          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            <TabButton
              focused={editGalleryTabBar.reorderMode}
              activeColor={primary}
              onPress={() => {
                if (
                  editGalleryTabBar.reorderMode &&
                  editGalleryTabBar.reorderDirty
                ) {
                  void editGalleryTabBar.get()?.commitReorder?.();
                  return;
                }
                editGalleryTabBar.toggleReorderMode();
              }}
              accessibilityLabel={
                editGalleryTabBar.reorderMode &&
                editGalleryTabBar.reorderDirty
                  ? t(
                      "admin.gallery.tabSaveReorder",
                      "Save gallery order"
                    )
                  : t(
                      "admin.gallery.tabReorderMode",
                      "Reorder gallery"
                    )
              }
              accessibilityRole="button"
            >
              {editGalleryTabBar.reorderMode &&
              editGalleryTabBar.reorderDirty ? (
                <Check size={22} color={onPrimary} strokeWidth={2.5} />
              ) : (
                <ArrowDownUp
                  size={22}
                  color={
                    editGalleryTabBar.reorderMode ? onPrimary : INACTIVE
                  }
                />
              )}
            </TabButton>
            <TabButton
              focused={editGalleryTabBar.deleteMode}
              activeColor={primary}
              onPress={() => editGalleryTabBar.toggleDeleteMode()}
              accessibilityLabel={t(
                "admin.gallery.tabDeleteMode",
                "Show delete on designs"
              )}
              accessibilityRole="button"
            >
              <Trash2
                size={22}
                color={editGalleryTabBar.deleteMode ? onPrimary : INACTIVE}
              />
            </TabButton>
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

  if (currentTab === "finance" || currentTab === "finance-accountant") {
    const lng = typeof i18n.language === "string" ? i18n.language : "";
    const labelIncome = t(
      "admin.financeTab.incomeExpenses",
      "הכנסות והוצאות"
    );
    const labelAccountant = t(
      "admin.financeTab.accountant",
      "הגדרות רואה חשבון"
    );
    const financeMain = currentTab === "finance";
    const financeAcct = currentTab === "finance-accountant";
    return (
      <View
        style={[styles.root, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.inner, styles.innerCalendarBar, styles.editGalleryRow]}
        >
          {/* ltr row: פיננסים משמאל, בית מימין */}
          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            <TabButton
              focused={financeMain}
              activeColor={primary}
              onPress={() => router.push("/(tabs)/finance")}
              buttonPadding={6}
              accessibilityLabel={labelIncome}
              accessibilityRole="button"
            >
              <View style={styles.financeTabCell}>
                <Wallet
                  size={20}
                  color={financeMain ? onPrimary : INACTIVE}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.financeTabLabel,
                    { color: financeMain ? onPrimary : INACTIVE },
                    lng.startsWith("he")
                      ? { writingDirection: "rtl" as const }
                      : null,
                  ]}
                >
                  {labelIncome}
                </Text>
              </View>
            </TabButton>
            <TabButton
              focused={financeAcct}
              activeColor={primary}
              onPress={() => router.push("/(tabs)/finance-accountant")}
              buttonPadding={6}
              accessibilityLabel={labelAccountant}
              accessibilityRole="button"
            >
              <View style={styles.financeTabCell}>
                <FileText
                  size={20}
                  color={financeAcct ? onPrimary : INACTIVE}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.financeTabLabel,
                    { color: financeAcct ? onPrimary : INACTIVE },
                    lng.startsWith("he")
                      ? { writingDirection: "rtl" as const }
                      : null,
                  ]}
                >
                  {labelAccountant}
                </Text>
              </View>
            </TabButton>
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

  if (currentTab === "pick-primary-color") {
    return (
      <View
        style={[styles.root, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.inner,
            styles.innerCalendarBar,
            styles.editGalleryRow,
          ]}
        >
          <View
            style={[styles.pill, styles.center, styles.border, styles.shadow]}
          >
            <TabButton
              focused={false}
              activeColor={primary}
              onPress={() => pickPrimaryTabBar.get()?.openCustomPicker()}
              accessibilityLabel={t(
                "color.pickTabCustom",
                "בחירת צבע מותאם אישית"
              )}
              accessibilityRole="button"
            >
              <Palette size={22} color={INACTIVE} />
            </TabButton>
            <TabButton
              focused={false}
              activeColor={primary}
              onPress={() => pickPrimaryTabBar.get()?.openPaletteGrid()}
              accessibilityLabel={t(
                "color.pickTabPalette",
                "לוח צבעים"
              )}
              accessibilityRole="button"
            >
              <LayoutGrid size={22} color={INACTIVE} />
            </TabButton>
          </View>

          <View style={[styles.pill, styles.border, styles.shadow]}>
            <TabButton
              focused={false}
              activeColor={primary}
              onPress={() => {
                const tab = pickPrimaryTabBar.get()?.returnSettingsTab;
                if (tab) {
                  router.replace({
                    pathname: "/(tabs)/settings",
                    params: { tab },
                  });
                } else {
                  router.replace("/(tabs)/settings");
                }
              }}
              accessibilityLabel={t("back", "Back")}
              accessibilityRole="button"
            >
              <ChevronRight size={22} color={INACTIVE} strokeWidth={2.4} />
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
            focused={
              isActive("finance") || currentTab === "finance-accountant"
            }
            activeColor={primary}
            onPress={() => router.push("/(tabs)/finance")}
          >
            <Wallet
              size={22}
              color={
                isActive("finance") || currentTab === "finance-accountant"
                  ? onPrimary
                  : INACTIVE
              }
            />
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
  /** Plus+edit pill and home pill grouped and centered — not stretched to screen edges */
  editGalleryRow: {
    alignSelf: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
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
  financeTabCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 3,
    minWidth: 56,
    maxWidth: 100,
  },
  financeTabLabel: {
    fontSize: 10,
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
