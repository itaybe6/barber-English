// Inspiration: https://dribbble.com/shots/15294651-Bank-App
import {
  Lato_400Regular,
  Lato_700Bold,
  useFonts,
} from "@expo-google-fonts/lato";
import { faker } from "@faker-js/faker";
import Constants from "expo-constants";
import * as React from "react";
import {
  Dimensions,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList);

const { width, height } = Dimensions.get("screen");

faker.seed(10);
const emojis = ["😃", "🧘🏻‍♂️", "🌍", "🍞", "🚗", "🎉", "🍆", "🏝", "🍔"];
const _months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const _headerData = [...Array(5).keys()].map((i) => ({
  key: faker.string.uuid(),
  amount: faker.finance.amount(500, 8500, 0, "$"),
  department: faker.commerce.department(),
  emoji: faker.helpers.arrayElement(emojis),
}));

const _data = _months.map((month) => ({
  title: month,
  key: month,
  data: [...Array(faker.number.int(10) + 2).keys()].map(() => {
    return {
      key: faker.string.uuid(),
      amount: faker.finance.amount(100, 2000, 2, "$"),
      type: faker.helpers.arrayElement(["inbound", "outbound"]),
      department: faker.commerce.department(),
      productName: faker.commerce.productName(),
      emoji: faker.helpers.arrayElement(emojis),
    };
  }),
}));

const _colors = {
  bg: "#030303",
  text: "#EAE9EE",
};
const _spacing = 10;
const _itemSize = width * 0.4;
const _otherSize = width * 0.3;

export default function App() {
  let [fontsLoaded] = useFonts({
    LatoRegular: Lato_400Regular,
    LatoBold: Lato_700Bold,
  });
  const headerAnim = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const headerHeight = useSharedValue(height);
  const onScroll = useAnimatedScrollHandler((event) => {
    const { y } = event.contentOffset;
    scrollY.value = y;
    // if (y < _itemSize) {
    headerAnim.value = y;
    // }
  });
  const dummyHeaderStylez = useAnimatedStyle(() => {
    return {
      height: headerHeight.value,
    };
  });
  const balanceStylez = useAnimatedStyle(() => {
    const _extraSectionHeaderSpacing = _spacing * 3;
    return {
      opacity: interpolate(
        headerAnim.value,
        [
          0,
          _itemSize,
          _itemSize + _extraSectionHeaderSpacing,
          headerHeight.value,
        ],
        [1, 1, 1, 0]
      ),
      transform: [
        {
          translateY: interpolate(
            headerAnim.value,
            [
              0,
              _itemSize,
              _itemSize + _extraSectionHeaderSpacing,
              _itemSize + _extraSectionHeaderSpacing + 1,
            ],
            [0, 0, 0, -1]
          ),
        },
      ],
    };
  });
  const headerStylez = useAnimatedStyle(() => {
    return {
      transform: [
        {
          perspective: _itemSize * 5,
        },
        {
          translateY: interpolate(
            headerAnim.value,
            [0, _itemSize],
            [0, -_itemSize / 2],
            Extrapolation.CLAMP
          ),
        },
        {
          rotateX: `${interpolate(
            headerAnim.value,
            [0, _itemSize],
            [0, 90],
            Extrapolation.CLAMP
          )}deg`,
        },
      ],
      opacity: interpolate(
        headerAnim.value,
        [0, _itemSize / 2, _itemSize],
        [1, 1, 0],
        Extrapolation.CLAMP
      ),
    };
  });
  // React.useEffect(() => {
  //   headerAnim.value = withRepeat(withTiming(_itemSize, {duration: 2000}), Infinity, true)
  // })

  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[styles.header, { position: "absolute", zIndex: 1 }]}
        onLayout={(ev) => {
          if (headerHeight.value === ev.nativeEvent.layout.height) {
            return;
          }
          headerHeight.value = withTiming(ev.nativeEvent.layout.height, {
            duration: 0,
          });
        }}>
        <Animated.View
          style={[
            { padding: _spacing, marginBottom: _spacing },
            balanceStylez,
          ]}>
          <Text style={[styles.regular, { fontSize: 42, color: _colors.text }]}>
            {faker.finance.amount(500, 8500, 0, "$")}
          </Text>
          <Text style={[styles.regular, { color: _colors.text, opacity: 0.6 }]}>
            Total Balance
          </Text>
        </Animated.View>
        <Animated.FlatList
          data={_headerData}
          keyExtractor={(item) => item.key}
          horizontal
          style={[{ flexGrow: 0 }, headerStylez]}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => {
            return (
              <View
                style={{
                  padding: _spacing * 2,
                  backgroundColor: `${_colors.text}${index !== 0 ? 11 : 22}`,
                  marginRight: _spacing,
                  width: index === 0 ? _itemSize : _otherSize,
                  height: _itemSize,
                  borderRadius: 12,
                }}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: _colors.text, fontSize: 24 }]}>
                    {item.emoji}
                  </Text>
                </View>
                <Text
                  style={[styles.bold, { fontSize: 24, color: _colors.text }]}>
                  {item.amount}
                </Text>
                <Text
                  style={[
                    styles.regular,
                    { fontSize: 16, opacity: 0.6, color: _colors.text },
                  ]}>
                  {item.department}
                </Text>
              </View>
            );
          }}
        />
      </View>
      <AnimatedSectionList
        sections={_data}
        keyExtractor={(item) => item.key}
        onScroll={onScroll}
        ListHeaderComponent={<Animated.View style={dummyHeaderStylez} />}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ backgroundColor: `${_colors.bg}cc` }}>
            <Text
              style={[
                styles.bold,
                {
                  fontSize: 24,
                  color: _colors.text,
                  padding: _spacing,
                  marginVertical: _spacing,
                },
              ]}>
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          return (
            <View
              style={{
                padding: _spacing,
                marginBottom: _spacing,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 52,
                  backgroundColor: `${_colors.text}16`,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
              </View>
              <View style={{ paddingHorizontal: _spacing }}>
                <Text
                  style={[
                    styles.bold,
                    {
                      color: _colors.text,
                      fontSize: 16,
                      marginBottom: _spacing / 2,
                    },
                  ]}>
                  {item.productName}
                </Text>
                <Text
                  style={[
                    styles.regular,
                    { color: _colors.text, opacity: 0.6 },
                  ]}>
                  {item.department}
                </Text>
              </View>
              <View
                style={{
                  flexGrow: 1,
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}>
                <Text
                  style={[
                    styles.bold,
                    {
                      color:
                        item.type === "inbound" ? "turquoise" : _colors.text,
                      fontSize: 16,
                    },
                  ]}>
                  {item.amount}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  regular: {
    fontFamily: "LatoRegular",
  },
  bold: {
    fontFamily: "LatoBold",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingTop: Constants.statusBarHeight,
    backgroundColor: _colors.bg,
    padding: _spacing,
  },
  header: {
    top: Constants.statusBarHeight,
    left: _spacing,
  },
});
