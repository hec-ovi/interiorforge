import { polygonBounds, type Point } from "../core/geom.js";
import type { BlueprintFloor, Facade as BlueprintFacade } from "../core/types.js";
import { Facade, PARTITION_HALF } from "./openings.js";
import { gridOrigin, TILE } from "./tile-fit.js";
import type { Frame, UvRect } from "./uv.js";
import { uvToWorld, worldToUv } from "./uv.js";

/** Candidate unit cuts are real partition seats on the facade, not pane divisions. */
export class FacadeSeats {
  private readonly facade: Facade;
  private readonly candidates: number[];

  constructor(floor: BlueprintFloor, private readonly frame: Frame,
    private readonly outline: readonly Point[], definition: BlueprintFacade) {
    this.facade = new Facade(floor, definition);
    const bounds = polygonBounds(outline), origin = gridOrigin(outline)[0];
    const candidates: number[] = [];
    for (let u = origin; u <= bounds.x + bounds.w; u += TILE) candidates.push(u);
    for (const grid of definition.grids ?? []) {
      if (grid.floor !== floor.index) continue;
      const a = floor.outline[grid.edge]!, b = floor.outline[(grid.edge + 1) % floor.outline.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const anchor of grid.partitionAnchors) {
        if (anchor.width < 2 * PARTITION_HALF) continue;
        candidates.push(worldToUv([a[0] + (b[0] - a[0]) * anchor.offset / length,
          a[1] + (b[1] - a[1]) * anchor.offset / length], frame)[0]);
      }
    }
    this.candidates = [...new Set(candidates.map(value => Math.round(value * 1e6) / 1e6))].sort((a, b) => a - b);
  }

  cuts(strip: UvRect, side: "v0" | "v1", endMargin: number): number[] {
    const bounds = polygonBounds(this.outline);
    return this.candidates.filter(u => {
      if (u < Math.max(strip.u, bounds.x + endMargin) || u > Math.min(strip.u + strip.lu, bounds.x + bounds.w - endMargin)) return false;
      const contacts: number[] = [];
      for (let i = 0; i < this.outline.length; i++) {
        const a = this.outline[i]!, b = this.outline[(i + 1) % this.outline.length]!;
        if (Math.abs(b[0] - a[0]) < 1e-8 || u < Math.min(a[0], b[0]) || u > Math.max(a[0], b[0])) continue;
        contacts.push(a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]));
      }
      if (!contacts.length) return false;
      const v = side === "v0" ? Math.max(...contacts) : Math.min(...contacts);
      return this.facade.crossedBy(uvToWorld([u, v], this.frame), PARTITION_HALF) === null;
    });
  }
}

interface Score { area: number; penalty: number; pairs: [number, number][] }

/** Maximal useful frontage, then a seeded generous width preference, over legal cuts. */
export function facadeSlots(cuts: readonly number[], preferredWidth: number,
  accepts: (low: number, high: number) => boolean): [number, number][] {
  const scores: Score[] = [{ area: 0, penalty: 0, pairs: [] }];
  for (let end = 1; end < cuts.length; end++) {
    let best = scores[end - 1]!;
    for (let start = 0; start < end; start++) {
      const low = cuts[start]!, high = cuts[end]!;
      if (!accepts(low, high)) continue;
      const previous = scores[start]!, width = high - low;
      const area = previous.area + width;
      const penalty = previous.penalty + ((width - preferredWidth) / preferredWidth) ** 2 + 0.15;
      if (area > best.area + 1e-6 || Math.abs(area - best.area) < 1e-6 && penalty < best.penalty) {
        best = { area, penalty, pairs: [...previous.pairs, [low, high]] };
      }
    }
    scores[end] = best;
  }
  return scores.at(-1)?.pairs ?? [];
}
