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
