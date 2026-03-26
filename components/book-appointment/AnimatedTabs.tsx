// Inspiration: https://x.com/madebydaybreak/status/1823013129598435499
import React from 'react';
import { I18nManager, Pressable, ViewStyle } from 'react-native';
import { icons } from 'lucide-react-native';
import { MotiProps, MotiView } from 'moti';
import { motifySvg } from 'moti/svg';
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
} from 'react-native-reanimated';

// Types
export type LucideIconName = keyof typeof icons;
export type TabsPropsData = { icon: LucideIconName; label: string };
export type TabsProps = {
  data: TabsPropsData[];
  selectedIndex?: number;
  onChange?: (index: number) => void;
  activeColor?: string;
  inactiveColor?: string;
  activeBackgroundColor?: string;
  inactiveBackgroundColor?: string;
  style?: ViewStyle;
  /** Icon on top, animated label below (e.g. booking step bar) */
  stacked?: boolean;
  /**
   * When true (default), tab order is mirrored in RTL. Set false for a fixed left-to-right order
   * (e.g. booking: barber → service → date → time).
   */
  rtlMirror?: boolean;
};
type AnimatedIconProps = {
  name: LucideIconName;
  color?: string;
  size?: number;
} & MotiProps;

// Constants
const _spacing = 6;
const layoutAnimation = LinearTransition.springify().damping(18).stiffness(200);
const entering = FadeIn.springify().damping(18).stiffness(220);
const exiting = FadeOut.springify().damping(18).stiffness(220);

function AnimatedIcon({ name, color = '#000', size = 20, ...rest }: AnimatedIconProps) {
  // @ts-ignore
  const LucideIcon = motifySvg(icons[name])();
  return <LucideIcon color={color} size={size} {...rest} />;
}

export default function AnimatedTabs({
  onChange,
  selectedIndex = 0,
  data,
  activeColor = '#fff',
  inactiveColor = '#999',
  activeBackgroundColor = '#111',
  inactiveBackgroundColor = '#ddd',
  style,
  stacked = false,
  rtlMirror = true,
}: TabsProps) {
  const isRTL = I18nManager.isRTL;
  const mirror = rtlMirror && isRTL;

  // In RTL (when rtlMirror): render tabs right-to-left so "first" tab stays on the start edge
  const displayData = mirror ? [...data].reverse() : data;
  const displaySelected = mirror ? data.length - 1 - selectedIndex : selectedIndex;

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          gap: _spacing,
          width: '100%',
        },
        style,
      ]}
      layout={layoutAnimation}
    >
      {displayData.map((item, displayIndex) => {
        // Map display index back to real index for onChange
        const realIndex = mirror ? data.length - 1 - displayIndex : displayIndex;
        const isSelected = displayIndex === displaySelected;

        const labelFontSize = stacked ? 10 : 14;
        const labelWeight = stacked ? ('600' as const) : ('700' as const);
        const iconSize = stacked ? 18 : 20;
        const stackedMinH = stacked ? 54 : 48;
        const stackedRadius = stacked ? 12 : 14;
        const stackedGap = stacked ? 2 : _spacing;
        const stackedPadH = stacked ? _spacing : _spacing * 2;
        const stackedPadV = stacked ? 6 : _spacing * 2;

        return (
          <MotiView
            layout={layoutAnimation}
            key={`${item.icon}-${displayIndex}`}
            style={{
              flex: isSelected ? 2 : 1,
              borderRadius: stackedRadius,
              overflow: 'hidden',
              minHeight: stackedMinH,
              // Apply on `style`, not `animate` — Moti/Reanimated often fails to paint
              // `activeBackgroundColor` when animating from `transparent` (booking step bar).
              backgroundColor: isSelected ? activeBackgroundColor : inactiveBackgroundColor,
            }}
          >
            <Pressable
              style={{
                flex: 1,
                flexDirection: stacked ? 'column' : 'row',
                gap: stackedGap,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: stackedPadH,
                paddingVertical: stackedPadV,
              }}
              onPress={() => onChange?.(realIndex)}
            >
              <AnimatedIcon
                name={item.icon}
                size={iconSize}
                animate={{ color: isSelected ? activeColor : inactiveColor }}
              />
              <LayoutAnimationConfig skipEntering>
                {isSelected && (
                  <Animated.Text
                    entering={entering}
                    exiting={exiting}
                    style={{
                      color: activeColor,
                      fontWeight: labelWeight,
                      fontSize: labelFontSize,
                      letterSpacing: stacked ? -0.2 : -0.3,
                      textAlign: 'center',
                    }}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Animated.Text>
                )}
              </LayoutAnimationConfig>
            </Pressable>
          </MotiView>
        );
      })}

    </Animated.View>
  );
}
