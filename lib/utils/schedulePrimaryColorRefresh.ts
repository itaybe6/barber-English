/** Mirrors post-save refresh behavior used across admin color flows. */
export function schedulePrimaryColorRefresh(params: {
  triggerColorUpdate: () => void;
  forceAppRefresh: () => void;
}): void {
  const { triggerColorUpdate, forceAppRefresh } = params;
  triggerColorUpdate();
  forceAppRefresh();
  setTimeout(() => triggerColorUpdate(), 100);
  setTimeout(() => triggerColorUpdate(), 300);
  setTimeout(() => triggerColorUpdate(), 600);
  setTimeout(() => triggerColorUpdate(), 1000);
  setTimeout(() => forceAppRefresh(), 200);
  setTimeout(() => forceAppRefresh(), 800);
}
