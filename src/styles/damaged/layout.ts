import type { BlueprintFloor, InteriorRequest } from '../../core/types.js';
import { polygonArea, polygonBounds, type Point } from '../../core/geom.js';
import { uvRectCorners, uvToWorld, worldToUv, type UvRect } from '../../layout/uv.js';
import { BODY_CLEAR } from '../../layout/constants.js';
import type { CorePlan } from '../../layout/core-plan.js';
import type { EdgeName, FloorFrame, PlanRoom } from '../../layout/plan-types.js';
import { idGen, type IdGen } from '../../layout/rooms.js';
import { planCapsuleResidential, type StandardUnitProgram } from '../capsule/layout.js';
import { damagedDwellingProgram } from './dwelling-program.js';
import { validateArchitecture } from '../../layout/validate-floor.js';
import { floorBounds } from '../../layout/shell.js';
import { InteriorError } from '../../core/errors.js';
import { roomCoversRect, sharedRoomEdges } from '../../layout/room-shape.js';

export function isDamagedResidential(request: InteriorRequest): boolean {
  return request.building.type === 'residential' && request.building.tier === 'poor';
}

/** On a generous rectangular residential plate the fallback spine also retains
 * the reference's 3m allocation, with the original core face and doors fixed. */
export function damagedCorridorRect(request: InteriorRequest, frame: FloorFrame, plate: Point[]): UvRect {
  const rect = { ...frame.corridor }, bounds = polygonBounds(plate);
  if (isDamagedResidential(request) && rect.lv < 3 && frame.south.lv >= 6.4
    && Math.abs(polygonArea(plate)) >= bounds.w * bounds.d * .98) {
    rect.v -= 3 - rect.lv; rect.lv = 3;
  }
  return rect;
}

/** The standard 75m² envelope solver is shared with the H10/Japantown family.
 * Poor rooms retain their own furniture, wet-room parts, material profile and
 * public services after allocation; compatible facade seats are tried on all sides. */
export function planDamagedResidential(request: InteriorRequest, floor: BlueprintFloor, core: CorePlan,
  frame: FloorFrame, plate: Point[], outline: Point[], ids: IdGen): PlanRoom[] | null {
  if (!isDamagedResidential(request)) return null;
  const rooms = planCapsuleResidential(request, floor, core, frame, plate, outline, ids, 'poor', [], damagedStandardProgram);
  if (!rooms) return null;
  alignEntryPhase(rooms);
  // A broad-clearance packing proxy may overlook a smaller disconnected pocket.
  // Prove the actual architecture/access domains before adopting this strategy;
  // a floor that cannot keep every home falls back to the legal frontage programme.
  const probe = structuredClone(rooms);
  try {
    validateArchitecture(floor.outline, floorBounds(floor, core.frame, request.blueprint.facade),
      probe, [], core, floor.index, ids);
    if (!fitDamagedEntrances(probe, true)) return null;
    validateArchitecture(floor.outline, floorBounds(floor, core.frame, request.blueprint.facade),
      probe, [], core, floor.index, ids);
  } catch (error) {
    if (error instanceof InteriorError && ['E_UNREACHABLE_SPACE', 'E_FLOOR_TOO_SMALL'].includes(error.code)) return null;
    throw error;
  }
  if (probe.length !== rooms.length) return null;
  const publicIds = new Set(probe.filter(room => !room.unit).map(room => room.id));
  for (const unit of new Set(probe.map(room => room.unit).filter(Boolean))) {
    const entries = probe.filter(room => room.unit === unit).flatMap(room => room.doors
      .filter(door => publicIds.has(door.to)).map(door => ({ room, door })));
    if (entries.length !== 1 || entries[0]!.door.width < 1.2 - 1e-6 || !['living', 'studio_main'].includes(entries[0]!.room.kind)) return null;
  }
  return probe;
}

/** A long shared edge may face a 10cm gap beside a stair for part of its span.
 * Centre the full cassette on a portion with real public and private approaches,
 * rather than letting generic reachability repair replace it with a 0.9m door. */
export function fitDamagedEntrances(rooms: PlanRoom[], onlyNarrow = false): boolean {
  const publicRooms = new Map(rooms.filter(room => !room.unit).map(room => [room.id, room]));
  for (const room of rooms.filter(room => room.unit)) for (const door of room.doors) {
    const target = publicRooms.get(door.to);
    if (!target || door.openFront) continue;
    if (onlyNarrow && door.width >= 1.2 - 1e-6) continue;
    if (!['living', 'studio_main'].includes(room.kind)) return false;
    let fitted = false;
    const edges = sharedRoomEdges(room, target).sort((a, b) => b.hi - b.lo - (a.hi - a.lo));
    for (const edge of edges) {
      if (edge.hi - edge.lo < 2.65) continue;
      const middle = (edge.lo + edge.hi) / 2;
      const candidates = [middle];
      const axis = edge.edge.startsWith('v') ? 0 : 1;
      const breaks = [...new Set([edge.lo, edge.hi, ...[room, target].flatMap(owner =>
        [owner.polygon ?? uvRectCorners(owner.rect), ...(owner.holes ?? [])].flatMap(ring => ring.map(point => point[axis])))])]
        .filter(value => value >= edge.lo && value <= edge.hi).sort((a, b) => a - b);
      for (let i = 1; i < breaks.length; i++) if (breaks[i]! - breaks[i - 1]! >= 2.65)
        candidates.push((breaks[i]! + breaks[i - 1]!) / 2);
      for (let at = Math.ceil((edge.lo + 1.5) * 2) / 2; at <= edge.hi - 1.5 + 1e-7; at += .5) candidates.push(at);
      candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
      for (const at of candidates) {
        const horizontal = edge.edge.startsWith('v');
        if (!entryFits(room, target, edge.edge, edge.c, at)) continue;
        door.edge = edge.edge; door.at = at; door.position = horizontal ? [at, edge.c] : [edge.c, at];
        door.width = 1.2; door.clearDepth = 0; fitted = true; break;
      }
      if (fitted) break;
    }
    if (!fitted) return false;
  }
  return true;
}

function entryFits(room: PlanRoom, target: PlanRoom, edge: EdgeName, c: number, at: number): boolean {
  const horizontal = edge.startsWith('v'), inward = edge.endsWith('0') ? 1 : -1;
  const zone = (sign: number, width: number, depth: number): UvRect => horizontal
    ? { u: at - width / 2, v: c + (sign * inward > 0 ? 0 : -depth), lu: width, lv: depth }
    : { u: c + (sign * inward > 0 ? 0 : -depth), v: at - width / 2, lu: depth, lv: width };
  return roomCoversRect(room, zone(1, 1.5, 1.25)) && roomCoversRect(target, zone(-1, 1.5, 1.25))
    && roomCoversRect(room, zone(1, 2.6, .25)) && roomCoversRect(target, zone(-1, 2.6, .25));
}

/** Prefer a planning-grid centre only when the full cassette and both approaches
 * remain valid. This avoids exact body-radius tangencies on the refined nav grid;
 * the canonical validator still proves the complete public and private domains. */
function alignEntryPhase(rooms: PlanRoom[]): void {
  const publicRooms = new Map(rooms.filter(room => !room.unit).map(room => [room.id, room]));
  for (const room of rooms.filter(room => room.unit)) for (const door of room.doors) {
    const target = publicRooms.get(door.to);
    if (!target || door.openFront || !door.position) continue;
    const horizontal = door.edge.startsWith('v'), c = door.position[horizontal ? 1 : 0];
    const candidates = [...new Set([Math.round(door.at * 4) / 4, Math.floor(door.at * 4) / 4, Math.ceil(door.at * 4) / 4])];
    for (const at of candidates) {
      if (!sharedRoomEdges(room, target).some(edge => edge.edge === door.edge && Math.abs(edge.c - c) < 1e-6
        && at - 1.3 >= edge.lo && at + 1.3 <= edge.hi)) continue;
      if (!entryFits(room, target, door.edge, c, at)) continue;
      door.at = at; door.position = horizontal ? [at, c] : [c, at]; door.clearDepth = 0; break;
    }
  }
}

/** Keep validated internal doors while rotating complete homes to every facade.
 * No room is re-fit with a generic centered door that loses its clear approach. */
const privatePrograms = new Map<string, PlanRoom[] | null>();
export const damagedStandardProgram: StandardUnitProgram = (rect, cuts, face, core, _ids) => {
  // Facade packing probes the same dimensions at many positions and on repeated
  // floors. Translate by half-metre increments before caching, preserving the
  // exact global door-snap phase as well as all clearance tests.
  const du = Math.floor(rect.u * 2) / 2, dv = Math.floor(rect.v * 2) / 2;
  const local = { ...rect, u: rect.u - du, v: rect.v - dv };
  const localCuts = cuts.filter(cut => cut > rect.u + 3 && cut < rect.u + rect.lu - 3).map(cut => cut - du);
  const key = [local.u, local.v, local.lu, local.lv, ...localCuts].map(value => value.toFixed(6)).join(':');
  if (!privatePrograms.has(key)) {
    if (privatePrograms.size > 1500) privatePrograms.clear();
    privatePrograms.set(key, damagedDwellingProgram(local, 'v1', uvRectCorners(local), localCuts, 'probe', idGen(0)));
  }
  const rooms = privatePrograms.get(key);
  if (!rooms) return null;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const outer = polygonBounds(uvRectCorners(rect).map(p => worldToUv(uvToWorld(p, face), core)));
  const low = [round(outer.x), round(outer.z)], high = [low[0]! + round(outer.w), low[1]! + round(outer.d)];
  const point = (p: Point): Point => {
    const transformed = worldToUv(uvToWorld([p[0] + du, p[1] + dv], face), core);
    // Match the packer's canonical origin + extent exactly. Rounding endpoints
    // independently can leave a one-micron gap and invalidate room ownership.
    return transformed.map((value, axis) => Math.abs(value - (axis ? outer.z : outer.x)) < 1e-6 ? low[axis]!
      : Math.abs(value - (axis ? outer.z + outer.d : outer.x + outer.w)) < 1e-6 ? high[axis]! : round(value)) as Point;
  };
  const quarter = ((Math.round((face.angleDeg - core.angleDeg) / 90) % 4) + 4) % 4;
  const edges: EdgeName[] = ['u1', 'v1', 'u0', 'v0'];
  return rooms.map(room => {
    const polygon = (room.polygon ?? uvRectCorners(room.rect)).map(point), b = polygonBounds(polygon);
    return { ...room, rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, polygon,
      holes: room.holes?.map(hole => hole.map(point)),
      doors: room.doors.map(door => {
        const r = room.rect;
        const local = door.position ?? (door.edge === 'u0' ? [r.u, door.at] : door.edge === 'u1' ? [r.u + r.lu, door.at]
          : door.edge === 'v0' ? [door.at, r.v] : [door.at, r.v + r.lv]) as Point;
        const at = point(local), edge = edges[(edges.indexOf(door.edge) + quarter) % 4]!;
        return { ...door, edge, at: edge.startsWith('v') ? at[0] : at[1], position: at };
      }),
    };
  });
};

/** A narrow gap beside a shaft exists only over their shared depth. Extending the
 * entire dwelling to close it moves its far facade partition off its legal pier.
 * Add the actual inaccessible sliver instead, preserving every original envelope.
 * This matters on the megablock's 0.4m setback: 24.78 is a legal pier, 24.9 is not. */
export function absorbDamagedSlivers(occupied: readonly UvRect[]): UvRect[] {
  const result = occupied.map(rect => ({ ...rect }));
  for (let i = 0; i < occupied.length; i++) for (let j = i + 1; j < occupied.length; j++) {
    const a = occupied[i]!, b = occupied[j]!;
    const vlo = Math.max(a.v, b.v), vhi = Math.min(a.v + a.lv, b.v + b.lv);
    if (vhi - vlo > 1e-6) {
      const [left, right] = a.u < b.u ? [a, b] : [b, a];
      const u = left.u + left.lu, gap = right.u - u;
      if (gap > 1e-6 && gap < BODY_CLEAR) result.push({ u, v: vlo, lu: gap, lv: vhi - vlo });
    }
    const ulo = Math.max(a.u, b.u), uhi = Math.min(a.u + a.lu, b.u + b.lu);
    if (uhi - ulo > 1e-6) {
      const [near, far] = a.v < b.v ? [a, b] : [b, a];
      const v = near.v + near.lv, gap = far.v - v;
      if (gap > 1e-6 && gap < BODY_CLEAR) result.push({ u: ulo, v, lu: uhi - ulo, lv: gap });
    }
  }
  return result;
}
