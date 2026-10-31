// Round 6 Sisyphus body (ROUND6_PLAN §4.1): a realistic adult at 7.5 heads, modelled in light, no lines. Pure
// numbers; world units are H (standing height = 1), y up. The figure's volumes live in render/figurePrims.ts.

export const BODY = {
  head: 0.133,
  neck: 0.040,
  neckW: 0.052,
  torso: 0.300,
  thigh: 0.245,
  shin: 0.240,
  /** Foot (sole-local, origin = ball): ankle 0.075 behind the ball and 0.035 above the sole. */
  ankleBack: 0.075,
  ankleH: 0.035,
  heelBack: 0.100,
  toe: 0.040,
  upperArm: 0.186,
  foreArm: 0.150,
  hand: 0.100,
  /** Hand (local frame on the stone: origin = palm contact on the surface, +x to the fingertips, +y outward). */
  wristLocal: { x: -0.040, y: 0.020 },
  palmLocal: { x: 0, y: 0.016 },
  /** The stone: Ø 1.5 × his height (§1.1). */
  R: 0.75,
} as const;

export const LEG_CHAIN = BODY.thigh + BODY.shin;
export const ARM_CHAIN = BODY.upperArm + BODY.foreArm;

/** Shoulder-to-wrist distance for an elbow interior angle (deg). */
export function armSpan(elbowDeg: number): number {
  const a = BODY.upperArm, b = BODY.foreArm, c = Math.cos((elbowDeg * Math.PI) / 180);
  return Math.sqrt(a * a + b * b - 2 * a * b * c);
}
