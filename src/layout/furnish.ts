import type { Point } from "../core/geom.js";
import { pointInPolygon } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { FloorKind, FurnitureKind } from "../core/types.js";
import { doorZonesByRoom } from "./clearance.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import type { IdGen } from "./rooms.js";
import type { FloorBounds } from "./shell.js";
import type { UvRect } from "./uv.js";

type Size3 = [number, number, number];
type Edge = "v0" | "v1" | "u0" | "u1";

const SIZES: Record<FurnitureKind, Size3> = {
  bed_double: [1.6, 2.1, 0.55], bed_single: [1.0, 2.05, 0.55], wardrobe: [1.6, 0.65, 2.0],
  kitchen_block: [2.4, 0.65, 0.95], fridge: [0.7, 0.7, 1.8], sofa: [1.8, 0.85, 0.8],
  low_table: [0.9, 0.5, 0.4], dining_table: [0.9, 0.9, 0.75], chair: [0.45, 0.45, 0.9],
  toilet: [0.4, 0.65, 0.75], sink: [0.5, 0.45, 0.85], shower: [0.9, 0.9, 2.0],
  desk: [1.6, 0.8, 0.75], office_chair: [0.5, 0.5, 0.9], meeting_table: [2.8, 1.2, 0.75],
  shelf: [1.8, 0.5, 2.0], counter: [2.0, 0.7, 0.9], reception_desk: [2.6, 0.9, 1.1],
  bar_counter: [3.0, 0.65, 1.1], stool: [0.4, 0.4, 0.65], gym_machine: [1.2, 2.0, 1.5],
  bench: [1.8, 0.4, 0.45], plant: [0.5, 0.5, 1.4], display_rack: [1.4, 0.6, 1.6],
  wall_shelf: [1.2, 0.28, 0.4], display_screen: [1.2, 0.08, 0.7], wall_art: [0.9, 0.06, 0.7],
  crate: [0.62, 0.62, 0.55],
};

/** Pieces that hang on a wall, and how high their base sits. */
const MOUNT: Partial<Record<FurnitureKind, number>> = {
  wall_shelf: 1.35, display_screen: 1.45, wall_art: 1.5,
};

/** Staff furniture stands off its wall so a vendor or receptionist fits behind it. */
const STANDOFF: Partial<Record<FurnitureKind, number>> = { bar_counter: 0.9, reception_desk: 0.9, counter: 0.9 };

/** A very large plate would otherwise fill with hundreds of identical pieces: enough to read
 *  as a working floor, cheap enough to carry a whole city. */
const GRID_CAP: Partial<Record<FurnitureKind, number>> = {
  desk: 24, dining_table: 18, gym_machine: 14, display_rack: 10, crate: 6,
};

const SEAT_GAP = 0.1; // a pulled-in chair, still clear of the table's nav margin
const STOOL_PITCH = 0.7;

const SEATS: ReadonlySet<FurnitureKind> = new Set(["chair", "stool", "office_chair"]);

class RoomPlacer {
  private readonly blocked: UvRect[] = [];
  /** footprint per placed piece, so a seat may pull up to its own table */
  private readonly rects = new Map<string, UvRect>();
  /** the room rect with its facade sides pulled in to the lining's inner face */
  private readonly rect: UvRect;

  constructor(
    private readonly room: PlanRoom,
    private readonly rng: Rng,
    private readonly ids: IdGen,
    private readonly out: PlanFurniture[],
    doorZones: UvRect[],
    openingZones: readonly UvRect[],
    private readonly bounds: FloorBounds,
  ) {
    this.blocked.push(...doorZones, ...openingZones);
    this.rect = usableRect(room.rect, (edge) => this.isFacade(edge), bounds.facadeDepth);
  }

  /** Item with its back against a room edge; walks the edge from a seeded start. */
  alongEdge(kind: FurnitureKind, edge: Edge): PlanFurniture | null {
    const [su, sv] = [SIZES[kind][0], SIZES[kind][1]];
    const r = this.rect;
    const inset = 0.06 + (STANDOFF[kind] ?? 0);
    const alongLen = edge.startsWith("v") ? r.lu : r.lv;
    if (su > alongLen - 0.2) return null;
    const start = this.rng.range(0, Math.max(0.01, alongLen - su - 0.2));
    for (let off = 0; off <= alongLen - su - 0.1; off += 0.25) {
      const a = (start + off) % (alongLen - su - 0.1);
      const fp = edgeFootprint(r, edge, a + 0.1, su, sv, inset);
      if (this.fits(fp, kind)) return this.commit(kind, fp, edgeRotation(edge));
    }
    return null;
  }

  /** First free edge among the candidates; walls carrying a door are tried last so big
   *  pieces keep the entry side clear. */
  anyEdge(kind: FurnitureKind, edges: Edge[] = ["v1", "u0", "u1", "v0"]): PlanFurniture | null {
    const doorEdges = new Set(this.room.doors.map((d) => d.edge));
    const ordered = [...edges].sort((a, b) => Number(doorEdges.has(a)) - Number(doorEdges.has(b)));
    for (const e of ordered) {
      const placed = this.alongEdge(kind, e);
      if (placed) return placed;
    }
    return null;
  }

  /** Wall piece: hung on a solid wall, never across the facade glass. */
  wallPiece(kind: FurnitureKind, edges: Edge[] = ["v1", "u0", "u1", "v0"]): PlanFurniture | null {
    for (const e of edges) {
      if (this.isFacade(e)) continue;
      const placed = this.alongEdge(kind, e);
      if (placed) return placed;
    }
    return null;
  }

  center(kind: FurnitureKind): PlanFurniture | null {
    const [su, sv] = [SIZES[kind][0], SIZES[kind][1]];
    const r = this.rect;
    const fp: UvRect = { u: r.u + (r.lu - su) / 2, v: r.v + (r.lv - sv) / 2, lu: su, lv: sv };
    return this.fits(fp, kind) ? this.commit(kind, fp, 0) : null;
  }

  /** Regular grid of identical items with aisles, e.g. desks, diner tables, machines. */
  grid(kind: FurnitureKind, aisle: number, max: number): PlanFurniture[] {
    const [su, sv] = [SIZES[kind][0], SIZES[kind][1]];
    const r = this.rect;
    const margin = 0.8;
    const limit = Math.min(max, GRID_CAP[kind] ?? max);
    const placed: PlanFurniture[] = [];
    for (let v = r.v + margin; v + sv <= r.v + r.lv - margin && placed.length < limit; v += sv + aisle) {
      for (let u = r.u + margin; u + su <= r.u + r.lu - margin && placed.length < limit; u += su + aisle) {
        const fp: UvRect = { u, v, lu: su, lv: sv };
        if (this.fits(fp, kind)) placed.push(this.commit(kind, fp, 0));
      }
    }
    return placed;
  }

  /** Chairs pulled in around a table, as many sides as the room allows. */
  seatsAround(
    table: PlanFurniture, kind: "chair" | "office_chair", perSide = 1,
    sides: readonly (0 | 90 | 180 | 270)[] = [0, 180, 90, 270],
  ): void {
    const fp = footprintOf(table);
    const own = this.rects.get(table.id);
    const [cw, cd] = [SIZES[kind][0], SIZES[kind][1]];
    for (const rot of sides) {
      const span = rot % 180 === 0 ? fp.lu : fp.lv;
      const seats = Math.max(1, Math.min(perSide, Math.floor(span / (cw + 0.15))));
      for (let i = 0; i < seats; i++) {
        const rect = seatFootprint(fp, rot, (span * (i + 0.5)) / seats, cw, cd);
        // the side code doubles as the seat's own facing: it looks back at the table
        if (this.fits(rect, kind, own)) this.commit(kind, rect, rot);
      }
    }
  }

  /** One chair on the working side of a piece, e.g. a task chair at a desk. */
  seatAt(item: PlanFurniture, kind: "chair" | "office_chair"): void {
    const fp = footprintOf(item);
    const [cw, cd] = [SIZES[kind][0], SIZES[kind][1]];
    const side = oppositeRotation(item.rotationDeg);
    const span = side % 180 === 0 ? fp.lu : fp.lv;
    const rect = seatFootprint(fp, side, span / 2, cw, cd);
    if (this.fits(rect, kind, this.rects.get(item.id))) this.commit(kind, rect, side);
  }

  /** Stools along the customer side of a counter. */
  stoolsAt(counter: PlanFurniture, max: number): void {
    const fp = footprintOf(counter);
    const [sw, sd] = [SIZES.stool[0], SIZES.stool[1]];
    const side = oppositeRotation(counter.rotationDeg);
    const span = side % 180 === 0 ? fp.lu : fp.lv;
    const seats = Math.max(1, Math.min(max, Math.floor(span / STOOL_PITCH)));
    for (let i = 0; i < seats; i++) {
      const rect = seatFootprint(fp, side, (span * (i + 0.5)) / seats, sw, sd, 0.18);
      if (this.fits(rect, "stool", this.rects.get(counter.id))) this.commit("stool", rect, side);
    }
  }

  private fits(fp: UvRect, kind: FurnitureKind, except?: UvRect): boolean {
    const r = this.rect;
    if (fp.u < r.u + 0.05 || fp.v < r.v + 0.05 || fp.u + fp.lu > r.u + r.lu - 0.05 || fp.v + fp.lv > r.v + r.lv - 0.05) {
      return false;
    }
    // rooms at the facade may be outline-clipped; furniture stays behind the facade lining
    const corners: Point[] = [
      [fp.u, fp.v], [fp.u + fp.lu, fp.v], [fp.u + fp.lu, fp.v + fp.lv], [fp.u, fp.v + fp.lv],
    ];
    if (!corners.every((c) => pointInPolygon(c, this.bounds.inner))) return false;
    const gap = MOUNT[kind] ? 0.05 : SEATS.has(kind) ? 0.06 : 0.15;
    return this.blocked.every(
      (b) => b === except
        || fp.u + fp.lu + gap <= b.u || b.u + b.lu + gap <= fp.u
        || fp.v + fp.lv + gap <= b.v || b.v + b.lv + gap <= fp.v,
    );
  }

  private commit(kind: FurnitureKind, fp: UvRect, rotationDeg: 0 | 90 | 180 | 270): PlanFurniture {
    this.blocked.push(fp);
    const mount = MOUNT[kind];
    const item: PlanFurniture = {
      id: this.ids.furniture(), kind, room: this.room.id,
      at: [fp.u + fp.lu / 2, fp.v + fp.lv / 2] as Point,
      rotationDeg, size: SIZES[kind],
      ...(mount === undefined ? {} : { elevation: mount }),
    };
    this.out.push(item);
    this.rects.set(item.id, fp);
    return item;
  }

  /** True when that edge of the room sits on the building outline: a facade, likely glazed. */
  private isFacade(edge: Edge): boolean {
    const r = this.room.rect;
    const mid: Point = edge === "v0" ? [r.u + r.lu / 2, r.v]
      : edge === "v1" ? [r.u + r.lu / 2, r.v + r.lv]
      : edge === "u0" ? [r.u, r.v + r.lv / 2]
      : [r.u + r.lu, r.v + r.lv / 2];
    return nearBoundary(mid, this.bounds.outline, 0.25);
  }
}

function usableRect(r: UvRect, isFacade: (edge: Edge) => boolean, depth: number): UvRect {
  const v0 = isFacade("v0") ? depth : 0;
  const v1 = isFacade("v1") ? depth : 0;
  const u0 = isFacade("u0") ? depth : 0;
  const u1 = isFacade("u1") ? depth : 0;
  return { u: r.u + u0, v: r.v + v0, lu: Math.max(0, r.lu - u0 - u1), lv: Math.max(0, r.lv - v0 - v1) };
}

function footprintOf(item: PlanFurniture): UvRect {
  const swap = item.rotationDeg === 90 || item.rotationDeg === 270;
  const lu = swap ? item.size[1] : item.size[0];
  const lv = swap ? item.size[0] : item.size[1];
  return { u: item.at[0] - lu / 2, v: item.at[1] - lv / 2, lu, lv };
}

/** Footprint of a seat pulled up to one side of a piece; `rot` names the side, `at` runs
 *  along it. The seat itself faces back toward the piece. */
function seatFootprint(fp: UvRect, rot: number, at: number, w: number, d: number, gap = SEAT_GAP): UvRect {
  switch (rot) {
    case 0: return { u: fp.u + at - w / 2, v: fp.v - gap - d, lu: w, lv: d };
    case 180: return { u: fp.u + at - w / 2, v: fp.v + fp.lv + gap, lu: w, lv: d };
    case 90: return { u: fp.u - gap - d, v: fp.v + at - w / 2, lu: d, lv: w };
    default: return { u: fp.u + fp.lu + gap, v: fp.v + at - w / 2, lu: d, lv: w };
  }
}

function oppositeRotation(rot: number): 0 | 90 | 180 | 270 {
  return ((((rot + 180) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

function nearBoundary(p: Point, outline: readonly Point[], eps: number): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
    if (Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t)) < eps) return true;
  }
  return false;
}

function edgeFootprint(r: UvRect, edge: Edge, along: number, su: number, sv: number, inset: number): UvRect {
  switch (edge) {
    case "v0": return { u: r.u + along, v: r.v + inset, lu: su, lv: sv };
    case "v1": return { u: r.u + along, v: r.v + r.lv - sv - inset, lu: su, lv: sv };
    case "u0": return { u: r.u + inset, v: r.v + along, lu: sv, lv: su };
    default: return { u: r.u + r.lu - sv - inset, v: r.v + along, lu: sv, lv: su };
  }
}

function edgeRotation(edge: Edge): 0 | 90 | 180 | 270 {
  // item faces away from its back wall
  switch (edge) {
    case "v0": return 0;
    case "v1": return 180;
    case "u0": return 90;
    default: return 270;
  }
}

export function furnish(
  rooms: PlanRoom[], floorKind: FloorKind, rng: Rng, ids: IdGen, bounds: FloorBounds,
  openingZones: readonly UvRect[] = [],
): PlanFurniture[] {
  const out: PlanFurniture[] = [];
  const zones = doorZonesByRoom(rooms);
  for (const room of rooms) {
    const p = new RoomPlacer(
      room, rng, ids, out, (zones.get(room.id) ?? []).map((z) => z.rect), openingZones, bounds,
    );
    const area = room.rect.lu * room.rect.lv;
    switch (room.kind) {
      case "studio_main":
        // clipped wedge rooms often have no straight wall for the bed: fall back to open floor
        if (!p.anyEdge("bed_double")) p.grid("bed_double", 0.6, 1);
        p.anyEdge("kitchen_block");
        p.anyEdge("wardrobe");
        if (area >= 18) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        p.wallPiece("wall_art");
        break;
      case "bedroom": {
        const bed = area >= 9 ? "bed_double" as const : "bed_single" as const;
        if (!p.anyEdge(bed)) p.grid(bed, 0.6, 1);
        p.anyEdge("wardrobe");
        p.wallPiece("wall_art");
        break;
      }
      case "living":
        if (area >= 10) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        if (area >= 16) {
          for (const table of p.grid("dining_table", 1.2, 1)) p.seatsAround(table, "chair");
        }
        p.wallPiece("display_screen");
        break;
      case "kitchen":
        p.anyEdge("kitchen_block");
        p.anyEdge("fridge");
        if (area >= 14) {
          p.anyEdge("counter");
          p.anyEdge("counter");
          p.anyEdge("shelf");
        }
        p.wallPiece("wall_shelf");
        break;
      case "bathroom":
        p.anyEdge("toilet");
        p.anyEdge("sink");
        if (area >= 3.6) p.anyEdge("shower");
        break;
      case "toilets":
        p.anyEdge("toilet");
        p.anyEdge("toilet");
        p.anyEdge("sink");
        break;
      case "office_open":
        for (const d of p.grid("desk", 1.3, Math.max(2, Math.floor(area / 11)))) p.seatAt(d, "office_chair");
        p.anyEdge("plant");
        p.wallPiece("wall_art");
        break;
      case "meeting": {
        const table = p.center("meeting_table");
        if (table) p.seatsAround(table, "chair", 3, [0, 180]);
        p.wallPiece("display_screen");
        break;
      }
      case "office_private":
      case "executive_office": {
        const workstation = p.anyEdge("desk");
        if (workstation) p.seatAt(workstation, "office_chair");
        p.anyEdge("shelf");
        p.wallPiece("wall_art");
        break;
      }
      case "reception": {
        const desk = p.anyEdge("reception_desk", ["v1", "u1", "u0"]);
        if (desk) p.seatAt(desk, "office_chair");
        p.anyEdge("sofa");
        p.center("low_table");
        p.anyEdge("plant");
        p.anyEdge("plant");
        p.wallPiece("display_screen");
        p.wallPiece("wall_art");
        break;
      }
      case "dining_area":
      case "bar": {
        const bar = p.anyEdge("bar_counter", ["v1", "u1", "u0"]);
        if (bar) p.stoolsAt(bar, 4);
        for (const table of p.grid("dining_table", 1.4, Math.floor(area / 9))) {
          p.seatsAround(table, "chair", 1, [0, 180]);
        }
        p.wallPiece("display_screen");
        p.wallPiece("wall_art");
        break;
      }
      case "counter_area": {
        const service = p.anyEdge("counter", ["v1", "u1", "u0"]);
        if (service) p.stoolsAt(service, 3);
        p.wallPiece("display_screen");
        break;
      }
      case "sales_floor":
        // checkout against a wall (the clerk stands behind it), shelving on the walls,
        // display racks in aisles across the open floor
        p.anyEdge("counter", ["v1", "u1", "u0"]);
        p.anyEdge("shelf");
        p.anyEdge("shelf");
        if (area >= 24) p.anyEdge("shelf");
        p.grid("display_rack", 1.5, Math.max(1, Math.floor(area / 14)));
        p.wallPiece("display_screen");
        p.wallPiece("wall_shelf");
        break;
      case "gym_floor":
        p.grid("gym_machine", 1.2, Math.floor(area / 12));
        p.anyEdge("bench");
        p.wallPiece("display_screen");
        break;
      case "locker_room":
        p.anyEdge("bench");
        p.anyEdge("bench");
        p.anyEdge("shelf");
        break;
      case "storage":
      case "mechanical_room":
        p.anyEdge("shelf");
        if (area >= 12) p.anyEdge("shelf");
        p.grid("crate", 0.9, Math.max(1, Math.floor(area / 8)));
        break;
      case "parking_area":
        p.grid("crate", 2.5, Math.max(1, Math.floor(area / 120)));
        break;
      case "terrace_open":
        for (const table of p.grid("dining_table", 1.8, Math.floor(area / 16))) p.seatsAround(table, "chair");
        p.anyEdge("plant");
        break;
      case "lounge":
        p.anyEdge("sofa");
        p.center("low_table");
        p.anyEdge("plant");
        p.wallPiece("wall_art");
        break;
      case "concourse":
        p.wallPiece("display_screen");
        break;
      default:
        break; // corridors, lobbies, halls without furniture, parking
    }
    void floorKind;
  }
  return out;
}
