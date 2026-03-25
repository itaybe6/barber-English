import React from "react";
import type { ScrollView } from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-aware-scroll-view";

export type KeyboardAwareScreenScrollProps = KeyboardAwareScrollViewProps;

const DEFAULT_EXTRA_SCROLL = 36;

/**
 * App-wide keyboard-aware vertical scroll. Prefer this over ScrollView + KeyboardAvoidingView
 * on screens/modals with TextInputs (enableOnAndroid + extraScrollHeight for RTL/hebrew layouts).
 */
export const KeyboardAwareScreenScroll = React.forwardRef<
  ScrollView,
  KeyboardAwareScreenScrollProps
>(function KeyboardAwareScreenScroll(
  {
    enableOnAndroid = true,
    extraScrollHeight = DEFAULT_EXTRA_SCROLL,
    extraHeight = 12,
    keyboardShouldPersistTaps = "handled",
    enableAutomaticScroll = true,
    enableResetScrollToCoords = false,
    ...rest
  },
  ref
) {
  return (
    <KeyboardAwareScrollView
      innerRef={(r) => {
        if (typeof ref === "function") {
          ref(r as ScrollView);
        } else if (ref) {
          (ref as React.MutableRefObject<ScrollView | null>).current = r as ScrollView;
        }
      }}
      enableOnAndroid={enableOnAndroid}
      extraScrollHeight={extraScrollHeight}
      extraHeight={extraHeight}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      enableAutomaticScroll={enableAutomaticScroll}
      enableResetScrollToCoords={enableResetScrollToCoords}
      {...rest}
    />
  );
});
