import type { Point } from "../core/geom.js";
import { clipPolygonToRect, pointInPolygon, polygonBounds } from "../core/geom.js";
import type { LightFixture, RoomKind } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import type { PlanRoom } from "./plan-types.js";
import type { IdGen } from "./rooms.js";
import type { Frame, UvRect } from "./uv.js";
import { uvToWorld } from "./uv.js";

/** Every room, corridor and stairwell emits its own light fixtures: the engine instantiates
 *  real lights from them and the geometry pass builds the matching emissive housings. */

const CEILING_GAP = 0.04; // fixture face hangs this far under the ceiling plane
const COVE_DROP = 0.2; // cove line below the ceiling
const COVE_INSET = 0.1; // cove line off the wall face
const MIN_RUN = 0.8; // shorter than this and a strip becomes a spot
const STRIP_MAX = 3.0; // a luminaire is a fixture, not a room-long bar
const STRIP_FILL = 0.8; // share of its slot a strip covers
const MAX_PER_ROOM = 10;
const MIN_COVE_SIDE = 2.0;
const COVE_SEGMENT = 6.0; // cove segments abut, so a long wall reads as one line
const COVE_MAX_PER_SIDE = 8;

interface LightStyle {
  /** ceiling fixture shape: a linear strip or a downlight */
  fixture: "strip" | "spot";
  /** meters between fixture rows (strips) or points (spots) */
  spacing: number;
  /** luminous flux per fixture, lumens */
  lumens: number;
  colorTemperatureK: number;
  /** emissive line at the wall-ceiling junction */
  cove: boolean;
}

const WORK = { fixture: "strip", spacing: 3.0, lumens: 3600, colorTemperatureK: 4000, cove: false } as const;
const PUBLIC = { fixture: "strip", spacing: 3.2, lumens: 3200, colorTemperatureK: 3500, cove: true } as const;
const WARM = { fixture: "spot", spacing: 2.6, lumens: 900, colorTemperatureK: 2700, cove: false } as const;
const SERVICE = { fixture: "spot", spacing: 3.6, lumens: 1100, colorTemperatureK: 4000, cove: false } as const;
const WET = { fixture: "spot", spacing: 2.4, lumens: 1200, colorTemperatureK: 4500, cove: false } as const;

const STYLE: Record<RoomKind, LightStyle> = {
  corridor: { fixture: "spot", spacing: 3.0, lumens: 1200, colorTemperatureK: 4000, cove: false },
  elevator_lobby: { fixture: "spot", spacing: 2.8, lumens: 1500, colorTemperatureK: 3800, cove: true },
  concourse: { ...PUBLIC, spacing: 3.6, lumens: 4000 },
  reception: PUBLIC,
  lounge: { ...PUBLIC, lumens: 2400, colorTemperatureK: 3000 },
  office_open: WORK,
  office_private: WORK,
  meeting: { ...WORK, lumens: 3000 },
  executive_office: { ...WORK, spacing: 3.2, colorTemperatureK: 3500 },
  dining_area: { ...PUBLIC, lumens: 2600, colorTemperatureK: 3000 },
  bar: { ...PUBLIC, lumens: 2000, colorTemperatureK: 2700 },
  counter_area: { ...PUBLIC, lumens: 2800, colorTemperatureK: 3200 },
  kitchen: { ...WET, fixture: "strip", spacing: 2.8, lumens: 3400, colorTemperatureK: 5000 },
  sales_floor: { ...PUBLIC, spacing: 2.8, lumens: 3600, colorTemperatureK: 4000 },
  bedroom: WARM,
  living: { ...WARM, lumens: 1200 },
  studio_main: { ...WARM, lumens: 1200 },
  bathroom: WET,
  toilets: WET,
  gym_floor: { ...WORK, spacing: 3.4, lumens: 4200, colorTemperatureK: 5000 },
  locker_room: { ...SERVICE, lumens: 1400 },
  storage: SERVICE,
  mechanical_room: SERVICE,
  terrace_open: { ...WARM, spacing: 4.0, lumens: 700 },
  parking_area: { fixture: "strip", spacing: 5.0, lumens: 2600, colorTemperatureK: 4000, cove: false },
};

/** Stairwells get one downlight per storey, at the head of the flight. */
const STAIR_LIGHT = { lumens: 1600, colorTemperatureK: 4000 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Useful radius: a lumen budget spread over a hemisphere reads about this far. */
function rangeOf(lumens: number): number {
  return round3(clamp(Math.sqrt(lumens) / 8, 2, 12));
}

class FloorLighting {
  private readonly out: LightFixture[] = [];

  constructor(
    private readonly ids: IdGen,
    private readonly frame: Frame,
    private readonly uvOutline: readonly Point[],
    private readonly ceilingY: number,
  ) {}

  fixtures(): LightFixture[] {
    return this.out;
  }

  room(room: PlanRoom): void {
    const style = STYLE[room.kind];
    if (!style) return;
    const before = this.out.length;
    if (style.fixture === "strip") this.strips(room, style);
    else this.spots(room, style);
    if (style.cove) this.cove(room, style);
    // no room stays dark: a clipped plate still gets one downlight where it has floor
    if (this.out.length === before) {
      this.spotAt(room.id, this.insideCenter(room.rect), style.lumens, style.colorTemperatureK, true);
    }
  }

  /** One downlight per storey inside a stair shaft, at the walk-in end. */
  stairwell(id: string, shaft: UvRect): void {
    this.spotAt(id, center(shaft), STAIR_LIGHT.lumens, STAIR_LIGHT.colorTemperatureK, true);
  }

  /** A row of luminaires per aisle, spaced along the room's long axis. */
  private strips(room: PlanRoom, style: LightStyle): void {
    const r = room.rect;
    const alongU = r.lu >= r.lv;
    const runLen = alongU ? r.lu : r.lv;
    const crossLen = alongU ? r.lv : r.lu;
    if (runLen < MIN_RUN) return;
    const rows = clamp(Math.round(crossLen / style.spacing), 1, 3);
    const cols = clamp(Math.round(runLen / style.spacing), 1, Math.floor(MAX_PER_ROOM / rows));
    const slot = runLen / cols;
    const length = Math.max(MIN_RUN, Math.min(STRIP_MAX, slot * STRIP_FILL));
    for (let row = 0; row < rows; row++) {
      const cross = (alongU ? r.v : r.u) + (crossLen * (row + 0.5)) / rows;
      for (let col = 0; col < cols; col++) {
        const runMid = (alongU ? r.u : r.v) + slot * (col + 0.5);
        const at: Point = alongU ? [runMid, cross] : [cross, runMid];
        const half = length / 2;
        const ends: [Point, Point] = alongU
          ? [[runMid - half, cross], [runMid + half, cross]]
          : [[cross, runMid - half], [cross, runMid + half]];
        if (!this.inside(ends[0]) || !this.inside(ends[1])) {
          this.spotAt(room.id, at, style.lumens / 2, style.colorTemperatureK);
          continue;
        }
        this.push({
          kind: "strip", room: room.id, at, y: this.ceilingY - CEILING_GAP,
          length, angleDeg: alongU ? 0 : 90,
          lumens: style.lumens, colorTemperatureK: style.colorTemperatureK,
        });
      }
    }
  }

  private spots(room: PlanRoom, style: LightStyle): void {
    const r = room.rect;
    const alongU = r.lu >= r.lv;
    const long = clamp(Math.round((alongU ? r.lu : r.lv) / style.spacing), 1, MAX_PER_ROOM);
    const short = clamp(Math.round((alongU ? r.lv : r.lu) / style.spacing), 1, 3);
    const cols = alongU ? long : short;
    const rows = alongU ? short : long;
    const total = Math.min(cols * rows, MAX_PER_ROOM);
    let placed = 0;
    for (let row = 0; row < rows && placed < total; row++) {
      for (let col = 0; col < cols && placed < total; col++) {
        const at: Point = [
          r.u + (r.lu * (col + 0.5)) / cols,
          r.v + (r.lv * (row + 0.5)) / rows,
        ];
        if (!this.inside(at)) continue;
        this.spotAt(room.id, at, style.lumens, style.colorTemperatureK);
        placed++;
      }
    }
  }

  /** Emissive line where wall meets ceiling: the venue look from the reference. */
  private cove(room: PlanRoom, style: LightStyle): void {
    const r = room.rect;
    const sides: { at: Point; length: number; angleDeg: 0 | 90 }[] = [
      { at: [r.u + r.lu / 2, r.v + COVE_INSET], length: r.lu - 2 * COVE_INSET, angleDeg: 0 },
      { at: [r.u + r.lu / 2, r.v + r.lv - COVE_INSET], length: r.lu - 2 * COVE_INSET, angleDeg: 0 },
      { at: [r.u + COVE_INSET, r.v + r.lv / 2], length: r.lv - 2 * COVE_INSET, angleDeg: 90 },
      { at: [r.u + r.lu - COVE_INSET, r.v + r.lv / 2], length: r.lv - 2 * COVE_INSET, angleDeg: 90 },
    ];
    for (const side of sides) {
      if (side.length < MIN_COVE_SIDE) continue;
      // abutting segments: the line reads continuous, each piece stays a sane light source
      const pieces = clamp(Math.ceil(side.length / COVE_SEGMENT), 1, COVE_MAX_PER_SIDE);
      const length = side.length / pieces;
      for (let i = 0; i < pieces; i++) {
        const offset = -side.length / 2 + length * (i + 0.5);
        const at: Point = side.angleDeg === 0
          ? [side.at[0] + offset, side.at[1]]
          : [side.at[0], side.at[1] + offset];
        const half = length / 2;
        const ends: [Point, Point] = side.angleDeg === 0
          ? [[at[0] - half, at[1]], [at[0] + half, at[1]]]
          : [[at[0], at[1] - half], [at[0], at[1] + half]];
        if (!this.inside(ends[0]) || !this.inside(ends[1])) continue;
        this.push({
          kind: "cove", room: room.id, at, y: this.ceilingY - COVE_DROP,
          length, angleDeg: side.angleDeg,
          lumens: Math.round(length * 220), colorTemperatureK: style.colorTemperatureK,
        });
      }
    }
  }

  private spotAt(room: string, at: Point, lumens: number, colorTemperatureK: number, force = false): void {
    if (!force && !this.inside(at)) return;
    this.push({ kind: "spot", room, at, y: this.ceilingY - CEILING_GAP, length: 0, angleDeg: 0, lumens, colorTemperatureK });
  }

  private inside(p: Point): boolean {
    return pointInPolygon(p, this.uvOutline);
  }

  /** A point of the rect that is really inside the outline; irregular plates cut room rects. */
  private insideCenter(r: UvRect): Point {
    const c = center(r);
    if (this.inside(c)) return c;
    const clipped = clipPolygonToRect(this.uvOutline, { x: r.u, z: r.v, w: r.lu, d: r.lv });
    if (clipped.length < 3) return c;
    const b = polygonBounds(clipped);
    const mid: Point = [b.x + b.w / 2, b.z + b.d / 2];
    return this.inside(mid) ? mid : clipped[0]!;
  }

  private push(f: {
    kind: LightFixture["kind"]; room: string; at: Point; y: number; length: number;
    angleDeg: number; lumens: number; colorTemperatureK: number;
  }): void {
    const [x, z] = uvToWorld(f.at, this.frame);
    this.out.push({
      id: this.ids.light(),
      kind: f.kind,
      room: f.room,
      position: [round3(x), round3(f.y), round3(z)],
      length: round3(f.length),
      angleDeg: round3(((f.angleDeg + this.frame.angleDeg) % 360 + 360) % 360),
      intensity: Math.round(f.lumens),
      colorTemperatureK: f.colorTemperatureK,
      range: rangeOf(f.lumens),
    });
  }
}

function center(r: UvRect): Point {
  return [r.u + r.lu / 2, r.v + r.lv / 2];
}

/** Fixtures for one floor: every room by its kind, plus a downlight in each stair shaft. */
export function planLights(
  rooms: PlanRoom[], core: CorePlan, uvOutline: readonly Point[], ceilingY: number, ids: IdGen,
): LightFixture[] {
  const lighting = new FloorLighting(ids, core.frame, uvOutline, ceilingY);
  for (const room of rooms) lighting.room(room);
  lighting.stairwell("stair-a", core.stairA);
  if (core.stairB) lighting.stairwell("stair-b", core.stairB);
  return lighting.fixtures();
}
