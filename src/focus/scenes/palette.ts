// Sky + land palette for the focus scenes (FOCUS_DESIGN §3.3 + STRUGGLEMORE §3.3). Pure.
export type RGB = [number, number, number]; // sRGB, 0..1

export interface Palette {
  zenith: RGB; horizon: RGB; sun: RGB; ridgeFar: RGB; ridgeNear: RGB; water: RGB;
  rockLit: RGB; rockShade: RGB; figure: RGB; boulderBase: RGB;
}

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Mix in linear light, return sRGB. */
export function mixRGB(a: RGB, b: RGB, k: number): RGB {
  return [0, 1, 2].map((i) => clamp01(toSrgb(toLin(a[i]) + (toLin(b[i]) - toLin(a[i])) * k))) as RGB;
}

export function lum(c: RGB): number {
  return 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
}

const SEPIA_DARK = hex('#20160e');
const SEPIA_LIGHT = hex('#f2dcb8');
/** Sepia grade: mix(c, sepia(lum(c)), 0.25). */
export function grade(c: RGB, amount = 0.25): RGB {
  const l = Math.pow(lum(c), 1 / 2.2);
  const sep = mixRGB(SEPIA_DARK, SEPIA_LIGHT, l);
  return mixRGB(c, sep, amount);
}

export function css(c: RGB, a = 1): string {
  const r = Math.round(c[0] * 255), g = Math.round(c[1] * 255), b = Math.round(c[2] * 255);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

export function lighten(c: RGB, k: number): RGB { return mixRGB(c, [1, 1, 1], k); }
export function darken(c: RGB, k: number): RGB { return mixRGB(c, [0, 0, 0], k); }

type Row = [string, string, string, string, string, string];
const ROCK = {
  dawn: ['#5a4a52', '#1e1820', '#120d10', '#6a5a58'],
  noon: ['#8a7258', '#2e241c', '#18110c', '#9a8468'],
  golden: ['#a2744a', '#2c1e16', '#1a110b', '#b08660'],
  dusk: ['#5a3e3a', '#1a1216', '#0f0a0c', '#6e5048'],
  night: ['#2a2430', '#0e0b10', '#08070a', '#3a3440'],
};
function rock(a: keyof typeof ROCK, b: keyof typeof ROCK, k: number): [RGB, RGB, RGB, RGB] {
  return [0, 1, 2, 3].map((i) => mixRGB(hex(ROCK[a][i]), hex(ROCK[b][i]), k)) as [RGB, RGB, RGB, RGB];
}

function make(row: Row, r: [RGB, RGB, RGB, RGB]): Palette {
  const [zenith, horizon, sun, ridgeFar, ridgeNear, water] = row.map(hex);
  return { zenith, horizon, sun, ridgeFar, ridgeNear, water, rockLit: r[0], rockShade: r[1], figure: r[2], boulderBase: r[3] };
}

/** Daylight keyframes, p = progress through the "day". */
export const STOPS: Array<{ p: number; name: string; pal: Palette }> = [
  { p: 0.0, name: 'dawn', pal: make(['#1d2340', '#c88a8f', '#ffc9a3', '#4a3f5c', '#1a1726', '#2a2540'], rock('dawn', 'dawn', 0)) },
  { p: 0.12, name: 'sunrise', pal: make(['#2b3a66', '#e6a98a', '#ffe0b8', '#55506e', '#1c1c2b', '#2c3350'], rock('dawn', 'noon', 0.35)) },
  { p: 0.30, name: 'morning', pal: make(['#2f5687', '#9fc0d6', '#fff4e0', '#5d6f86', '#202836', '#2b4560'], rock('dawn', 'noon', 0.8)) },
  { p: 0.50, name: 'noon', pal: make(['#2c5a8f', '#a9c7da', '#fffaf0', '#647891', '#222c3a', '#2d4a66'], rock('noon', 'noon', 0)) },
  { p: 0.72, name: 'afternoon', pal: make(['#2d4f80', '#c9c0a8', '#ffe9c2', '#6a6c7c', '#252633', '#33415a'], rock('noon', 'golden', 0.6)) },
  { p: 0.86, name: 'golden', pal: make(['#2b3d6b', '#e8a868', '#ffc27a', '#6b5566', '#241c27', '#3a3346'], rock('golden', 'golden', 0)) },
  { p: 0.96, name: 'sunset', pal: make(['#24284f', '#e07a52', '#ff9a5c', '#5a3f55', '#1d1521', '#33263a'], rock('golden', 'dusk', 0.5)) },
  { p: 1.0, name: 'dusk', pal: make(['#141832', '#8a4a6e', '#ff7a4a', '#2e2640', '#110e18', '#1c1a2c'], rock('dusk', 'dusk', 0)) },
];
export const NIGHT: Palette = make(['#0b0e1f', '#1d2140', '#e8e6f0', '#1a1a2c', '#0b0a12', '#10132a'], rock('night', 'night', 0));
export const PREDAWN: Palette = make(['#121631', '#5a4a6e', '#ffc9a3', '#2a2440', '#0f0d16', '#171a32'], rock('night', 'dawn', 0.5));

const KEYS = Object.keys(STOPS[0].pal) as Array<keyof Palette>;
const smooth = (k: number) => k * k * (3 - 2 * k);

export function mixPalette(a: Palette, b: Palette, k: number): Palette {
  const out = {} as Palette;
  for (const key of KEYS) out[key] = mixRGB(a[key], b[key], k);
  return out;
}

/** Blend the neighbouring stops with smoothstep in linear light. */
export function palette(p: number): Palette {
  const q = clamp01(p);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (q <= b.p) return mixPalette(a.pal, b.pal, smooth((q - a.p) / (b.p - a.p)));
  }
  return STOPS[STOPS.length - 1].pal;
}

export function gradePalette(p: Palette, amount = 0.25): Palette {
  const out = {} as Palette;
  for (const key of KEYS) out[key] = grade(p[key], amount);
  return out;
}

/** Desaturate toward luminance by k (pause look). */
export function desaturate(p: Palette, k: number, darkenBy = 0): Palette {
  const out = {} as Palette;
  for (const key of KEYS) {
    const c = p[key];
    const l = Math.pow(lum(c), 1 / 2.2);
    out[key] = darken(mixRGB(c, [l, l, l], k), darkenBy);
  }
  return out;
}
