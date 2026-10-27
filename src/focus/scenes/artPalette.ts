// Black-figure palette for the Sisyphus scene (ROUND3_ART §1). Flat colours mixed in OKLab. Pure.
export const INK = {
  black: '#15100D',     // figure, boulder, main slope (warm near-black)
  ochre: '#CF9450',     // primary linework on black
  ochreDeep: '#B9783C', // cloud swirls on cream
  cream: '#F1E4C4',     // stars, sun, highlights on black
  salmon: '#E3936A',    // sparse accent flecks, sun ring 2
} as const;

export interface ArtStop {
  sky: string; band: string; far: string; mid: string; near: string; cloudFront: string; cloudBack: string; sun: string;
}

export const ART_STOPS: Array<{ p: number; name: string; v: ArtStop }> = [
  { p: 0.00, name: 'dawn', v: { sky: '#C46A35', band: '#D8874C', far: '#EBCB97', mid: '#D49A5A', near: '#7A3A1B', cloudFront: '#F4E6C6', cloudBack: '#DDB37A', sun: '#F6E7C4' } },
  { p: 0.45, name: 'day', v: { sky: '#B85A2A', band: '#C9703A', far: '#E6C590', mid: '#C98A4C', near: '#6E3218', cloudFront: '#F1E2BF', cloudBack: '#D9A35E', sun: '#F4E3BE' } },
  { p: 0.80, name: 'ember', v: { sky: '#9A3F1E', band: '#B4542A', far: '#D9A86E', mid: '#B26F3A', near: '#5A2512', cloudFront: '#EBCB9F', cloudBack: '#C98A50', sun: '#F2D7A6' } },
  { p: 0.93, name: 'last-light', v: { sky: '#6E2E22', band: '#9A4426', far: '#B88A68', mid: '#8A5236', near: '#3E1B12', cloudFront: '#D9B596', cloudBack: '#A86E4E', sun: '#EFC890' } },
  { p: 1.00, name: 'dusk', v: { sky: '#2E2B4D', band: '#5A3448', far: '#6E6280', mid: '#4E4566', near: '#2A2340', cloudFront: '#A89AA8', cloudBack: '#6F6482', sun: '#F1E4C4' } },
];
export const NIGHT: ArtStop = { sky: '#1F1F38', band: '#2B2A48', far: '#4A4566', mid: '#373352', near: '#211D33', cloudFront: '#7E7690', cloudBack: '#544D6C', sun: '#F1E4C4' };
export const PREDAWN_BAND = '#7A3A2C';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Line widths in CSS px, scaled with the figure (§1.2). */
export const LW = (Hpx: number) => ({
  contour: clamp(0.0075 * Hpx, 1.25, 2.25),
  incise: clamp(0.0070 * Hpx, 1.25, 2.0),
  fleck: clamp(0.0070 * Hpx, 1.25, 2.0),
  swirl: 1.75,
  ring: 1.5,
});

// ---------- OKLab ----------
type Lab = [number, number, number];
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(c: [number, number, number]): string {
  return '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function toLab(h: string): Lab {
  const [r, g, b] = hexToRgb(h).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromLab([L, A, B]: Lab): string {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
  const rgb: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return rgbToHex(rgb.map((v) => toSrgb(clamp(v, 0, 1))) as [number, number, number]);
}
/** Mix two hex colours in OKLab. */
export function mixOk(a: string, b: string, k: number): string {
  const x = toLab(a), y = toLab(b);
  return fromLab([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

const KEYS: Array<keyof ArtStop> = ['sky', 'band', 'far', 'mid', 'near', 'cloudFront', 'cloudBack', 'sun'];
export function mixStop(a: ArtStop, b: ArtStop, k: number): ArtStop {
  const out = {} as ArtStop;
  for (const key of KEYS) out[key] = mixOk(a[key], b[key], k);
  return out;
}

/** Palette at artP (focus: 0.86·p; summit beat 0.86 → 1). Smoothstep between neighbouring stops. */
export function artStop(p: number): ArtStop {
  const q = clamp(p, 0, 1);
  for (let i = 0; i < ART_STOPS.length - 1; i++) {
    const a = ART_STOPS[i], b = ART_STOPS[i + 1];
    if (q <= b.p) { const k = (q - a.p) / (b.p - a.p); return mixStop(a.v, b.v, k * k * (3 - 2 * k)); }
  }
  return ART_STOPS[ART_STOPS.length - 1].v;
}

/** Paused look: each colour 35% toward its own OKLab lightness (grey), darkened 8%. */
export function pausedStop(s: ArtStop, k = 1): ArtStop {
  const out = {} as ArtStop;
  for (const key of KEYS) {
    const lab = toLab(s[key]);
    const m = 0.35 * k, d = 1 - 0.08 * k;
    out[key] = fromLab([lab[0] * d, lab[1] * (1 - m), lab[2] * (1 - m)]);
  }
  return out;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const L = (h: string) => { const [r, g, bl] = hexToRgb(h).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
