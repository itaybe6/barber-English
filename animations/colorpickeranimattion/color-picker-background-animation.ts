// colorsapp-color-picker-background-animation 🔽

/**
 * Animation/gesture sizing shared across the color picker.
 * Keep these centralized so Panel and Slider stay visually in sync.
 */
export const sharedConfigs = {
  // Size of the draggable thumb inside the color panel (ring in our case).
  // Chosen to be large enough for touch accuracy while not obscuring color.
  thumbPanelSize: 24,
  // Size of the slider thumb — matches panel thumb for consistent feel.
  thumbSliderSize: 24,
  // Track thickness for the hue slider. Thinner feels precise; thicker feels heavy.
  // 4px balances precision with visibility and reduces overdraw on low-end devices.
  sliderThickness: 4,
};

// colorsapp-color-picker-background-animation 🔼
