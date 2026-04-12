import React, { useMemo } from 'react';
import { View, Platform, I18nManager, type ViewProps } from 'react-native';
import { Marquee } from '@animatereactnative/marquee';
import { manicureImages } from '@/src/constants/manicureImages';
import { ManicureMarqueeTile } from '@/components/ManicureMarqueeTile';

const HERO_MARQUEE_TRANSLATE_Y = 0;
const MARQUEE_TILT_Z = I18nManager.isRTL ? '3.2deg' : '-3.2deg';
const MARQUEE_PLANE_SCALE = 1.075;
const MARQUEE_POST_TRANSFORM_NUDGE_Y = 48;

const HERO_SPACING = Platform.OS === 'web' ? 12 : 6;

/** Same resolution rules as `app/(tabs)/index.tsx` — `layoutWidth` is usually screen width or preview card width. */
function heroItemSize(layoutWidth: number) {
  return Platform.OS === 'web' ? layoutWidth * 0.255 : layoutWidth * 0.35;
}

/**
 * Hero image URLs: tenant https uploads only when at least one exists; otherwise bundled stock
 * so the hero is never empty. We do **not** append stock after uploads — that mixed defaults into the animation.
 */
export function resolveAdminHeroMarqueeImages(raw: string[]): string[] {
  const web = raw.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
  const stock = [...manicureImages];
  if (web.length === 0) return stock;
  return web;
}

/**
 * Split URLs across the 3 horizontal marquee rows (round-robin) so each row gets a similar mix.
 */
export function distributeHeroMarqueeUrlsToRows(urls: string[]): string[][] {
  const cols: string[][] = [[], [], []];
  if (urls.length === 0) return cols;
  for (let i = 0; i < urls.length; i++) {
    cols[i % 3]!.push(urls[i]!);
  }
  const fallback = urls[0]!;
  for (let c = 0; c < 3; c++) {
    if (cols[c]!.length === 0) cols[c]!.push(fallback);
  }
  return cols;
}

export interface AdminHomeHeroMarqueeProps {
  /** Raw `home_hero_images` list from profile or editor state */
  customImageUrls: string[];
  /** Viewport the marquee is clipped to (full admin host or embedded preview). */
  layoutWidth: number;
  layoutHeight: number;
  /** Distinct prefix for `Marquee` / tile keys when multiple instances mount */
  keyPrefix: string;
  /** Admin tab uses interaction; settings preview should not steal list scroll */
  marqueePointerEvents?: ViewProps['pointerEvents'];
}

export const AdminHomeHeroMarquee = React.memo(function AdminHomeHeroMarquee({
  customImageUrls,
  layoutWidth: W,
  layoutHeight: H,
  keyPrefix,
  marqueePointerEvents = 'auto',
}: AdminHomeHeroMarqueeProps) {
  const images = useMemo(() => resolveAdminHeroMarqueeImages(customImageUrls), [customImageUrls]);

  const HERO_ITEM_SIZE = heroItemSize(W);

  const columns = useMemo(() => distributeHeroMarqueeUrlsToRows(images), [images]);

  const rootStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      left: -W * 0.18,
      right: -W * 0.18,
      top: -H * 0.02,
      bottom: -H * 0.07,
      overflow: 'hidden' as const,
    }),
    [W, H]
  );

  if (W <= 0 || H <= 0) return null;

  return (
    <View style={rootStyle} pointerEvents="box-none">
      <View
        style={{
          flex: 1,
          gap: HERO_SPACING,
          transform: [
            { perspective: 1000 },
            { rotateZ: MARQUEE_TILT_Z },
            { scale: MARQUEE_PLANE_SCALE },
            { translateY: HERO_MARQUEE_TRANSLATE_Y + MARQUEE_POST_TRANSFORM_NUDGE_Y },
          ],
        }}
        pointerEvents={marqueePointerEvents}
      >
        {columns.map((column, columnIndex) => (
          <Marquee
            key={`${keyPrefix}-col-${columnIndex}`}
            speed={Platform.OS === 'web' ? 1 : 0.25}
            spacing={HERO_SPACING}
            reverse={columnIndex % 2 !== 0}
          >
            <View style={{ flexDirection: 'row', gap: HERO_SPACING }}>
              {column.map((image, index) => (
                <ManicureMarqueeTile
                  key={`${keyPrefix}-tile-${columnIndex}-${index}-${image}`}
                  uri={image}
                  itemSize={HERO_ITEM_SIZE}
                  borderRadius={HERO_SPACING}
                  columnIndex={columnIndex}
                  index={index}
                />
              ))}
            </View>
          </Marquee>
        ))}
      </View>
    </View>
  );
});
