import type { Point } from "../core/geom.js";
import { pointInPolygon } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { FloorKind, FurnitureKind } from "../core/types.js";
import { DOOR } from "./constants.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import type { IdGen } from "./rooms.js";
import type { UvRect } from "./uv.js";

type Size3 = [number, number, number];

const SIZES: Record<string, Size3> = {
  bed_double: [1.6, 2.1, 0.55], bed_single: [1.0, 2.05, 0.55], wardrobe: [1.6, 0.65, 2.0],
  kitchen_block: [2.4, 0.65, 0.95], fridge: [0.7, 0.7, 1.8], sofa: [1.8, 0.85, 0.8],
  low_table: [0.9, 0.5, 0.4], dining_table: [0.9, 0.9, 0.75], chair: [0.45, 0.45, 0.9],
  toilet: [0.4, 0.65, 0.75], sink: [0.5, 0.45, 0.85], shower: [0.9, 0.9, 2.0],
  desk: [1.6, 0.8, 0.75], office_chair: [0.5, 0.5, 0.9], meeting_table: [2.8, 1.2, 0.75],
  shelf: [1.8, 0.5, 2.0], counter: [2.0, 0.7, 0.9], reception_desk: [2.6, 0.9, 1.1],
  bar_counter: [3.0, 0.65, 1.1], stool: [0.4, 0.4, 0.65], gym_machine: [1.2, 2.0, 1.5],
  bench: [1.8, 0.4, 0.45], plant: [0.5, 0.5, 1.4],
};

interface Footprint { u: number; v: number; lu: number; lv: number }

class RoomPlacer {
  private readonly blocked: Footprint[] = [];

  constructor(
    private readonly room: PlanRoom,
    private readonly rng: Rng,
    private readonly ids: IdGen,
    private readonly out: PlanFurniture[],
    doorChannels: Footprint[],
    private readonly uvOutline: readonly Point[],
  ) {
    this.blocked.push(...doorChannels);
  }

  /** Item with its back against a room edge; walks the edge from a seeded start. */
  alongEdge(kind: FurnitureKind, edge: "v0" | "v1" | "u0" | "u1"): boolean {
    const [su, sv] = [SIZES[kind]![0], SIZES[kind]![1]];
    const r = this.room.rect;
    const inset = 0.06;
    const alongLen = edge.startsWith("v") ? r.lu : r.lv;
    const itemAlong = edge.startsWith("v") ? su : su; // su is the item's along-wall dimension
    if (itemAlong > alongLen - 0.2) return false;
    const start = this.rng.range(0, Math.max(0.01, alongLen - itemAlong - 0.2));
    for (let off = 0; off <= alongLen - itemAlong - 0.1; off += 0.25) {
      const a = (start + off) % (alongLen - itemAlong - 0.1);
      const fp = edgeFootprint(r, edge, a + 0.1, su, sv, inset);
      if (this.fits(fp)) {
        this.commit(kind, fp, edgeRotation(edge));
        return true;
      }
    }
    return false;
  }

  /** First free edge among the candidates. */
  anyEdge(kind: FurnitureKind, edges: ("v0" | "v1" | "u0" | "u1")[] = ["v1", "u0", "u1", "v0"]): boolean {
    for (const e of edges) if (this.alongEdge(kind, e)) return true;
    return false;
  }

  center(kind: FurnitureKind): boolean {
    const [su, sv] = [SIZES[kind]![0], SIZES[kind]![1]];
    const r = this.room.rect;
    const fp: Footprint = { u: r.u + (r.lu - su) / 2, v: r.v + (r.lv - sv) / 2, lu: su, lv: sv };
    if (!this.fits(fp)) return false;
    this.commit(kind, fp, 0);
    return true;
  }

  /** Regular grid of identical items with aisles, e.g. desks, diner tables, machines. */
  grid(kind: FurnitureKind, aisle: number, max: number): number {
    const [su, sv] = [SIZES[kind]![0], SIZES[kind]![1]];
    const r = this.room.rect;
    const margin = 0.8;
    let placed = 0;
    for (let v = r.v + margin; v + sv <= r.v + r.lv - margin && placed < max; v += sv + aisle) {
      for (let u = r.u + margin; u + su <= r.u + r.lu - margin && placed < max; u += su + aisle) {
        const fp: Footprint = { u, v, lu: su, lv: sv };
        if (this.fits(fp)) {
          this.commit(kind, fp, 0);
          placed++;
        }
      }
    }
    return placed;
  }

  private fits(fp: Footprint): boolean {
    const r = this.room.rect;
    if (fp.u < r.u + 0.05 || fp.v < r.v + 0.05 || fp.u + fp.lu > r.u + r.lu - 0.05 || fp.v + fp.lv > r.v + r.lv - 0.05) {
      return false;
    }
    // rooms at the facade may be outline-clipped; furniture must stay inside the building
    const corners: Point[] = [
      [fp.u, fp.v], [fp.u + fp.lu, fp.v], [fp.u + fp.lu, fp.v + fp.lv], [fp.u, fp.v + fp.lv],
    ];
    if (!corners.every((c) => pointInPolygon(c, this.uvOutline))) return false;
    const gap = 0.15;
    return this.blocked.every(
      (b) => fp.u + fp.lu + gap <= b.u || b.u + b.lu + gap <= fp.u || fp.v + fp.lv + gap <= b.v || b.v + b.lv + gap <= fp.v,
    );
  }

  private commit(kind: FurnitureKind, fp: Footprint, rotationDeg: 0 | 90 | 180 | 270): void {
    this.blocked.push(fp);
    const size = SIZES[kind]!;
    this.out.push({
      id: this.ids.furniture(), kind, room: this.room.id,
      at: [fp.u + fp.lu / 2, fp.v + fp.lv / 2] as Point,
      rotationDeg, size,
    });
  }
}

function edgeFootprint(r: UvRect, edge: string, along: number, su: number, sv: number, inset: number): Footprint {
  switch (edge) {
    case "v0": return { u: r.u + along, v: r.v + inset, lu: su, lv: sv };
    case "v1": return { u: r.u + along, v: r.v + r.lv - sv - inset, lu: su, lv: sv };
    case "u0": return { u: r.u + inset, v: r.v + along, lu: sv, lv: su };
    default: return { u: r.u + r.lu - sv - inset, v: r.v + along, lu: sv, lv: su };
  }
}

function edgeRotation(edge: string): 0 | 90 | 180 | 270 {
  // item faces away from its back wall
  switch (edge) {
    case "v0": return 0;
    case "v1": return 180;
    case "u0": return 90;
    default: return 270;
  }
}

/** Door keep-clear channels per room (own doors and doors opening into it). */
function doorChannelsByRoom(rooms: PlanRoom[]): Map<string, Footprint[]> {
  const map = new Map<string, Footprint[]>();
  const add = (roomId: string, fp: Footprint) => {
    const list = map.get(roomId) ?? [];
    list.push(fp);
    map.set(roomId, list);
  };
  for (const room of rooms) {
    for (const door of room.doors) {
      const [u, v] = doorUvPoint(door, room);
      const across = DOOR.clearance;
      const fp: Footprint = door.edge.startsWith("v")
        ? { u: u - door.width / 2, v: v - across, lu: door.width, lv: 2 * across }
        : { u: u - across, v: v - door.width / 2, lu: 2 * across, lv: door.width };
      add(room.id, fp);
      if (door.to !== "outside") add(door.to, fp);
    }
  }
  return map;
}

export function furnish(
  rooms: PlanRoom[], floorKind: FloorKind, rng: Rng, ids: IdGen, uvOutline: readonly Point[],
): PlanFurniture[] {
  const out: PlanFurniture[] = [];
  const channels = doorChannelsByRoom(rooms);
  for (const room of rooms) {
    const p = new RoomPlacer(room, rng, ids, out, channels.get(room.id) ?? [], uvOutline);
    const area = room.rect.lu * room.rect.lv;
    switch (room.kind) {
      case "studio_main":
        p.anyEdge("bed_double");
        p.anyEdge("kitchen_block");
        p.anyEdge("wardrobe");
        if (area >= 18) { p.anyEdge("sofa"); p.center("low_table"); }
        break;
      case "bedroom":
        p.anyEdge(area >= 9 ? "bed_double" : "bed_single");
        p.anyEdge("wardrobe");
        break;
      case "living":
        if (area >= 10) { p.anyEdge("sofa"); p.center("low_table"); }
        if (area >= 16) { p.grid("dining_table", 1.2, 1); }
        break;
      case "kitchen":
        p.anyEdge("kitchen_block");
        p.anyEdge("fridge");
        if (area >= 14) { p.anyEdge("counter"); p.anyEdge("counter"); p.anyEdge("shelf"); }
        break;
      case "bathroom":
        p.anyEdge("toilet");
        p.anyEdge("sink");
        if (area >= 3.6) p.anyEdge("shower");
        break;
      case "toilets":
        p.anyEdge("toilet"); p.anyEdge("toilet"); p.anyEdge("sink");
        break;
      case "office_open":
        p.grid("desk", 1.3, Math.max(2, Math.floor(area / 11)));
        p.anyEdge("plant");
        break;
      case "meeting":
        p.center("meeting_table");
        break;
      case "office_private":
      case "executive_office":
        p.anyEdge("desk");
        p.anyEdge("shelf");
        break;
      case "reception":
        p.anyEdge("reception_desk", ["v1", "u1", "u0"]);
        p.anyEdge("sofa");
        p.center("low_table");
        p.anyEdge("plant"); p.anyEdge("plant");
        break;
      case "dining_area":
        p.anyEdge("bar_counter", ["v1", "u1", "u0"]);
        p.grid("dining_table", 1.4, Math.floor(area / 9));
        break;
      case "gym_floor":
        p.grid("gym_machine", 1.2, Math.floor(area / 12));
        p.anyEdge("bench");
        break;
      case "locker_room":
        p.anyEdge("bench"); p.anyEdge("bench"); p.anyEdge("shelf");
        break;
      case "storage":
      case "mechanical_room":
        p.anyEdge("shelf");
        if (area >= 12) p.anyEdge("shelf");
        break;
      case "terrace_open":
        p.grid("dining_table", 1.8, Math.floor(area / 16));
        p.anyEdge("plant");
        break;
      default:
        break; // corridors, lobbies, halls without furniture, parking
    }
    void floorKind;
  }
  return out;
}
