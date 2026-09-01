import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { boundaryDistance } from "../core/geom.js";
import type { BlueprintFloor, Opening } from "../core/types.js";
import type { MeshBuilder } from "../glb/mesh-builder.js";
import { SHELL_WALL } from "../layout/shell.js";

/** How the interior fits inside the shell: every vertex stays behind the shell's wall depth,
 *  except the reveal returns inside an opening, which run back to the skin clearance. */

const EPS = 1e-6;
/** the slab soffit hangs this far under a floor's walking surface */
export const SOFFIT_DEPTH = 0.15;

/** The lining's hole for one opening, along its edge (t) and above the floor (y): the shell's
 *  opening shrunk by the recess. A sill at floor level and a head at the ceiling stay put. */
export interface OpeningHole {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

export function openingHole(o: Opening, floorHeight: number): OpeningHole {
  const top = o.sill + o.height;
  return {
    t0: o.offset + SHELL_WALL.recess,
    t1: o.offset + o.width - SHELL_WALL.recess,
    y0: o.sill > EPS ? o.sill + SHELL_WALL.recess : 0,
    y1: top < floorHeight - EPS ? top - SHELL_WALL.recess : floorHeight,
  };
}

/** Throws E_SHELL_BREACH when any vertex of the builder reaches the shell wall. A vertex on
 *  a floor boundary passes when either floor holds it; one beyond the lowest soffit or the
 *  top floor's ceiling is read against that end floor. */
export function assertInsideShell(mb: MeshBuilder, floors: BlueprintFloor[], wallDepth: number): void {
  const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
  const lowest = sorted[0]!;
  const top = sorted.at(-1)!;
  for (const slot of mb.materials()) {
    const pos = mb.getGroup(slot)!.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const p: Point = [pos[i]!, pos[i + 2]!];
      const y = pos[i + 1]!;
      let candidates = sorted.filter((f) => y >= f.elevation - SOFFIT_DEPTH - EPS && y <= f.elevation + f.height + EPS);
      if (candidates.length === 0) candidates = [y < lowest.elevation ? lowest : top];
      if (candidates.some((f) => insideShell(p, y - f.elevation, f, wallDepth))) continue;
      throw new InteriorError(
        "E_SHELL_BREACH",
        `${slot} vertex (${p[0].toFixed(3)}, ${y.toFixed(3)}, ${p[1].toFixed(3)}) reaches the shell wall`,
        candidates[0]!.index,
      );
    }
  }
}

function insideShell(p: Point, y: number, floor: BlueprintFloor, wallDepth: number): boolean {
  const d = boundaryDistance(p, floor.outline);
  if (d >= wallDepth - EPS) return true;
  if (d < SHELL_WALL.skinClear - EPS) return false;
  return floor.openings.some((o) => inHole(p, y, floor, o));
}

/** True when the point projects into the opening's hole on its edge. */
function inHole(p: Point, y: number, floor: BlueprintFloor, o: Opening): boolean {
  const hole = openingHole(o, floor.height);
  if (y < hole.y0 - EPS || y > hole.y1 + EPS) return false;
  const a = floor.outline[o.edge]!;
  const b = floor.outline[(o.edge + 1) % floor.outline.length]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len;
  return t >= hole.t0 - EPS && t <= hole.t1 + EPS;
}
