/**
 * Shared bottom offset for client floating tab bar — aligned with `AdminFloatingTabBar` (`insets.bottom + 12`).
 */
export const CLIENT_TAB_BAR_BOTTOM_OFFSET_ABOVE_SAFE = 12;

/** Approximate height of one admin-style pill row (border + padding + TabButton + icon). */
export const CLIENT_FLOATING_TAB_BAR_HEIGHT = 54;

export function getClientTabBarBottomInset(safeAreaBottom: number): number {
  return safeAreaBottom + CLIENT_TAB_BAR_BOTTOM_OFFSET_ABOVE_SAFE;
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
