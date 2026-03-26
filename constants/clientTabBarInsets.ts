/**
 * Shared bottom offset for client floating tab bar and booking step bar (absolute `bottom`).
 * Increase to lift the whole bar higher above the screen edge / home indicator.
 */
export const CLIENT_TAB_BAR_EXTRA_BOTTOM = 18;

export function getClientTabBarBottomInset(safeAreaBottom: number): number {
  const base = safeAreaBottom > 0 ? safeAreaBottom + 2 : 8;
  return base + CLIENT_TAB_BAR_EXTRA_BOTTOM;
}
