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
}: TabsProps) {
  const isRTL = I18nManager.isRTL;

  // In RTL: render tabs right-to-left so "first" tab stays on the left visually
  const displayData = isRTL ? [...data].reverse() : data;
  const displaySelected = isRTL ? data.length - 1 - selectedIndex : selectedIndex;

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
        const realIndex = isRTL ? data.length - 1 - displayIndex : displayIndex;
        const isSelected = displayIndex === displaySelected;

        return (
          <MotiView
            layout={layoutAnimation}
            key={`${item.icon}-${displayIndex}`}
            animate={{
              backgroundColor: isSelected ? activeBackgroundColor : inactiveBackgroundColor,
            }}
            style={{
              flex: isSelected ? 2 : 1,
              borderRadius: 14,
              overflow: 'hidden',
              minHeight: 48,
            }}
          >
            <Pressable
              style={{
                flex: 1,
                flexDirection: 'row',
                gap: _spacing,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: _spacing * 2,
                paddingVertical: _spacing * 2,
              }}
              onPress={() => onChange?.(realIndex)}
            >
              <AnimatedIcon
                name={item.icon}
                size={20}
                // We avoid animating initial entering via LayoutAnimationConfig below
                animate={{ color: isSelected ? activeColor : inactiveColor }}
              />
              <LayoutAnimationConfig skipEntering>
                {isSelected && (
                  <Animated.Text
                    entering={entering}
                    exiting={exiting}
                    style={{
                      color: activeColor,
                      fontWeight: '700',
                      fontSize: 14,
                      letterSpacing: -0.3,
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
