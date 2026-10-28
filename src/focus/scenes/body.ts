// Round 5 Sisyphus body (ROUND5_SISYPHUS §2.1): an 8-head heroic canon. Pure numbers; world units are H (standing
// height = 1), y up. Part outlines and linework live in figureArt.ts; the walk and poses read only these lengths.

export const BODY = {
  head: 0.125,
  neck: 0.035,
  neckW: 0.060,
  torso: 0.310,
  thigh: 0.245,
  shin: 0.240,
  /** Foot (sole-local, origin = ball): ankle 0.075 behind the ball and 0.035 above the sole. */
  ankleBack: 0.075,
  ankleH: 0.035,
  heelBack: 0.100,
  toe: 0.040,
  upperArm: 0.190,
  foreArm: 0.160,
  /** Hand (local frame on the stone: origin = palm contact on the surface, +x to the fingertips, +y outward). */
  wristLocal: { x: -0.045, y: 0.022 },
  palmLocal: { x: 0, y: 0.018 },
  /** The stone: its diameter equals his height. */
  R: 0.50,
} as const;

export const LEG_CHAIN = BODY.thigh + BODY.shin;
export const ARM_CHAIN = BODY.upperArm + BODY.foreArm;

/** Shoulder-to-wrist distance for an elbow interior angle (deg). */
export function armSpan(elbowDeg: number): number {
  const a = BODY.upperArm, b = BODY.foreArm, c = Math.cos((elbowDeg * Math.PI) / 180);
  return Math.sqrt(a * a + b * b - 2 * a * b * c);
}

// ---------- outlines (ROUND5_SISYPHUS §2.2) ----------
/** An outline anchor (u, v) in H; `c` marks a corner (zero handles). */
export type Anchor = [number, number, 1?];

/** Torso, root = hip joint: u along the spine (H), +v = front. Front going up, then the back coming down. */
export const TORSO: Anchor[] = [
  [0.000, 0.030, 1], [0.060, 0.056], [0.120, 0.050], [0.170, 0.062], [0.215, 0.076], [0.270, 0.068], [0.300, 0.050], [0.335, 0.026, 1],
  [0.345, -0.030, 1], [0.305, -0.062], [0.240, -0.072], [0.150, -0.050], [0.075, -0.050], [0.005, -0.074], [-0.045, -0.046], [-0.040, 0.022, 1],
];
/** Front stations the breath swells (u 0.15–0.30). */
export const BREATH_U: [number, number] = [0.15, 0.30];

/** Head, origin = cranium centre: u = the head's up-axis, +v = the face. */
export const HEAD: Anchor[] = [
  [0.062, 0.000], [0.044, 0.044], [0.018, 0.058, 1], [0.008, 0.055], [-0.012, 0.073, 1], [-0.020, 0.058], [-0.027, 0.060],
  [-0.031, 0.054, 1], [-0.036, 0.063], [-0.090, 0.046, 1], [-0.060, 0.002], [-0.030, -0.026], [-0.046, -0.048], [0.004, -0.072], [0.046, -0.046],
];
/** The skull line the hair mass follows (hairline → crown → nape), overhung by 0.006 with 7 curl bumps. */
export const SKULL: Array<[number, number]> = [[0.040, 0.034], [0.056, 0.018], [0.062, 0.000], [0.055, -0.026], [0.046, -0.046], [0.024, -0.064], [0.004, -0.074], [-0.024, -0.072], [-0.050, -0.062], [-0.072, -0.058]];

/** Limb stations u: (+v half-width, −v half-width), joined by the same Catmull–Rom rule; round caps at the joints. */
export type Stations = Array<[number, number, number]>;
// (the round-5 stations, 10% fuller: the spec's widths read spindly against the stone at 1440×900)
const fuller = (st: Stations, k: number): Stations => st.map(([u, a, b]) => [u, a * k, b * k]);
export const THIGH_ST: Stations = fuller([[0, 0.045, 0.045], [0.30, 0.042, 0.038], [0.65, 0.036, 0.032], [1, 0.027, 0.025]], 1.1);
export const SHIN_ST: Stations = fuller([[0, 0.026, 0.024], [0.28, 0.026, 0.042], [0.60, 0.020, 0.028], [1, 0.017, 0.017]], 1.1);
export const UPPER_ARM_ST: Stations = [[0, 0.032, 0.028], [0.35, 0.028, 0.026], [0.65, 0.024, 0.027], [1, 0.020, 0.020]];
export const FOREARM_ST: Stations = [[0, 0.022, 0.020], [0.25, 0.026, 0.022], [0.70, 0.019, 0.017], [1, 0.015, 0.015]];
export const NECK_ST: Stations = [[0, 0.033, 0.033], [1, 0.027, 0.029]];

/** Foot, sole-local: origin = ball, +x toward the toes, +y up. */
export const FOOT: Anchor[] = [
  [0.040, 0.004], [0.030, 0.018], [-0.030, 0.034], [-0.065, 0.048], [-0.090, 0.046], [-0.105, 0.012], [-0.100, 0.000, 1], [0.000, 0.000],
];

/** Hand, local to the palm's contact point: +x to the fingertips, +y outward (the back of the hand). */
export const PALM: Anchor[] = [[-0.050, 0.010], [-0.048, 0.030], [-0.030, 0.042], [0.004, 0.044], [0.012, 0.030], [0.012, 0.004], [0.000, 0.000], [-0.030, 0.000]];
/** Fingers from the sole outward: [base x, length, sole-side y, width at base]: little, ring, middle, index. */
export const FINGERS: Array<[number, number, number, number]> = [[0.002, 0.040, 0.0000, 0.0085], [0.004, 0.050, 0.0110, 0.0095], [0.004, 0.055, 0.0230, 0.0110], [0.002, 0.050, 0.0365, 0.0110]];
/** Neighbouring fingers are 0.0025 H apart: ochre shows between them, so they never merge into a claw (V6). */
export const FINGER_GAP = 0.0025;
export const THUMB = { base: { x: -0.014, y: 0.036 }, len: 0.038, spread: 14, w0: 0.012, w1: 0.009 };

/** Loincloth (torso frame): a short wrap from the belt to 0.06 below the crotch, hem rounded, never spikes (V5). */
export const WRAP: Anchor[] = [
  [0.070, 0.058, 1], [0.070, -0.054, 1], [0.030, -0.066], [-0.010, -0.080], [-0.050, -0.074], [-0.072, -0.050], [-0.078, -0.010], [-0.076, 0.030], [-0.064, 0.058], [-0.010, 0.064],
];
/** A flap (u down the hang, v front): one rounded quadratic-sided trapezoid, hem 0.07 wide, corners r 0.012. */
export const FLAP: Anchor[] = [[0.000, -0.016], [0.045, -0.019], [0.074, -0.022], [0.086, -0.012], [0.088, 0.000], [0.086, 0.012], [0.074, 0.022], [0.045, 0.019], [0.000, 0.016]];
export const FLAP_ROOT = { front: [0.040, 0.050] as [number, number], back: [0.030, -0.066] as [number, number] };

// ---------- linework (§2.8) ----------
/** A stroke in one part's frame: weight (I incise, C contour, F fine), the tiers that draw it, points (u, v pairs). */
export interface Stroke { w: 'I' | 'C' | 'F'; t: string; p: number[]; dot?: number; fill?: boolean }
const S = (w: Stroke['w'], t: string, ...p: number[]): Stroke => ({ w, t, p });
const dot = (w: Stroke['w'], t: string, u: number, v: number, r: number): Stroke => ({ w, t, p: [u, v], dot: r, fill: true });

/** Torso (absolute u in H). Calm (V13): short rectus pairs, no serratus ticks, one lat sweep. */
export const TORSO_LINES: Stroke[] = [
  S('C', '123', 0.296, 0.046, 0.304, 0.020, 0.300, -0.010),                               // clavicle
  S('C', '123', 0.266, -0.004, 0.236, 0.016, 0.216, 0.046, 0.220, 0.070),                  // pectoral
  S('C', '12', 0.256, -0.006, 0.230, 0.010, 0.212, 0.036),                                // pectoral, second arc
  S('C', '123', 0.202, 0.058, 0.160, 0.046, 0.120, 0.038, 0.074, 0.042),                  // linea alba
  S('C', '12', 0.188, 0.058, 0.184, 0.046, 0.188, 0.036), S('C', '12', 0.188, 0.030, 0.184, 0.020, 0.186, 0.012), // rectus pairs
  S('C', '12', 0.152, 0.050, 0.149, 0.040, 0.152, 0.032), S('C', '12', 0.152, 0.026, 0.149, 0.016, 0.151, 0.008),
  S('C', '1', 0.116, 0.046, 0.113, 0.036, 0.116, 0.028), S('C', '1', 0.116, 0.022, 0.113, 0.012, 0.115, 0.004),
  S('C', '123', 0.092, 0.050, 0.060, 0.034, 0.030, 0.020, 0.008, 0.016),                  // inguinal
  S('C', '12', 0.288, -0.052, 0.262, -0.036, 0.226, -0.046),                              // scapula
  S('C', '123', 0.236, -0.058, 0.180, -0.036, 0.120, -0.030),                             // lat sweep
  S('F', '1', 0.200, -0.058, 0.150, -0.040, 0.100, -0.040),                               // spine groove
  S('C', '123', 0.070, -0.040, 0.030, -0.058, -0.018, -0.052),                            // glute
];

/** Head (head frame, H). */
export const HEAD_LINES: Stroke[] = [
  S('C', '123', 0.021, 0.030, 0.027, 0.042, 0.022, 0.055),                                // brow arc
  S('C', '123', 0.010, -0.002, 0.000, -0.016, -0.014, -0.016, -0.022, -0.004),            // ear C
  S('C', '12', 0.002, -0.006, -0.008, -0.010, -0.012, -0.004),                            // ear hook
  S('F', '12', -0.012, 0.064, -0.018, 0.060, -0.016, 0.055),                              // nostril
  S('F', '12', -0.029, 0.056, -0.030, 0.050),                                              // lips
  S('F', '123', -0.020, 0.056, -0.028, 0.050, -0.036, 0.050, -0.044, 0.056),              // moustache
  // beard: 6 wavy strokes from the jaw to the point
  S('F', '123', -0.040, 0.050, -0.056, 0.052, -0.070, 0.048, -0.084, 0.046),
  S('F', '123', -0.040, 0.034, -0.054, 0.040, -0.068, 0.036, -0.082, 0.040),
  S('F', '123', -0.042, 0.018, -0.054, 0.026, -0.066, 0.022, -0.078, 0.032),
  S('F', '12', -0.040, 0.004, -0.050, 0.012, -0.060, 0.010, -0.072, 0.022),
  S('F', '1', -0.050, 0.044, -0.064, 0.042, -0.076, 0.044),
  S('F', '1', -0.050, 0.026, -0.060, 0.030, -0.072, 0.028),
  // the hairline: hair from the face, down by the temple and round the ear to the nape (scalloped)
  S('C', '123', 0.040, 0.034, 0.030, 0.030, 0.026, 0.020, 0.018, 0.014, 0.016, 0.004, 0.008, -0.004, 0.012, -0.020, 0.004, -0.028, -0.010, -0.030, -0.026, -0.034, -0.040, -0.044),
  // fillet: a double line and five dots, from the brow over the crown to the back
  S('C', '123', 0.041, 0.038, 0.046, 0.016, 0.040, -0.020, 0.020, -0.050, -0.006, -0.066),
  S('C', '12', 0.031, 0.036, 0.036, 0.016, 0.030, -0.016, 0.012, -0.042, -0.012, -0.058),
];
/** Hair curls: rows of 6 + 5 + 4 spirals (r 0.006, 1¼ turns) along offset curves of the skull. */
export const CURL_ROWS: Array<{ t: string; pts: Array<[number, number]> }> = [
  { t: '123', pts: [[0.044, 0.022], [0.048, -0.004], [0.040, -0.030], [0.022, -0.050], [0.000, -0.058], [-0.022, -0.052]] },
  { t: '12', pts: [[0.028, -0.008], [0.016, -0.032], [-0.004, -0.044], [-0.024, -0.038], [0.030, 0.014]] },
  { t: '1', pts: [[0.010, -0.018], [-0.008, -0.028], [0.022, -0.020], [0.034, 0.000]] },
];
export const CURL_R = 0.0075;
/** Nape ringlets (black lobes hanging from the nape; they swing with the tertiary channel). */
export const RINGLETS: Array<[number, number]> = [[-0.066, -0.050], [-0.072, -0.058], [-0.068, -0.066]];
/** The eye: an ochre almond with a black pupil. */
export const EYE = { u: 0.012, v: 0.036, len: 0.018, h: 0.0055, pupil: 0.004 };

/** Limb linework, u normalised to the bone (0 root → 1 end), v in H. */
export const THIGH_LINES: Stroke[] = [
  S('C', '12', 0.15, 0.026, 0.50, 0.030, 0.85, 0.018),                                     // rectus
  S('C', '1', 0.55, -0.002, 0.78, 0.010, 0.95, 0.018),                                     // vastus
  S('C', '123', 0.93, 0.020, 1.00, 0.028, 1.07, 0.020),                                    // kneecap
];
export const SHIN_LINES: Stroke[] = [
  S('F', '12', 0.02, -0.010, 0.10, -0.016),                                                // knee crease
  S('C', '123', 0.10, -0.030, 0.28, -0.036, 0.50, -0.020),                                 // calf
  S('C', '12', 0.18, -0.010, 0.30, -0.020, 0.46, -0.010),                                  // calf, second head
  S('F', '1', 0.20, 0.014, 0.60, 0.011, 0.85, 0.008),                                      // shin
  S('F', '12', 0.66, -0.014, 0.95, -0.011),                                                // Achilles
  dot('F', '12', 0.97, 0.002, 0.0035),                                                     // ankle
];
export const FOOT_LINES: Stroke[] = [
  S('F', '12', 0.008, 0.002, 0.009, 0.013), S('F', '12', 0.018, 0.002, 0.019, 0.013), S('F', '1', 0.028, 0.002, 0.029, 0.012),
];
export const UPPER_ARM_LINES: Stroke[] = [
  S('C', '123', 0.00, -0.024, 0.14, -0.010, 0.30, 0.010, 0.42, 0.024),                     // deltoid: an open arc
  S('C', '12', 0.42, 0.000, 0.68, 0.002, 0.90, 0.000),                                     // biceps / triceps
];
export const FOREARM_LINES: Stroke[] = [
  S('F', '12', 0.02, -0.012, 0.10, -0.006),                                                // elbow crease
  S('C', '12', 0.10, 0.010, 0.40, 0.014, 0.74, 0.006),
  S('C', '1', 0.16, -0.008, 0.50, -0.010, 0.80, -0.004),
  S('F', '12', 0.88, -0.013, 0.88, 0.013), S('F', '1', 0.94, -0.012, 0.94, 0.012),         // wrist bands
];
export const PALM_LINES: Stroke[] = [
  S('F', '12', 0.004, 0.002, 0.006, 0.020, 0.004, 0.040),                                  // knuckles
  S('F', '1', -0.016, 0.036, -0.030, 0.026),                                               // thumb crease
];
export const WRAP_LINES: Stroke[] = [
  S('C', '123', 0.064, 0.056, 0.064, -0.052), S('C', '12', 0.052, 0.056, 0.052, -0.056),   // belt
  S('C', '123', 0.058, 0.044, 0.044, 0.056, 0.034, 0.046),                                 // knot
  S('C', '123', 0.044, 0.040, 0.000, 0.048, -0.062, 0.050),                                // folds fanning from the knot
  S('C', '123', 0.044, 0.030, -0.010, 0.020, -0.070, 0.012),
  S('C', '12', 0.044, 0.020, -0.012, -0.010, -0.070, -0.030),
  S('C', '1', 0.040, 0.012, 0.000, -0.034, -0.050, -0.062),
  ...[-0.044, -0.028, -0.012, 0.004, 0.020, 0.036, 0.050].map((v) => dot('F', '1', -0.068 + 0.004 * Math.abs(v) / 0.05, v, 0.0022)),
];
export const FLAP_LINES: Stroke[] = [S('C', '123', 0.012, -0.006, 0.078, -0.010), S('C', '12', 0.012, 0.006, 0.078, 0.010)];
