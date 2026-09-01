import type { Point } from "../core/geom.js";
import { pointInPolygon } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { PlanRoom } from "../layout/plan-types.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";

/** Walls are never bare planes: a trim band at the floor, a dado in the accent tone, the
 *  field above it, a band under the ceiling, and one accent wall per room. */

export const BASEBOARD = 0.12;
export const DADO_TOP = 1.05;
export const TOP_TRIM = 0.09;
const PROUD = 0.02; // how far a band stands off the wall face, each side
const FACING = 0.02; // thickness of an accent wall facing

export interface WallBands {
  /** absolute y of the floor and of the ceiling plane */
  y0: number;
  ceilingY: number;
  field: string;
  accent: string;
  trim: string;
}

/** Which ends of a wall slice are seen: the underside of a lintel over a door, the top of a
 *  spandrel under a window. Ends that meet a slab are never capped. */
export interface Exposed {
  bottom?: boolean;
  top?: boolean;
}

/** One layered stretch of wall: the bands, each clipped to the vertical slice asked for.
 *  `emit` draws one band, given its material, thickness, y range and whether it needs caps. */
export function layerBands(
  bands: WallBands, sy0: number, sy1: number,
  emit: (material: string, thickness: number, y0: number, y1: number, caps: "both" | "none") => void,
  exposed: Exposed = {},
): void {
  const slice = (material: string, thickness: number, a: number, b: number): void => {
    const lo = Math.max(sy0, a);
    const hi = Math.min(sy1, b);
    if (hi - lo <= 1e-3) return;
    const capped = (exposed.bottom && lo <= sy0 + 1e-6) || (exposed.top && hi >= sy1 - 1e-6);
    emit(material, thickness, lo, hi, capped ? "both" : "none");
  };
  const base = bands.y0;
  const trimStart = Math.max(base + DADO_TOP, bands.ceilingY - TOP_TRIM);
  slice(bands.trim, 2 * PROUD, base, base + BASEBOARD);
  slice(bands.accent, PROUD, base + BASEBOARD, base + DADO_TOP);
  slice(bands.field, 0, base + DADO_TOP, trimStart);
  slice(bands.trim, PROUD, trimStart, bands.ceilingY);
  slice(bands.field, 0, bands.ceilingY, Number.POSITIVE_INFINITY);
}

/** One wall of each room, seeded, faced in the accent tone: the colour blocking that keeps a
 *  room from reading as four identical planes. Doors and the facade are left alone. */
export function emitAccentWalls(
  mb: MeshBuilder, keys: MaterialKeys, rooms: PlanRoom[], uvOutline: readonly Point[],
  frame: Frame, y0: number, ceilingY: number, rng: Rng,
): void {
  for (const room of rooms) {
    const r = room.rect;
    if (r.lu < 1.6 || r.lv < 1.6) continue;
    const doorEdges = new Set(room.doors.map((d) => d.edge));
    const edges: PlanRoom["doors"][number]["edge"][] = ["v0", "v1", "u0", "u1"];
    const start = Math.floor(rng.range(0, edges.length));
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(start + i) % edges.length]!;
      if (doorEdges.has(edge)) continue;
      const face = facingRect(r, edge);
      const ends = uvRectCorners(face);
      if (!ends.every((p) => pointInPolygon(p, uvOutline))) continue;
      mb.addPrism(
        keys.accent(room.kind), ends.map((p) => uvToWorld(p, frame)),
        y0 + BASEBOARD, ceilingY - TOP_TRIM,
      );
      break;
    }
  }
}

/** A thin facing standing just inside one edge of a room. */
function facingRect(r: UvRect, edge: string): UvRect {
  const inset = 0.03;
  switch (edge) {
    case "v0": return { u: r.u + inset, v: r.v + inset, lu: r.lu - 2 * inset, lv: FACING };
    case "v1": return { u: r.u + inset, v: r.v + r.lv - inset - FACING, lu: r.lu - 2 * inset, lv: FACING };
    case "u0": return { u: r.u + inset, v: r.v + inset, lu: FACING, lv: r.lv - 2 * inset };
    default: return { u: r.u + r.lu - inset - FACING, v: r.v + inset, lu: FACING, lv: r.lv - 2 * inset };
  }
}
