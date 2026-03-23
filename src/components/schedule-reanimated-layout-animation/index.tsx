import { Plus, X } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const weekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const startHour = 8;
const _spacing = 10;
const borderRadius = 16;
const _color = "#ececec";
const _layout = LinearTransition.springify();
const _entering = FadeInDown.springify();
const _exiting = FadeOutDown.springify();
const _fadeExit = FadeOut.springify();

function HourBlock({ block }: { block: number }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: _color,
        borderRadius: borderRadius - _spacing,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: _spacing / 4,
      }}>
      <Text>
        {block > 9 ? block : `0${block}`}:00{" "}
        {block > 11 && block < 24 ? "PM" : "AM"}
      </Text>
    </View>
  );
}

function Hours() {
  const [hours, setHours] = useState([startHour]);
  return (
    <Animated.View
      style={{ gap: _spacing }}
      layout={_layout}
      entering={_entering}
      exiting={_exiting}>
      {hours.map((startHour) => (
        <Animated.View
          layout={_layout}
          entering={_entering}
          exiting={_fadeExit}
          key={`hour-${startHour}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: _spacing,
            alignItems: "center",
          }}>
          <Text style={{ opacity: 0.4 }}>From</Text>
          <HourBlock block={startHour} />
          <Text style={{ opacity: 0.4 }}>To</Text>
          <HourBlock block={startHour + 1} />
          <Pressable
            onPress={() => {
              console.log("Remove hour: ", startHour);
              setHours((prev) => {
                const xxx = [...prev.filter((k) => k !== startHour)];
                return xxx;
              });
            }}>
            <View
              style={{
                backgroundColor: _color,
                height: 24,
                aspectRatio: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: borderRadius - _spacing,
              }}>
              <X size={14} color='#555' />
            </View>
          </Pressable>
        </Animated.View>
      ))}
      <AnimatedPressable
        layout={_layout}
        onPress={() => {
          // add more.
          if (hours.length === 0) {
            setHours([startHour]);
            return;
          }
          setHours((prev) => [...prev, prev[prev.length - 1] + 1]);
        }}>
        <View
          style={{
            flexDirection: "row",
            gap: _spacing / 2,
            padding: _spacing,
            borderRadius: borderRadius - _spacing / 2,
            backgroundColor: _color,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: _spacing / 2,
          }}>
          <Plus size={18} color='#333' />
          <Text style={{ fontSize: 14, color: "#333" }}>Add more</Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function Day({ day }: { day: (typeof weekDays)[number] }) {
  const [isActive, setIsActive] = useState(false);
  return (
    <Animated.View
      style={{
        padding: _spacing,
        paddingVertical: _spacing / 2,
        borderWidth: 1,
        borderRadius: borderRadius,
        borderColor: _color,
        gap: _spacing,
        overflow: "hidden",
        backgroundColor: !isActive ? _color : "transparent",
      }}
      layout={_layout}>
      <Animated.View
        layout={_layout}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          overflow: "hidden",
        }}>
        <Text style={{ fontSize: 16, opacity: 0.8 }}>{day}</Text>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          thumbColor={"white"}
          trackColor={{ true: "#666" }}
          style={{
            transformOrigin: ["100%", "50%", 0],
            transform: [
              {
                scale: 0.65,
              },
            ],
          }}
        />
      </Animated.View>
      {isActive && <Hours />}
    </Animated.View>
  );
}

export default function Schedule() {
  return (
    <SafeAreaView
      style={{
        gap: _spacing,
        padding: _spacing,
        paddingHorizontal: _spacing * 4,
      }}>
      {weekDays.map((day) => (
        <Day day={day} key={`day-${day}`} />
      ))}
    </SafeAreaView>
  );
}
