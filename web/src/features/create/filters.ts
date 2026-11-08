/**
 * Photo filters. Each one is a CSS filter string (used as `filter` on the preview and as `ctx.filter`
 * on the canvas when the photo is exported) plus an optional color wash blended on top. CSS and
 * canvas follow the same blending rules, so the posted photo looks like the preview.
 */
export type FilterName = 'Original' | 'Glow' | 'Dusk' | 'Mono' | 'Film' | 'Vivid' | 'Fade' | 'Cool' | 'Warm'

/** Blend modes that both CSS (mix-blend-mode) and canvas (globalCompositeOperation) understand. */
export type Blend = 'soft-light' | 'screen' | 'multiply'

export interface Filter {
  name: FilterName
  css: string
  tint?: { color: string; blend: Blend; opacity: number }
}

export const FILTERS: Filter[] = [
  { name: 'Original', css: 'none' },
  { name: 'Glow', css: 'brightness(1.06) contrast(0.95) saturate(1.2)', tint: { color: '#ffc6e2', blend: 'soft-light', opacity: 0.45 } },
  { name: 'Dusk', css: 'contrast(1.05) saturate(1.15) brightness(0.96)', tint: { color: '#7b5cff', blend: 'soft-light', opacity: 0.4 } },
  { name: 'Mono', css: 'grayscale(1) contrast(1.12) brightness(1.03)' },
  { name: 'Film', css: 'sepia(0.25) contrast(1.08) saturate(0.85) brightness(1.02)', tint: { color: '#ffd59e', blend: 'soft-light', opacity: 0.25 } },
  { name: 'Vivid', css: 'saturate(1.55) contrast(1.12)' },
  { name: 'Fade', css: 'contrast(0.82) brightness(1.08) saturate(0.8)', tint: { color: '#e9e4f5', blend: 'screen', opacity: 0.18 } },
  { name: 'Cool', css: 'saturate(1.05) brightness(1.02)', tint: { color: '#5bb8ff', blend: 'soft-light', opacity: 0.45 } },
  { name: 'Warm', css: 'saturate(1.12) brightness(1.03)', tint: { color: '#ffb35c', blend: 'soft-light', opacity: 0.45 } },
]

export function getFilter(name: FilterName): Filter {
  return FILTERS.find((filter) => filter.name === name) ?? FILTERS[0]
}
