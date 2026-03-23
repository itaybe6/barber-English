import React, { FC } from "react";
import { FlatList, View, Text } from "react-native";
import { Search as SearchIcon } from "lucide-react-native";
import { TabScreenContainer } from "../components/tab-screen-container";

export const Search: FC = () => {
  const _renderListItem = ({ item }: { item: string }) => (
    <View key={item} className="items-center justify-center" />
  );

  return (
    <TabScreenContainer>
      <FlatList
        data={[]}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={_renderListItem}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={() => {
          return (
            <View className="items-center mt-[90]">
              <SearchIcon size={30} color="#CCCCCC" strokeWidth={3} />
              <Text className="text-lg text-gray-700 mt-4">No recent searches</Text>
            </View>
          );
        }}
      />
    </TabScreenContainer>
  );
};
