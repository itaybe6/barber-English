import { createContext, FC, PropsWithChildren, useContext } from "react";
import { SharedValue, useSharedValue } from "react-native-reanimated";

type ContextValue = {
  menuProgress: SharedValue<number>;
};

const MenuContext = createContext<ContextValue>({} as ContextValue);

export const MenuProvider: FC<PropsWithChildren> = ({ children }) => {
  const menuProgress = useSharedValue(0);
  return <MenuContext.Provider value={{ menuProgress }}>{children}</MenuContext.Provider>;
};

export const useMenu = () => {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useMenu must be used within a MenuProvider");
  return context;
};
