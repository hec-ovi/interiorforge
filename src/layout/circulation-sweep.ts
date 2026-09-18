import type { FloorCirculation } from "./circulation.js";
import { worldToUv, type Frame, type UvRect } from "./uv.js";

/** Every subsegment box contains its complete center line plus the full body radius. */
export function circulationSweep(plan: FloorCirculation, frame: Frame): UvRect[] {
  const boxes = new Map<string, UvRect>();
  const radius = plan.bodyWidth / 2;
  for (const route of plan.routes) for (let index = 0; index < route.points.length; index++) {
    const a = worldToUv(route.points[index]!, frame);
    const b = worldToUv(route.points[Math.min(index + 1, route.points.length - 1)]!, frame);
    const du = b[0] - a[0], dv = b[1] - a[1];
    const aligned = Math.abs(du) < 1e-8 || Math.abs(dv) < 1e-8;
    const count = aligned ? 1 : Math.max(1, Math.ceil(Math.hypot(du, dv) / plan.cellSize));
    for (let part = 0; part < count; part++) {
      const start = [a[0] + du * part / count, a[1] + dv * part / count];
      const end = part + 1 === count ? b : [a[0] + du * (part + 1) / count, a[1] + dv * (part + 1) / count];
      const rect: UvRect = {
        u: Math.min(start[0]!, end[0]!) - radius, v: Math.min(start[1]!, end[1]!) - radius,
        lu: Math.abs(end[0]! - start[0]!) + 2 * radius, lv: Math.abs(end[1]! - start[1]!) + 2 * radius,
      };
      boxes.set(JSON.stringify(rect), rect);
    }
  }
  return [...boxes.values()];
}
