import { FlatList, View } from "react-native";
import React from "react";
import { TabScreenContainer } from "../components/tab-screen-container";

export const Profile = () => {
  return (
    <TabScreenContainer>
      <FlatList
        data={[]}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={() => null}
        ListEmptyComponent={() => {
          return (
            <View className="flex-1 mx-5">
              <View className="h-[130] w-[130] bg-gray-200 mt-5 rounded-full" />
              <View className="h-[10] w-1/5 bg-gray-200 mt-10 rounded-[20]" />
              <View className="h-[20] w-4/5 bg-gray-200 mt-1 rounded-[20]" />
              <View className="h-[10] w-1/5 bg-gray-200 mt-10 rounded-[20]" />
              <View className="h-[20] w-4/5 bg-gray-200 mt-1 rounded-[20]" />
              <View className="h-[10] w-1/5 bg-gray-200 mt-10 rounded-[20]" />
              <View className="h-[20] w-4/5 bg-gray-200 mt-1 rounded-[20]" />
              <View className="h-[50] w-3/5 bg-gray-200 self-center mt-16 rounded-[20]" />
            </View>
          );
        }}
      />
    </TabScreenContainer>
  );
};
