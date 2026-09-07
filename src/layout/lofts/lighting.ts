import type { LightFixture } from "../../core/types.js";
import type { LoftPlan } from "../../core/loft.js";

/** Sources mounted beneath stair handrails and above the rear mezzanine wall. */
export function loftLights(loft: LoftPlan, base: number, ceiling: number, tier: string): LightFixture[] {
  const stair = loft.stair, d = stair.direction, cross = [-d[1], d[0]];
  const source = (id: string, position: LightFixture["position"], length: number,
    axis: NonNullable<LightFixture["axis"]>, direction: NonNullable<LightFixture["direction"]>,
    intensity: number, cyan = false): LightFixture => ({
    id: `${loft.id}-${id}`, kind: "cove", room: loft.lowerRoom, position, length, axis, direction,
    angleDeg: (Math.atan2(axis[2], axis[0]) * 180 / Math.PI + 360) % 360,
    intensity, colorTemperatureK: 5800, ...(cyan ? { color: [.025, .72, 1] as [number, number, number] } : {}),
    range: 4, beamDeg: 170, diffuse: .95, facing: direction[1] > 0 ? "up" : "down",
  });
  if (!["rich", "high_rich"].includes(tier)) {
    const climb = loft.elevation - base - stair.rise, length = Math.hypot(stair.run, climb);
    const axis: [number, number, number] = [d[0] * stair.run / length, climb / length, d[1] * stair.run / length];
    const direction: [number, number, number] = [d[0] * climb / length, -stair.run / length, d[1] * climb / length];
    return [-1, 1].map(side => source(`stair-light-${side}`,
      [stair.start[0] + d[0] * stair.run / 2 + cross[0]! * side * .665,
        base + stair.rise + .965 + climb / 2,
        stair.start[1] + d[1] * stair.run / 2 + cross[1]! * side * .665],
      length - .06, axis, direction, Math.round(length * 45), true));
  }
  const edges = loft.platform.map((a, i) => ({ a, b: loft.platform[(i + 1) % 4]! }))
    .filter(({ a, b }) => Math.abs((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1]) < .001)
    .sort((a, b) => (b.a[0] - a.a[0]) * d[0] + (b.a[1] - a.a[1]) * d[1]);
  const rear = edges[0]!;
  const length = Math.hypot(rear.b[0] - rear.a[0], rear.b[1] - rear.a[1]);
  return [source("rear-wash", [(rear.a[0] + rear.b[0]) / 2 - d[0] * .18, ceiling - .24,
    (rear.a[1] + rear.b[1]) / 2 - d[1] * .18], length - .6,
  [(rear.b[0] - rear.a[0]) / length, 0, (rear.b[1] - rear.a[1]) / length], [0, 1, 0], Math.round(length * 200))];
}
