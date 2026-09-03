import { InteriorError } from "../core/errors.js";
import type { BlueprintFloor } from "../core/types.js";
import type { MeshBuilder } from "../glb/mesh-builder.js";
import { DOOR, WALL } from "../layout/constants.js";
import { doorUvPoint } from "../layout/plan-floor.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { BAND_PROUD, SHELL_WALL } from "../layout/shell.js";
import type { Frame } from "../layout/uv.js";
import { uvToWorld } from "../layout/uv.js";
import { doorHeadHeight } from "./walls.js";
import { edgeFrame, edgePoint } from "./shell-fit.js";

/** A doorway is only a doorway when the geometry is actually open: a wall run that missed
 *  its hole, a band or a facing standing across it walls the room off while the plan and the
 *  nav grid still read it as a door. Checked on the built mesh, per floor. */

/** Margin taken off the clear opening, so a jamb or a casing edge is not read as a blocker. */
const MARGIN = 0.02;
/** A surface touching the boundary of the clear volume stands beside it, not in it. */
const TOUCH = 1e-3;
/** Half depth swept across the wall line: the wall plus its proudest band. */
const HALF_DEPTH = WALL / 2 + 2 * BAND_PROUD + 0.01;
/** Triangles are bucketed into square cells of this size for lookup. */
const BUCKET = 2;

/** The clear volume of one doorway: a box on the wall line, in world space. */
export interface Doorway {
  id: string;
  /** center of the box */
  center: [number, number, number];
  /** unit direction of the wall line */
  along: [number, number];
  /** half extents along the line, up, and across the line */
  half: [number, number, number];
}

/** The doorways of one floor: every door between two rooms, at the size the player passes. */
export function floorDoorways(
  rooms: readonly PlanRoom[], frame: Frame, elevation: number, ceilingY: number,
): Doorway[] {
  const out: Doorway[] = [];
  for (const room of rooms) {
    for (const door of room.doors) {
      if (door.openFront || door.to === "outside") continue;
      const [x, z] = uvToWorld(doorUvPoint(door, room), frame);
      const alongU = door.edge === "v0" || door.edge === "v1";
      const rad = ((alongU ? 0 : 90) + frame.angleDeg) * Math.PI / 180;
      const clear = Math.min(doorHeadHeight(door.leaves, ceilingY - elevation), DOOR.clearHeight) - 2 * MARGIN;
      out.push({
        id: `${room.id}/${door.id}`,
        center: [x, elevation + MARGIN + clear / 2, z],
        along: [Math.cos(rad), Math.sin(rad)],
        half: [door.width / 2 - MARGIN, clear / 2, HALF_DEPTH],
      });
    }
  }
  return out;
}

/** Clear volumes through permanently open street fronts, from the exterior's fixed frame to
 *  the room face. Unlike a door, this connection has no leaf or movement envelope. */
export function openFrontClearances(floor: BlueprintFloor, wallDepth: number): Doorway[] {
  return floor.openings.flatMap((opening) => {
    if (opening.kind !== "openFront") return [];
    const portal = opening.portal!; // request validation requires it for this variant
    const frame = edgeFrame(floor.outline, opening.edge);
    const near = SHELL_WALL.skinClear;
    const far = Math.max(portal.clearDepth, wallDepth + SHELL_WALL.lining + BAND_PROUD);
    const center = edgePoint(frame, opening.offset + opening.width / 2, (near + far) / 2);
    return [{
      id: opening.id,
      center: [center[0], floor.elevation + portal.clearHeight / 2, center[1]],
      along: [frame.dir[0], frame.dir[1]],
      half: [portal.clearWidth / 2 - MARGIN, portal.clearHeight / 2 - MARGIN, (far - near) / 2],
    }];
  });
}

/** Throws E_UNREACHABLE_SPACE when anything the floor emitted stands in a doorway. */
export function assertDoorwaysClear(mb: MeshBuilder, doorways: Doorway[], floorIndex: number): void {
  if (doorways.length === 0) return;
  const tris = new TriangleIndex(mb);
  for (const door of doorways) {
    const slot = tris.blocker(door);
    if (slot) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `doorway ${door.id} is walled shut by ${slot}`,
        floorIndex,
      );
    }
  }
}

type Vec3 = [number, number, number];

/** The floor's triangles, bucketed by plan cell so a doorway only tests what is near it. */
class TriangleIndex {
  private readonly tris: { v: [Vec3, Vec3, Vec3]; slot: string }[] = [];
  private readonly buckets = new Map<string, number[]>();

  constructor(mb: MeshBuilder) {
    for (const slot of mb.materials()) {
      const g = mb.getGroup(slot)!;
      for (let i = 0; i < g.indices.length; i += 3) {
        const v = [0, 1, 2].map((k) => {
          const o = g.indices[i + k]! * 3;
          return [g.positions[o]!, g.positions[o + 1]!, g.positions[o + 2]!] as Vec3;
        }) as [Vec3, Vec3, Vec3];
        const index = this.tris.push({ v, slot }) - 1;
        const [x0, x1] = [Math.min(v[0][0], v[1][0], v[2][0]), Math.max(v[0][0], v[1][0], v[2][0])];
        const [z0, z1] = [Math.min(v[0][2], v[1][2], v[2][2]), Math.max(v[0][2], v[1][2], v[2][2])];
        for (let cx = Math.floor(x0 / BUCKET); cx <= Math.floor(x1 / BUCKET); cx++) {
          for (let cz = Math.floor(z0 / BUCKET); cz <= Math.floor(z1 / BUCKET); cz++) {
            const key = `${cx}:${cz}`;
            const bucket = this.buckets.get(key);
            if (bucket) bucket.push(index);
            else this.buckets.set(key, [index]);
          }
        }
      }
    }
  }

  /** The material of the first triangle standing in the doorway, if any. */
  blocker(door: Doorway): string | null {
    const reach = Math.hypot(door.half[0], door.half[2]);
    const seen = new Set<number>();
    for (let cx = Math.floor((door.center[0] - reach) / BUCKET); cx <= Math.floor((door.center[0] + reach) / BUCKET); cx++) {
      for (let cz = Math.floor((door.center[2] - reach) / BUCKET); cz <= Math.floor((door.center[2] + reach) / BUCKET); cz++) {
        for (const index of this.buckets.get(`${cx}:${cz}`) ?? []) {
          if (seen.has(index)) continue;
          seen.add(index);
          const t = this.tris[index]!;
          if (boxHitsTriangle(door, t.v)) return t.slot;
        }
      }
    }
    return null;
  }
}

/** Triangle against the doorway box, in the box's own frame (along, up, across). */
function boxHitsTriangle(door: Doorway, tri: [Vec3, Vec3, Vec3]): boolean {
  const [ax, az] = door.along;
  const local = tri.map((p): Vec3 => {
    const dx = p[0] - door.center[0];
    const dz = p[2] - door.center[2];
    return [dx * ax + dz * az, p[1] - door.center[1], -dx * az + dz * ax];
  }) as [Vec3, Vec3, Vec3];
  return triangleHitsBox(local, [door.half[0] - TOUCH, door.half[1] - TOUCH, door.half[2] - TOUCH]);
}

/** Separating-axis test of a triangle against an axis-aligned box centered at the origin. */
function triangleHitsBox([v0, v1, v2]: [Vec3, Vec3, Vec3], h: Vec3): boolean {
  for (let a = 0; a < 3; a++) {
    if (Math.min(v0[a]!, v1[a]!, v2[a]!) > h[a]! || Math.max(v0[a]!, v1[a]!, v2[a]!) < -h[a]!) return false;
  }
  const e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)];
  const n = cross(e[0]!, e[1]!);
  const d = dot(n, v0);
  if (Math.abs(d) > Math.abs(n[0]) * h[0] + Math.abs(n[1]) * h[1] + Math.abs(n[2]) * h[2]) return false;
  const verts = [v0, v1, v2];
  for (let i = 0; i < 3; i++) {
    for (let a = 0; a < 3; a++) {
      const axis: Vec3 = [0, 0, 0];
      axis[(a + 1) % 3] = -e[i]![(a + 2) % 3]!;
      axis[(a + 2) % 3] = e[i]![(a + 1) % 3]!;
      const projections = verts.map((v) => dot(axis, v));
      const radius = Math.abs(axis[0]) * h[0] + Math.abs(axis[1]) * h[1] + Math.abs(axis[2]) * h[2];
      if (Math.min(...projections) > radius || Math.max(...projections) < -radius) return false;
    }
  }
  return true;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
