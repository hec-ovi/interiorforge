import type { Point } from '../../core/geom.js';
import { polygonBounds } from '../../core/geom.js';
import type { BuildingType, InteriorRequest, ReferenceKind, Tier } from '../../core/types.js';
import { referenceKind } from '../../styles/reference/kinds.js';
import type { CorePlan } from '../core-plan.js';
import { constructionPlate, shellWallDepth } from '../shell.js';
import { makeFrame, type UvRect } from '../uv.js';

/** The composed core of a reference-kind building: one stair against a side wall, opening on
 *  its front face to the floor, and a compact lift core in the middle of the plate, a column at
 *  each end and two through cars between them that open to the front and, on floors whose
 *  plan keeps the back public, to the back. Every floor, the crown and the roof housing stand
 *  on these same rectangles.
 *
 *  Plan terms (see composer.ts): u from the user's left wall, v from the back wall. The kind A
 *  datum is the user's ground plan: stair u 0-4.5, v 4.6-14.6; column 1.8 | lift 3.9 | lift 3.5 |
 *  column 1.8 centred on the plate, v 8.2-12.7. */
export const COMPOSED_CORE = {
  stair: { width: 4.5, depth: 10, back: 4.6 },
  lifts: { back: 8.2, depth: 4.5, column: 1.8, widths: [3.9, 3.5] as const },
  /** the smallest plate a composed floor plans */
  minPlate: 26,
  /** the share of its bounding rectangle a plate with cut corners must fill */
  minFill: .96,
  /** how far a cut corner may reach along either side */
  maxCorner: 3.2,
} as const;

export interface ComposedPlate {
  kind: ReferenceKind;
  /** plate bounds in the frame */
  box: { x: number; z: number; w: number; d: number };
  /** the stair stands against the user's right wall instead of the left */
  mirror: boolean;
}

type CoreBlueprint = InteriorRequest['blueprint'];

/** Which kinds compose their floors. */
const COMPOSED_KINDS: ReadonlySet<ReferenceKind> = new Set(['A', 'B', 'C', 'R']);

/** The blueprint floor kinds a composed building plans: its lobby, homes and offices. */
const COMPOSED_FLOOR_KINDS: Readonly<Record<string, ReadonlySet<string>>> = {
  A: new Set(['lobby', 'entry', 'residential']),
  B: new Set(['lobby', 'entry', 'residential']),
  C: new Set(['lobby', 'entry', 'residential']),
  R: new Set(['lobby', 'entry', 'offices', 'corpo']),
};
const COMPOSED_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
  A: new Set(['residential']), B: new Set(['residential']), C: new Set(['residential']), R: new Set(['offices', 'corpo']),
};

/** The plate a composed building plans on, or null when it keeps the generic planner: a
 *  reference kind that composes, one rectangular plate on every floor, at least 26 m square. */
export function composedPlate(blueprint: CoreBlueprint, building: { type: BuildingType | string; tier?: Tier | string; kind?: ReferenceKind }): ComposedPlate | null {
  const request = { building: { id: '', type: building.type, tier: building.tier ?? 'high_rich', ...(building.kind ? { kind: building.kind } : {}) },
    blueprint } as unknown as InteriorRequest;
  if (!building.tier && !building.kind) return null;
  const kind = referenceKind(request);
  if (!kind || !COMPOSED_KINDS.has(kind) || !COMPOSED_TYPES[kind]!.has(building.type)) return null;
  if (blueprint.floors.some(f => f.index >= 0 && !COMPOSED_FLOOR_KINDS[kind]!.has(f.kind))) return null;
  if (blueprint.floors.some(f => f.index < 0)) return null;
  const ground = [...blueprint.floors].sort((a, b) => a.index - b.index)[0];
  if (!ground?.roomEnvelope) return null;
  const frame = frameOf(blueprint);
  const plates = blueprint.floors.map(f => polygonBounds(constructionPlate(f, frame, shellWallDepth(blueprint.facade))));
  const box = plates[0]!;
  if (box.w < COMPOSED_CORE.minPlate || box.d < COMPOSED_CORE.minPlate) return null;
  if (plates.some(p => Math.abs(p.x - box.x) + Math.abs(p.z - box.z) + Math.abs(p.w - box.w) + Math.abs(p.d - box.d) > .01)) return null;
  // every floor's plate is the rectangle itself or one whose corners are cut back a little
  // (chamfered or rounded); a notched, stepped or courtyard plate keeps the corridor planner
  const area = (pts: Point[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (blueprint.floors.some(f => {
    const plate = constructionPlate(f, frame, shellWallDepth(blueprint.facade));
    return area(plate) < box.w * box.d * COMPOSED_CORE.minFill || !cornersOnly(plate, box);
  })) return null;
  // kind B stands its stair against the other wall, so its plans read mirrored
  return { kind, box, mirror: kind === 'B' };
}

/** Whether every vertex off the bounding rectangle's corners lies within a cut corner's reach of
 *  one, and every side of the rectangle is met along most of its length. */
function cornersOnly(plate: readonly Point[], box: { x: number; z: number; w: number; d: number }): boolean {
  const corners: Point[] = [[box.x, box.z], [box.x + box.w, box.z], [box.x + box.w, box.z + box.d], [box.x, box.z + box.d]];
  return plate.every(p => corners.some(c => Math.abs(p[0] - c[0]) <= COMPOSED_CORE.maxCorner + .01 && Math.abs(p[1] - c[1]) <= COMPOSED_CORE.maxCorner + .01)
    || Math.abs(p[0] - box.x) < .01 || Math.abs(p[0] - box.x - box.w) < .01 || Math.abs(p[1] - box.z) < .01 || Math.abs(p[1] - box.z - box.d) < .01);
}

/** The frame a composed building plans in: the main entrance's facade edge. */
export function frameOf(blueprint: CoreBlueprint) {
  const ground = [...blueprint.floors].sort((a, b) => a.index - b.index)[0]!;
  const entry = ground.openings.find(o => o.doorRole === 'main') ?? ground.openings.find(o => o.kind === 'door');
  const edge = entry?.edge ?? 0, a = ground.outline[edge]!, b = ground.outline[(edge + 1) % ground.outline.length]!;
  return makeFrame(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI);
}

/** The composed core, or null for a building the generic planner keeps. */
export function composedCore(blueprint: CoreBlueprint, building: { type: BuildingType | string; tier?: Tier | string; kind?: ReferenceKind }): CorePlan | null {
  const plate = composedPlate(blueprint, building);
  if (!plate) return null;
  const frame = frameOf(blueprint);
  const { box, mirror } = plate;
  const U1 = box.x + box.w, V1 = box.z + box.d;
  const rect = (u0: number, v0: number, u1: number, v1: number): UvRect => {
    const a = mirror ? box.w - u0 : u0, b = mirror ? box.w - u1 : u1;
    const lo = Math.min(U1 - a, U1 - b), hi = Math.max(U1 - a, U1 - b);
    return { u: r3(lo), v: r3(V1 - v1), lu: r3(hi - lo), lv: r3(v1 - v0) };
  };
  const S = COMPOSED_CORE.stair, L = COMPOSED_CORE.lifts;
  const stairA = rect(0, S.back, S.width, S.back + S.depth);
  const span = 2 * L.column + L.widths[0] + L.widths[1];
  const start = r3(box.w / 2 - .05 - span / 2);
  const v0 = L.back, v1 = L.back + L.depth;
  const riser = rect(start, v0, start + L.column, v1);
  const first = rect(start + L.column, v0, start + L.column + L.widths[0], v1);
  const second = rect(start + L.column + L.widths[0], v0, start + L.column + L.widths[0] + L.widths[1], v1);
  const stub = rect(start + span - L.column, v0, start + span, v1);
  const elevators = [first, second].sort((a, b) => a.u - b.u).map((r, i) => ({ id: `elev-${i}`, rect: r }));
  const all = [stairA, riser, stub, ...elevators.map(e => e.rect)];
  const u0 = Math.min(...all.map(r => r.u)), u1 = Math.max(...all.map(r => r.u + r.lu));
  return { frame, mode: 'compact', vFace: r3(V1 - v1), u0, u1, depth: S.depth, stairStyle: 'u_return', stairDepth: S.depth,
    elevatorCount: 2, stairA, elevators, riser, stub, openPlan: true };
}

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
