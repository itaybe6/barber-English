/**
 * Shared bottom offset for client floating tab bar and booking step bar (absolute `bottom`).
 * Increase to lift the whole bar higher above the screen edge / home indicator.
 */
export const CLIENT_TAB_BAR_EXTRA_BOTTOM = 18;

/** Matches `ClientFloatingTabBar` capsule (icons only, plus inside bar). */
export const CLIENT_FLOATING_TAB_BAR_HEIGHT = 56;

export function getClientTabBarBottomInset(safeAreaBottom: number): number {
  const base = safeAreaBottom > 0 ? safeAreaBottom + 2 : 8;
  return base + CLIENT_TAB_BAR_EXTRA_BOTTOM;
}

/**
 * ScrollView `contentContainerStyle.paddingBottom` so footer CTAs stay above the floating tab bar.
 * SafeAreaView already applies `safeAreaBottom`; this covers the band where the bar overlaps the screen.
 */
export function getScrollContentPaddingBottomForFloatingClientTabBar(safeAreaBottom: number): number {
  const tabBottomOffset = getClientTabBarBottomInset(safeAreaBottom);
  const clearBar = tabBottomOffset + CLIENT_FLOATING_TAB_BAR_HEIGHT - safeAreaBottom + 16;
  return Math.max(40, clearBar);
}
