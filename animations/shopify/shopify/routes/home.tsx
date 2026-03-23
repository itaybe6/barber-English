import { FlatList, View } from "react-native";
import React from "react";
import { TabScreenContainer } from "../components/tab-screen-container";

export const Home = () => {
  return (
    <TabScreenContainer>
      <FlatList
        data={[]}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={() => null}
        ListEmptyComponent={() => {
          return (
            <View className="flex-1">
              <View className="h-[300] mx-5 bg-gray-200 mt-5 rounded-[20]" />
              <View className="h-[50] mx-5 bg-gray-200 mt-4 rounded-[20]" />
              <View className="h-[50] mx-5 bg-gray-200 mt-4 rounded-[20]" />
            </View>
          );
        }}
      />
    </TabScreenContainer>
  );
};
