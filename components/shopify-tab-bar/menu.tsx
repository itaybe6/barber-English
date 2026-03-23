import React, { useCallback } from "react";
import { FlatList, Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { Settings, X, Bell, Clock, Image, Users, CalendarDays, ChevronRight } from "lucide-react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMenu } from "./menu-provider";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

const MENU_SPRING_CONFIG = { damping: 130, stiffness: 1400 };

interface MenuItem {
  title: string;
  leftIcon: React.ReactNode;
  route?: string;
}

interface MenuProps {
  items: MenuItem[];
}

export const Menu: React.FC<MenuProps> = ({ items }) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();

  const translateYDistance = height * 0.15;
  const { menuProgress } = useMenu();
  const isPressed = useSharedValue(false);

  const rContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(menuProgress.get(), [0, 1], [0, 1]),
    pointerEvents: menuProgress.get() === 1 ? "auto" : "none",
  }));

  const rHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(menuProgress.get(), [0, 1], [translateYDistance, 0]) }],
  }));

  const rListStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(menuProgress.get(), [0, 1], [translateYDistance, 0]) },
      { scale: interpolate(menuProgress.get(), [0, 1], [0.8, 1]) },
    ],
  }));

  const closeMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    menuProgress.set(withSpring(0, MENU_SPRING_CONFIG));
  }, [menuProgress]);

  const renderItem = useCallback(
    ({ item }: { item: MenuItem }) => (
      <Pressable
        onPress={() => {
          if (item.route) {
            closeMenu();
            setTimeout(() => router.push(item.route as any), 300);
          }
        }}
        className="flex-row px-5 py-3 items-center justify-between"
      >
        <View className="flex-row items-center gap-4">
          {item.leftIcon}
          <Text className="text-2xl font-semibold text-[#E5E7EB]">{item.title}</Text>
        </View>
        <ChevronRight size={20} color="#E5E7EB" />
      </Pressable>
    ),
    [closeMenu, router]
  );

  return (
    <Animated.View
      className="bg-black px-2"
      style={[
        StyleSheet.absoluteFill,
        rContainerStyle,
        { paddingTop: insets.top + 12 },
      ]}
    >
      <Animated.View style={rHeaderStyle} className="flex-row items-center justify-between pr-3">
        <Pressable
          className="p-3 rounded-full"
          onPress={closeMenu}
          onPressIn={() => isPressed.set(true)}
          onPressOut={() => isPressed.set(false)}
        >
          <Animated.View className="p-3 rounded-full bg-neutral-800">
            <X size={20} color="#E5E7EB" />
          </Animated.View>
        </Pressable>
        <View className="flex-row items-center gap-3 bg-neutral-800 px-4 py-3 rounded-full">
          <Settings size={20} color="#E5E7EB" />
          <Text className="text-base font-semibold text-[#E5E7EB]">Settings</Text>
        </View>
      </Animated.View>

      <Animated.View style={rListStyle}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.title}
          renderItem={renderItem}
          contentContainerClassName="pt-3"
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        />
      </Animated.View>
    </Animated.View>
  );
};

export const CLIENT_MENU_ITEMS: MenuItem[] = [
  { title: "Notifications", leftIcon: <Bell size={20} color="#E5E7EB" /> },
  { title: "Waitlist", leftIcon: <Users size={20} color="#E5E7EB" /> },
  { title: "Gallery", leftIcon: <Image size={20} color="#E5E7EB" /> },
];

export const ADMIN_MENU_ITEMS: MenuItem[] = [
  { title: "Gallery", leftIcon: <Image size={20} color="#E5E7EB" /> },
  { title: "Notifications", leftIcon: <Bell size={20} color="#E5E7EB" /> },
  { title: "Client Notifications", leftIcon: <Bell size={20} color="#E5E7EB" /> },
  { title: "Edit Gallery", leftIcon: <Image size={20} color="#E5E7EB" /> },
  { title: "Edit Products", leftIcon: <Clock size={20} color="#E5E7EB" /> },
];
