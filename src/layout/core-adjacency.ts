import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, type Point } from "../core/geom.js";
import type { Blueprint, CoreAdjacencyFailure, CoreAdjacencyRule } from "../core/types.js";
import { uvRectCorners, worldToUv, type Frame, type UvRect } from "./uv.js";

interface FacadeSpan {
  floor: number;
  opening: string;
  origin: Point;
  along: Point;
  inward: Point;
  width: number;
  rule: CoreAdjacencyRule;
}

interface RectClearance {
  rect: UvRect;
  depths: readonly (number | undefined)[];
}

/** Exact directional depth from complete lining to actual occupied core rectangles. */
export class CoreFacadeClearance {
  private readonly spans: FacadeSpan[] = [];
  private readonly measurements = new WeakMap<UvRect, RectClearance>();

  constructor(blueprint: Blueprint, frame: Frame, private readonly liningDepth: number) {
    const policy = blueprint.facade?.coreAdjacency;
    if (!policy) return;
    const overrides = new Map<string, CoreAdjacencyRule>();
    for (const override of policy.overrides ?? []) {
      const key = `${override.floor}:${override.opening}`;
      const floor = blueprint.floors.find((candidate) => candidate.index === override.floor);
      if (overrides.has(key) || !floor?.openings.some((opening) => opening.id === override.opening)) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `core adjacency override ${key} is duplicate or names an absent opening`);
      }
      overrides.set(key, override);
    }
    for (const floor of blueprint.floors) for (const opening of floor.openings) {
      const rule = overrides.get(`${floor.index}:${opening.id}`)
        ?? (opening.kind === "window" || opening.glazing ? policy.glazing : undefined);
      if (!rule || rule.clearDepth === 0) continue;
      const a = worldToUv(floor.outline[opening.edge]!, frame);
      const b = worldToUv(floor.outline[(opening.edge + 1) % floor.outline.length]!, frame);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const along: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      this.spans.push({
        floor: floor.index, opening: opening.id, rule, along, inward: [-along[1], along[0]],
        origin: [a[0] + along[0] * opening.offset, a[1] + along[1] * opening.offset], width: opening.width,
      });
    }
  }

  conflict(solids: readonly (readonly [string, UvRect])[]): CoreAdjacencyFailure | undefined {
    if (this.spans.length === 0) return undefined;
    const measured = solids.map(([coreSolid, rect]) => ({ coreSolid, depths: this.depthsFor(rect) }));
    let failure: CoreAdjacencyFailure | undefined;
    // Span, then solid order also decides which equal-deficit failure is reported.
    for (const [i, span] of this.spans.entries()) for (const { coreSolid, depths } of measured) {
      const availableDepth = depths[i];
      if (availableDepth === undefined) continue;
      if (availableDepth + 1e-6 < span.rule.clearDepth
        && (!failure || span.rule.clearDepth - availableDepth > failure.requiredDepth - failure.availableDepth)) failure = {
        floor: span.floor, opening: span.opening, coreSolid, role: span.rule.role,
        requiredDepth: span.rule.clearDepth, availableDepth: Math.max(0, availableDepth),
      };
    }
    return failure;
  }

  private depthsFor(rect: UvRect): readonly (number | undefined)[] {
    const cached = this.measurements.get(rect);
    if (cached && cached.rect.u === rect.u && cached.rect.v === rect.v
      && cached.rect.lu === rect.lu && cached.rect.lv === rect.lv) return cached.depths;
    const depths = this.spans.map((span) => this.availableDepth(span, rect));
    this.measurements.set(rect, { rect: { ...rect }, depths });
    return depths;
  }

  private availableDepth(span: FacadeSpan, rect: UvRect): number | undefined {
    const projected = uvRectCorners(rect).map(([u, v]): Point => {
      const du = u - span.origin[0], dv = v - span.origin[1];
      return [du * span.along[0] + dv * span.along[1], du * span.inward[0] + dv * span.inward[1]];
    });
    const maxDepth = Math.max(...projected.map((point) => point[1]));
    if (maxDepth <= this.liningDepth) return undefined;
    const clipped = clipPolygonToRect(projected, { x: 0, z: this.liningDepth, w: span.width, d: maxDepth - this.liningDepth });
    if (clipped.length < 3) return undefined;
    const minAlong = Math.min(...clipped.map((point) => point[0]));
    const maxAlong = Math.max(...clipped.map((point) => point[0]));
    if (maxAlong - minAlong <= 1e-6) return undefined;
    return Math.min(...clipped.map((point) => point[1])) - this.liningDepth;
  }
}
