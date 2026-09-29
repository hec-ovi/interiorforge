import type { Point } from "../core/geom.js";
import { pointInPolygon } from "../core/geom.js";
import { InteriorError } from "../core/errors.js";
import type { Rng } from "../core/rng.js";
import type { FloorKind, FurnitureKind, InteriorStyle } from "../core/types.js";
import { doorZonesByRoom } from "./clearance.js";
import { BODY_CLEAR } from "./constants.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import { doorUvPoint } from "./plan-floor.js";
import type { IdGen } from "./rooms.js";
import type { FloorBounds } from "./shell.js";
import type { UvRect } from "./uv.js";
import { roomAnchor, roomArea, roomContains, roomCoversRect, roomEdges, sharedRoomEdges } from "./room-shape.js";
import { BATHROOM_WALL_CLEARANCE, fitBathroomRecipe, overlaps } from "./bathroom-recipe.js";
import { fitLuxuryGroup } from "./luxury/fit.js";
import type { LuxuryGroup } from "./luxury/schema.js";
import { GLAZED_ONTO, GLAZED_ROOMS, type Family } from '../placements/finish.js';
import { furnishIndustrial } from '../styles/industrial/furnish.js';
import { LUXURY_REFERENCE_FITS } from '../styles/luxury/profile.js';
import { CORPORATE_FITS, furnishCorporate } from '../styles/corporate/index.js';
import { fitCompactFixtures, fixtureAccessPaths, type CompactFixture } from './compact-fixtures.js';
import { fitKitchenFixtures, kitchenOperation } from './kitchen-fixtures.js';
import { CAPSULE_SIZES, CAPSULE_PROFILE_SIZES } from '../styles/capsule/profile.js';
import { SANDRA_FURNITURE } from '../styles/sandra/furniture.js';
import { CORPO_BATH_DIVIDER_FIT } from '../styles/luxury/corpo-bathroom.js';
import { usesResidentialVanity, residentialVanityFit } from '../styles/luxury/vanity-policy.js';
import { commonTransit, doorApproaches } from './architecture-access.js';
import { fitLuxuryComposition, furnishLuxuryComposition, type LuxuryComposition } from '../styles/luxury/composition.js';
import { fitResidentialComposition, furnishResidentialComposition, type ResidentialCompositionProfile } from '../styles/capsule/composition.js';
import { findOpaqueBedHeadwall } from '../styles/luxury/headwall-fit.js';

type Size3 = [number, number, number];
type Edge = "v0" | "v1" | "u0" | "u1";

const SIZES: Record<FurnitureKind, Size3> = {
  bed_double: [1.6, 2.1, 0.55], bed_single: [1.0, 2.05, 0.55], wardrobe: [1.6, 0.65, 2.0],
  kitchen_block: [2.4, 0.65, 1.05], fridge: [0.7, 0.7, 1.8], sofa: [1.8, 0.85, 0.8],
  low_table: [0.9, 0.5, 0.4], dining_table: [0.9, 0.9, 0.75], chair: [0.45, 0.45, 0.9],
  toilet: [0.4, 0.65, 0.75], sink: [0.5, 0.45, 0.85], shower: [0.9, 0.9, 2.0],
  desk: [1.6, 0.8, 0.75], office_chair: [0.65, 0.65, 1.15], meeting_table: [2.8, 1.2, 0.75],
  shelf: [1.8, 0.5, 2.0], counter: [2.0, 0.7, 0.9], reception_desk: [2.6, 0.9, 1.1],
  bar_counter: [3.0, 0.65, 1.1], stool: [0.4, 0.4, 0.65], gym_machine: [1.2, 2.0, 1.5],
  bench: [1.8, 0.4, 0.45], plant: [0.5, 0.5, 1.3], display_rack: [1.4, 0.6, 1.6],
  wall_shelf: [1.2, 0.28, 0.4], display_screen: [1.2, 0.08, 0.7], wall_art: [0.7, 0.06, 1.05],
  crate: [0.62, 0.62, 0.55], floor_clutter: [0.8, 0.8, 0.8],
  sleeping_pod: [2.5, 1.5, 2.0],
  ornament_wall: [3.0, 0.5, 2.0], room_divider: [2.5, 0.5, 2.0],
  bathtub: [1.7, 0.8, 0.6], urinal: [0.4, 0.35, 0.6],
};
const LUXURY_SIZES: Record<FurnitureKind, Size3> = {
  ...SIZES,
  ...Object.fromEntries(Object.entries(LUXURY_REFERENCE_FITS).map(([kind, fit]) => [kind, fit.size])),
};
const CAPSULE_FITTED_SIZES: Record<FurnitureKind, Size3> = { ...SIZES, ...CAPSULE_SIZES };
const CORPORATE_SIZES: Record<FurnitureKind, Size3> = {
  ...LUXURY_SIZES,
  ...Object.fromEntries(Object.entries(CORPORATE_FITS).map(([kind, fit]) => [kind, fit.size])),
};

/** Pieces that hang on a wall, and how high their base sits. */
const MOUNT: Partial<Record<FurnitureKind, number>> = {
  wall_shelf: 1.35, display_screen: 1.45, wall_art: 1.0,
};

/** Staff furniture stands off its wall so a vendor or receptionist fits behind it; a bar
 *  keeps room for its back shelf as well. */
const STANDOFF: Partial<Record<FurnitureKind, number>> = { bar_counter: 1.2, reception_desk: 0.9, counter: 1.2 };
/** Carpet zones stop this far inside a fitted group's reservation. */
const CARPET_INSET = 0.15;

/** Ceiling on one grid run: a hall fills with aisles instead of stopping at a fixed handful,
 *  and the caller's own count per square metre decides below this. Enough to read as a
 *  working floor, cheap enough to carry a whole city. */
const GRID_CAP: Partial<Record<FurnitureKind, number>> = {
  desk: 40, dining_table: 40, gym_machine: 30, display_rack: 60, crate: 20,
};

const SEAT_GAP = 0.1; // a pulled-in chair, still clear of the table's nav margin
const STOOL_PITCH = 0.7;

const SEATS: ReadonlySet<FurnitureKind> = new Set(["chair", "stool", "office_chair"]);

/** Width of one stall in a row of toilets: their users stand beyond the body clearance. */
const STALL = BODY_CLEAR + 0.1;

class RoomPlacer {
  private readonly blocked: UvRect[] = [];
  private pairedDesk = false;
  /** Set only while placing a last-resort bed: any wall, glazed ones included. */
  private anyHeadwall = false;
  private readonly glazing: ReturnType<typeof sharedRoomEdges> = [];
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
    private readonly carpets: { room: string; rect: UvRect }[],
    private readonly sizes: Record<FurnitureKind, Size3>,
    private readonly neighbours: readonly PlanRoom[],
    private readonly family?: Family,
  ) {
    // A candidate must lie inside this room. Remote floorspace reservations cannot
    // affect it; retain intersecting boxes unchanged, including the maximum .15m
    // furniture margin, instead of testing thousands of other units' route boxes.
    this.blocked.push(...[...doorZones, ...openingZones, ...(room.furnishingKeepouts ?? [])]
      .filter(zone => overlaps(zone, room.rect, .15)));
    this.rect = usableRect(room.rect, (edge) => this.isFacade(edge), bounds.facadeDepth);
    if (sizes === LUXURY_SIZES || family === 'corporate') for (const other of neighbours) {
      if (other === room) continue;
      if (GLAZED_ROOMS.has(room.kind) && GLAZED_ONTO.has(other.kind)
        || GLAZED_ROOMS.has(other.kind) && GLAZED_ONTO.has(room.kind)) this.glazing.push(...sharedRoomEdges(room, other));
    }
  }

  /** Item with its back against a room edge; walks the edge from a seeded start, or from
   *  the edge's middle outward for a piece centred on its wall. */
  alongEdge(kind: FurnitureKind, edge: Edge, centred = false): PlanFurniture | null {
    if (this.room.polygon || this.room.holes?.length) return this.alongPolygonEdge(kind, edge);
    const [su, sv] = this.sizes[kind];
    const r = this.rect;
    const inset = 0.06 + (this.family === 'corporate' && kind === 'counter' ? 0 : STANDOFF[kind] ?? 0);
    const alongLen = edge.startsWith("v") ? r.lu : r.lv;
    if (su > alongLen - 0.2) return null;
    const span = Math.max(0, alongLen - su - 0.2);
    const start = centred ? span / 2 : this.rng.range(0, Math.max(0.01, span));
    const axis = edge.startsWith('v') ? 0 : 1;
    for (const a of this.wallOffsets(kind, axis, (axis === 0 ? r.u : r.v) + .1, su, span, start, centred)) {
      const placed = this.onEdge(kind, edgeFootprint(r, edge, a + 0.1, su, sv, inset), edge);
      if (placed) return placed;
    }
    return null;
  }

  /** A piece on the axis of the room's entrance, facing it: as deep into the room as it
   *  fits, so a desk greets whoever walks in with the core beyond it. */
  onAxis(kind: FurnitureKind): PlanFurniture | null {
    const entry = this.room.doors.find((d) => d.to === "outside") ?? this.room.doors[0];
    if (!entry) return null;
    const door = doorUvPoint(entry, this.room), alongU = entry.edge.startsWith("v");
    const centre = roomAnchor(this.room);
    const sign = Math.sign((alongU ? centre[1] - door[1] : centre[0] - door[0]) || 1);
    const inward: Point = alongU ? [0, sign] : [sign, 0];
    // faces back toward the door: rotation 0 faces +v, 90 faces +u
    const rotation = (alongU ? (sign > 0 ? 180 : 0) : (sign > 0 ? 270 : 90)) as 0 | 90 | 180 | 270;
    const [su, sv] = this.sizes[kind];
    const [lu, lv] = alongU ? [su, sv] : [sv, su];
    // The axis runs from the door to the first wall across it: the core's face in a lobby.
    let reach = 2;
    while (reach < 60 && roomContains(this.room, [door[0] + inward[0] * (reach + 0.25), door[1] + inward[1] * (reach + 0.25)])) reach += 0.25;
    // A staffed desk stays visible from the entrance but can stand beside the broad
    // public arrival route instead of blocking its axis.
    for (let t = Math.floor((reach - (alongU ? lv : lu) / 2 - 0.06) * 2) / 2; t >= 2; t -= 0.5) {
      for (const slide of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -3, 3.5, -3.5]) {
        const at: Point = [door[0] + inward[0] * t + inward[1] * slide, door[1] + inward[1] * t + inward[0] * slide];
        const fp: UvRect = { u: at[0] - lu / 2, v: at[1] - lv / 2, lu, lv };
        if (this.fits(fp, kind)) return this.commit(kind, fp, rotation);
      }
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

  /** A bed where no opaque headwall takes one: against any wall, else on open floor,
   *  with every clearance and reservation of an ordinary piece. */
  looseBed(kind: 'bed_double' | 'bed_single'): PlanFurniture | null {
    this.anyHeadwall = true;
    try { return this.anyEdge(kind) ?? this.grid(kind, 0.6, 1)[0] ?? null; }
    finally { this.anyHeadwall = false; }
  }

  /** A composed bay still obeys the same room, opening and circulation reservations. */
  placeAt(kind: FurnitureKind, at: Point, rotationDeg: 0 | 90 | 180 | 270 = 0): PlanFurniture | null {
    const footprint = footprintOf({ at, rotationDeg, size: this.sizes[kind] });
    return this.fits(footprint, kind) ? this.commit(kind, footprint, rotationDeg) : null;
  }

  /** A study needs an actual seated workstation. Try the desk and chair together,
   * rather than fixing the desk where the door approach prevents its chair. */
  workstation(): PlanFurniture | null {
    this.pairedDesk = true;
    try { return this.anyEdge('desk'); }
    finally { this.pairedDesk = false; }
  }

  workstationAt(at: Point, rotationDeg: 0 | 90 | 180 | 270 = 0): PlanFurniture | null {
    const desk = footprintOf({ at, rotationDeg, size: this.sizes.desk });
    const side = oppositeRotation(rotationDeg), [width, depth] = this.sizes.office_chair;
    const span = side % 180 === 0 ? desk.lu : desk.lv;
    const chair = seatFootprint(desk, side, span / 2, width, depth);
    if (!this.fits(desk, 'desk') || !this.fits(chair, 'office_chair')) return null;
    const placed = this.commit('desk', desk, rotationDeg);
    this.commit('office_chair', chair, side);
    return placed;
  }

  bathroom(withPlantScreen = false): boolean {
    const recipe = fitBathroomRecipe(this.room, this.sizes, this.rng,
      (footprint, kind) => this.fits(footprint, kind),
      operation => roomCoversRect(this.room, operation, BATHROOM_WALL_CLEARANCE)
        && roomCoversRect({ rect: this.rect, polygon: this.bounds.inner }, operation));
    if (!recipe) return false;
    const fixtures = recipe.map(item => this.commit(item.kind, item.footprint, item.rotationDeg));
    // These are usable fixture fronts, including the shower approach. Later dressing
    // cannot consume them merely because its solid geometry misses the fixtures.
    this.blocked.push(...recipe.map(item => item.operation));
    const basin = fixtures.find(item => item.kind === 'sink');
    if (withPlantScreen && basin) {
      const angle = basin.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      for (const side of [-1, 1]) {
        const x = side * 1.36, z = .60;
        const at: Point = [basin.at[0] + x * c + z * s, basin.at[1] - x * s + z * c];
        const rotation = ((basin.rotationDeg + (side < 0 ? 90 : 270)) % 360) as 0 | 90 | 180 | 270;
        if (this.placeAt('room_divider', at, rotation)) break;
      }
    }
    return true;
  }

  compactFixtures(kitchen = false): boolean {
    const group = fitCompactFixtures(this.room, kitchen ? ['kitchen_block', 'fridge'] : ['shower', 'toilet', 'sink'], this.sizes, this.rng,
      (fp, kind) => this.fits(fp, kind), operation => roomCoversRect(this.room, operation, BATHROOM_WALL_CLEARANCE)
        && roomCoversRect({ rect: this.rect, polygon: this.bounds.inner }, operation), [...this.rects.values()]);
    if (!group) return false;
    for (const f of group.fixtures) this.commit(f.kind, f.footprint, f.rotationDeg);
    this.blocked.push(...group.fixtures.map(f => f.operation));
    for (const path of group.paths) for (const point of path) this.blocked.push({ u: point[0] - .34, v: point[1] - .34, lu: .68, lv: .68 });
    return true;
  }

  group(kind: LuxuryGroup, bounds = this.rect): boolean {
    const group = fitLuxuryGroup({ kind, bounds, rng: this.rng,
      accepts: (reservation, pieces) => this.fits(reservation, "sofa")
        && pieces.every(piece => this.bedBacking(piece)) });
    if (!group) return false;
    for (const piece of group.pieces) {
      const item: PlanFurniture = { ...piece, id: this.ids.furniture(), room: this.room.id };
      this.out.push(item);
      const footprint = footprintOf(item);
      this.rects.set(item.id, footprint);
      this.blocked.push(footprint);
    }
    this.blocked.push(group.reservation);
    if (kind !== "kitchen") {
      const r = group.reservation;
      this.carpets.push({ room: this.room.id, rect: { u: r.u + CARPET_INSET, v: r.v + CARPET_INSET, lu: r.lu - 2 * CARPET_INSET, lv: r.lv - 2 * CARPET_INSET } });
    }
    return true;
  }

  composition(kind: LuxuryComposition, bounds = this.rect,
    accepts?: (pieces: readonly Pick<PlanFurniture, 'at' | 'size' | 'rotationDeg'>[]) => boolean): boolean {
    // Empty approaches can share a doorway/public route; the physical pieces cannot.
    // Rejecting the whole walking envelope left even a 6m bedroom without bedside
    // cabinets merely because its clear foot-of-bed aisle overlapped the door approach.
    const group = fitLuxuryComposition(kind, this.room, bounds, (rect, pieces) => this.covers(rect)
      && pieces.every(piece => this.fits(footprintOf(piece), piece.kind)
        && (piece.kind !== 'display_screen' || this.solidBacking(piece))
        && (piece.kind !== 'ornament_wall' || this.solidBacking(backFace(piece))) && this.bedBacking(piece))
      && (!accepts || accepts(pieces)));
    if (!group) return false;
    for (const piece of group.pieces) {
      const item: PlanFurniture = { ...piece, id: this.ids.furniture(), room: this.room.id };
      this.out.push(item);
      this.rects.set(item.id, footprintOf(item));
    }
    this.blocked.push(group.reservation);
    if (group.carpet) this.carpets.push({ room: this.room.id, rect: group.carpet });
    return true;
  }

  residentialComposition(profile: ResidentialCompositionProfile): boolean {
    const accepts = (rect: UvRect, pieces: readonly Pick<PlanFurniture, 'kind' | 'at' | 'size' | 'rotationDeg' | 'elevation'>[]) => roomCoversRect(this.room, rect)
      && pieces.every(piece => this.fits(footprintOf(piece), piece.kind)
        && (piece.kind !== 'display_screen' || this.solidBacking(piece)));
    const planned = this.room.plannedLiving;
    if (planned && (planned.profile !== profile || !accepts(planned.reservation, planned.pieces))) return false;
    // The route solver routed around this exact group. Replacing it with another
    // successful local fit could block a saved path elsewhere in the dwelling.
    const group = planned ?? fitResidentialComposition(this.room, this.rect, profile, accepts);
    if (!group) return false;
    for (const piece of group.pieces) {
      const item: PlanFurniture = { ...piece, id: this.ids.furniture(), room: this.room.id };
      this.out.push(item);
      this.rects.set(item.id, footprintOf(item));
    }
    this.blocked.push(group.reservation);
    if ('carpet' in group && group.carpet) this.carpets.push({ room: this.room.id, rect: group.carpet });
    return true;
  }

  /** Failure evidence is available to generator diagnostics without writing files
   * or changing the geometry/clearance predicates used by production. */
  compositionDiagnostics(): unknown {
    return structuredClone({ room: this.room, usableRect: this.rect, blocked: this.blocked,
      glazing: this.glazing, bounds: this.bounds, sizes: this.sizes,
      furniture: this.out.filter(item => item.room === this.room.id) });
  }

  /** A proper eat-in kitchen takes precedence over a spare pantry when the home
   * has no dining table. Keep the existing cooker/fridge positions, their complete
   * operating space, and body-sized paths to both actual worktop stations. */
  kitchenBreakfast(): boolean {
    const appliances = this.out.filter(piece => piece.room === this.room.id
      && (piece.kind === 'kitchen_block' || piece.kind === 'fridge'));
    const fixtures = this.kitchenFixtures(appliances);
    if (!fixtures) return false;
    const obstacles = this.out.filter(piece => piece.room === this.room.id
      && piece.kind !== 'kitchen_block' && piece.kind !== 'fridge' && !piece.elevation).map(footprintOf);
    const before = this.blocked.length;
    this.blocked.push(...fixtures.map(fixture => fixture.operation));
    const fitted = this.composition('breakfast', this.rect, group =>
      fixtureAccessPaths(this.room, fixtures, [...obstacles, ...group.map(footprintOf)]) !== null);
    if (!fitted) this.blocked.splice(before);
    return fitted;
  }

  /** Optional storage must never consume the cooking access freed by making a
   * kitchen's architectural destination its doorway instead of its empty centre. */
  protectKitchenAccess(): boolean {
    const appliances = this.out.filter(piece => piece.room === this.room.id
      && (piece.kind === 'kitchen_block' || piece.kind === 'fridge'));
    const fixtures = this.kitchenFixtures(appliances);
    if (!fixtures) return false;
    const obstacles = this.out.filter(piece => piece.room === this.room.id
      && piece.kind !== 'kitchen_block' && piece.kind !== 'fridge' && !piece.elevation).map(footprintOf);
    const paths = fixtureAccessPaths(this.room, fixtures, obstacles);
    if (!paths) return false;
    this.blocked.push(...fixtures.map(fixture => fixture.operation));
    for (const path of paths) for (const point of path)
      this.blocked.push({ u: point[0] - .34, v: point[1] - .34, lu: .68, lv: .68 });
    return true;
  }

  private kitchenFixtures(appliances: PlanFurniture[]): CompactFixture[] | null {
    const fixtures: CompactFixture[] = appliances.map(piece => {
      const kind = piece.kind as 'kitchen_block' | 'fridge', footprint = footprintOf(piece);
      return { kind, footprint, operation: kitchenOperation(footprint, kind, piece.rotationDeg), rotationDeg: piece.rotationDeg };
    });
    const obstacles = this.out.filter(piece => piece.room === this.room.id && !appliances.includes(piece) && !piece.elevation).map(footprintOf);
    const cooker = appliances.find(piece => piece.kind === 'kitchen_block'), fridge = appliances.find(piece => piece.kind === 'fridge');
    if (cooker && fridge && fixtures.every(fixture => this.covers(fixture.operation))
      && fixtureAccessPaths(this.room, fixtures, obstacles)) return fixtures;

    // Greedy wall placements can fit separately while blocking the fridge's only
    // operating side. Reconsider the existing appliances as a pair, retaining IDs,
    // full dimensions and every unrelated room/door/circulation reservation.
    if (appliances.filter(piece => piece.kind === 'kitchen_block').length > 1
      || appliances.filter(piece => piece.kind === 'fridge').length > 1) return null;
    const previous = new Set(appliances.map(piece => this.rects.get(piece.id)).filter((rect): rect is UvRect => rect !== undefined));
    const reserved = this.blocked.filter(rect => !previous.has(rect));
    const group = fitKitchenFixtures(this.room, {
      kitchen_block: cooker?.size ?? this.sizes.kitchen_block, fridge: fridge?.size ?? this.sizes.fridge,
    }, this.rng, footprint => this.covers(footprint) && reserved.every(rect => !overlaps(footprint, rect, .15)),
    operation => this.covers(operation), obstacles);
    if (!group) return null;
    // No state changes until the complete pair and real approach paths passed.
    for (let index = this.blocked.length - 1; index >= 0; index--) if (previous.has(this.blocked[index]!)) this.blocked.splice(index, 1);
    for (const fixture of group.fixtures) {
      const existing = appliances.find(piece => piece.kind === fixture.kind);
      if (existing) {
        existing.at = [fixture.footprint.u + fixture.footprint.lu / 2, fixture.footprint.v + fixture.footprint.lv / 2];
        existing.rotationDeg = fixture.rotationDeg;
        this.rects.set(existing.id, fixture.footprint);
        this.blocked.push(fixture.footprint);
      } else this.commit(fixture.kind, fixture.footprint, fixture.rotationDeg);
    }
    return group.fixtures;
  }

  /** Two waiting pockets flank the actual entrance. Keep the arrival axis and the
   * deeper core/service approaches legible instead of filling every polygon arm.
   * Each pocket must fit a complete group at its real size or remain open floor. */
  receptionWaiting(): boolean {
    const door = this.room.doors.find(door => door.to === 'outside') ?? this.room.doors[0];
    if (!door) return false;
    const [inside, outside] = doorApproaches(door, this.room);
    const horizontal = door.edge.startsWith('v');
    const along = horizontal ? 0 : 1, cross = 1 - along;
    const direction = Math.sign(inside[cross]! - outside[cross]!);
    const origin = doorUvPoint(door, this.room);
    const low = horizontal ? this.rect.u : this.rect.v;
    const high = low + (horizontal ? this.rect.lu : this.rect.lv);
    const crossLow = horizontal ? this.rect.v : this.rect.u;
    const crossHigh = crossLow + (horizontal ? this.rect.lv : this.rect.lu);
    // This is an arrival room, not a hall of seating: the waiting pockets occupy
    // its first 8m and leave at least a 4m visual opening on the entrance axis.
    const near = Math.max(crossLow, Math.min(origin[cross]! + direction, origin[cross]! + direction * 9));
    const far = Math.min(crossHigh, Math.max(origin[cross]! + direction, origin[cross]! + direction * 9));
    const halfAxis = Math.max(2, door.width / 2 + 0.5);
    const spans = [[low, origin[along]! - halfAxis], [origin[along]! + halfAxis, high]];
    let seated = false;
    for (const [start, end] of spans) {
      if (end! - start! < 4.5 || far - near < 4.5) continue;
      const pocket: UvRect = horizontal
        ? { u: start!, v: near, lu: end! - start!, lv: far - near }
        : { u: near, v: start!, lu: far - near, lv: end! - start! };
      seated = (this.composition('hospitality', pocket) || this.group('salon', pocket) || this.group('seating', pocket)) || seated;
    }
    return seated;
  }

  /** Wall piece: hung on a solid wall, never across the facade glass. */
  wallPiece(kind: FurnitureKind, edges: Edge[] = ["v1", "u0", "u1", "v0"]): PlanFurniture | null {
    for (const e of edges) {
      if (this.room.polygon || this.room.holes?.length) {
        const placed = this.alongPolygonEdge(kind, e, true);
        if (placed) return placed;
        continue;
      }
      const envelope = roomEdges(this.room).filter(segment => segment.edge === e).some(segment =>
        nearBoundary([(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2], this.bounds.inner, 0.05));
      if (this.isFacade(e) || envelope || this.glazing.some(shared => shared.edge === e)) continue;
      const placed = this.alongEdge(kind, e);
      if (placed) return placed;
    }
    return null;
  }

  private alongPolygonEdge(kind: FurnitureKind, edge: Edge, solidOnly = false): PlanFurniture | null {
    const [width, depth] = this.sizes[kind];
    const horizontal = edge.startsWith("v"), along = horizontal ? 0 : 1, cross = 1 - along;
    for (const segment of roomEdges(this.room)) {
      if (segment.edge !== edge) continue;
      const lo = Math.min(segment.a[along]!, segment.b[along]!);
      const hi = Math.max(segment.a[along]!, segment.b[along]!);
      const wall = segment.a[cross]!;
      const mid: Point = horizontal ? [(lo + hi) / 2, wall] : [wall, (lo + hi) / 2];
      const facade = nearBoundary(mid, this.bounds.outline, this.bounds.facadeDepth + 0.05);
      const envelope = nearBoundary(mid, this.bounds.inner, 0.05);
      const glazed = this.glazing.some(shared => shared.edge === edge && Math.abs(shared.c - wall) < 1e-6
        && Math.min(shared.hi, hi) - Math.max(shared.lo, lo) > 1e-6);
      if (solidOnly && (facade || envelope || glazed) || hi - lo < width + 0.2) continue;
      const inset = 0.06 + (this.family === 'corporate' && kind === 'counter' ? 0 : STANDOFF[kind] ?? 0) + (facade ? this.bounds.facadeDepth : 0);
      const virtual: UvRect = horizontal
        ? { u: lo, v: edge === "v0" ? wall : wall - depth - inset, lu: hi - lo, lv: depth + inset }
        : { u: edge === "u0" ? wall : wall - depth - inset, v: lo, lu: depth + inset, lv: hi - lo };
      const available = Math.max(0, hi - lo - width - 0.2);
      const start = this.rng.range(0, Math.max(.01, available));
      for (const offset of this.wallOffsets(kind, along, lo + .1, width, available, start, false)) {
        const placed = this.onEdge(kind, edgeFootprint(virtual, edge, offset + 0.1, width, depth, inset), edge);
        if (placed) return placed;
      }
    }
    return null;
  }

  /** Exact wall and reservation events matter in compact rooms: a seeded quarter-
   * metre phase alone can miss the only legal full-size bed position. Preserve the
   * actual clearance predicate and add candidates at its geometric boundaries. */
  private wallOffsets(kind: FurnitureKind, axis: number, origin: number, width: number,
    span: number, start: number, centred: boolean): number[] {
    const gap = MOUNT[kind] ? .05 : SEATS.has(kind) ? .06 : .15;
    const bed = kind === 'bed_double' || kind === 'bed_single';
    const offsets = bed || centred ? [span / 2, 0, span, start] : [start, span / 2, 0, span];
    for (const rect of [...this.blocked, ...this.rects.values()]) {
      const low = axis === 0 ? rect.u : rect.v, length = axis === 0 ? rect.lu : rect.lv;
      // Tiny inward offsets avoid a binary rounding error at an exact touching bound.
      offsets.push(low - gap - width - origin - 1e-7, low + length + gap - origin + 1e-7);
    }
    for (let offset = 0; offset <= span; offset += .25) {
      offsets.push(...(centred ? [start + offset / 2, start - offset / 2]
        : [span ? (start + offset) % span : 0]));
    }
    return [...new Set(offsets.filter(value => value >= 0 && value <= span))];
  }

  center(kind: FurnitureKind): PlanFurniture | null {
    const [su, sv] = this.sizes[kind];
    const r = this.rect;
    const fp: UvRect = { u: r.u + (r.lu - su) / 2, v: r.v + (r.lv - sv) / 2, lu: su, lv: sv };
    return this.fits(fp, kind) ? this.commit(kind, fp, 0) : null;
  }

  /** Regular grid of identical items with aisles, e.g. desks, diner tables, machines. */
  grid(kind: FurnitureKind, aisle: number, max: number): PlanFurniture[] {
    const [su, sv] = this.sizes[kind];
    const r = this.rect;
    const margin = 0.8;
    const limit = Math.min(max, GRID_CAP[kind] ?? max);
    const placed: PlanFurniture[] = [];
    for (let v = r.v + margin; v + sv <= r.v + r.lv - margin && placed.length < limit; v += sv + aisle) {
      for (let u = r.u + margin; u + su <= r.u + r.lu - margin && placed.length < limit; u += su + aisle) {
        const fp: UvRect = { u, v, lu: su, lv: sv };
        if (this.fits(fp, kind) && this.bedBacking({ kind, at: [fp.u + fp.lu / 2, fp.v + fp.lv / 2], size: this.sizes[kind], rotationDeg: 0 }))
          placed.push(this.commit(kind, fp, 0));
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
    const [cw, cd] = this.sizes[kind];
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

  /** One chair on the working side of a piece: in front of a desk, or behind a counter
   *  whose staff face the room. */
  seatAt(item: PlanFurniture, kind: "chair" | "office_chair", behind = false): void {
    const fp = footprintOf(item);
    const [cw, cd] = this.sizes[kind];
    const side = behind ? item.rotationDeg : oppositeRotation(item.rotationDeg);
    const span = side % 180 === 0 ? fp.lu : fp.lv;
    const rect = seatFootprint(fp, side, span / 2, cw, cd);
    if (this.fits(rect, kind, this.rects.get(item.id))) this.commit(kind, rect, side);
  }

  /** Stools along the customer side of a counter. */
  stoolsAt(counter: PlanFurniture, max: number): void {
    const fp = footprintOf(counter);
    const [sw, sd] = this.sizes.stool;
    const side = oppositeRotation(counter.rotationDeg);
    const span = side % 180 === 0 ? fp.lu : fp.lv;
    const seats = Math.max(1, Math.min(max, Math.floor(span / STOOL_PITCH)));
    for (let i = 0; i < seats; i++) {
      const rect = seatFootprint(fp, side, (span * (i + 0.5)) / seats, sw, sd, 0.18);
      if (this.fits(rect, "stool", this.rects.get(counter.id))) this.commit("stool", rect, side);
    }
  }

  /** A piece backed onto `edge` where it fits. The toilets of a toilets room are in use at
   *  once, so each holds its stall along the wall and no other piece or stall enters it. */
  private onEdge(kind: FurnitureKind, fp: UvRect, edge: Edge): PlanFurniture | null {
    if (!this.fits(fp, kind)) return null;
    if (!this.bedBacking({ kind, at: [fp.u + fp.lu / 2, fp.v + fp.lv / 2], size: this.sizes[kind], rotationDeg: edgeRotation(edge) })) return null;
    if (kind === 'desk' && this.pairedDesk) {
      const rotation = edgeRotation(edge), side = oppositeRotation(rotation);
      const [width, depth] = this.sizes.office_chair;
      const span = side % 180 === 0 ? fp.lu : fp.lv;
      const chair = seatFootprint(fp, side, span / 2, width, depth);
      if (!this.fits(chair, 'office_chair')) return null;
      const desk = this.commit(kind, fp, rotation);
      this.commit('office_chair', chair, side);
      return desk;
    }
    const stall = this.room.kind === "toilets" && kind === "toilet" ? stallOf(fp, edge) : null;
    if (stall && this.blocked.some((other) => overlaps(stall, other))) return null;
    const placed = this.commit(kind, fp, edgeRotation(edge));
    if (stall) this.blocked.push(stall);
    return placed;
  }

  private fits(fp: UvRect, kind: FurnitureKind, except?: UvRect): boolean {
    if (!this.covers(fp)) return false;
    const gap = MOUNT[kind] ? 0.05 : SEATS.has(kind) ? 0.06 : 0.15;
    return this.blocked.every(
      (b) => b === except
        || fp.u + fp.lu + gap <= b.u || b.u + b.lu + gap <= fp.u
        || fp.v + fp.lv + gap <= b.v || b.v + b.lv + gap <= fp.v,
    );
  }

  private covers(fp: UvRect): boolean {
    const r = this.rect;
    if (fp.u < r.u + 0.05 || fp.v < r.v + 0.05 || fp.u + fp.lu > r.u + r.lu - 0.05 || fp.v + fp.lv > r.v + r.lv - 0.05) {
      return false;
    }
    // rooms at the facade may be outline-clipped; furniture stays behind the facade lining
    const corners: Point[] = [
      [fp.u, fp.v], [fp.u + fp.lu, fp.v], [fp.u + fp.lu, fp.v + fp.lv], [fp.u, fp.v + fp.lv],
    ];
    if (!corners.every((c) => pointInPolygon(c, this.bounds.inner))) return false;
    return roomCoversRect(this.room, fp, 0.05);
  }

  /** A media composition uses an actual opaque room wall. A facade window or an
   * empty space at the back of a concave room's bounding box cannot support its TV. */
  private solidBacking(item: Pick<PlanFurniture, 'rotationDeg' | 'size' | 'at'>): boolean {
    const edge = item.rotationDeg === 0 ? 'v0' : item.rotationDeg === 180 ? 'v1' : item.rotationDeg === 90 ? 'u0' : 'u1';
    const along = edge.startsWith('v') ? 0 : 1, cross = 1 - along;
    const centre = item.at[along]!, half = item.size[0] / 2;
    return roomEdges(this.room).some(segment => {
      if (segment.edge !== edge || Math.abs(segment.a[cross]! - item.at[cross]!) > .32) return false;
      const lo = Math.min(segment.a[along]!, segment.b[along]!), hi = Math.max(segment.a[along]!, segment.b[along]!);
      if (centre - half < lo + .05 || centre + half > hi - .05) return false;
      const at: Point = along === 0 ? [centre, segment.a[cross]!] : [segment.a[cross]!, centre];
      return !nearBoundary(at, this.bounds.inner, .05)
        && !nearBoundary(at, this.bounds.outline, this.bounds.facadeDepth + .05)
        && !this.glazing.some(shared => shared.edge === edge && Math.abs(shared.c - segment.a[cross]!) < 1e-6
          && Math.min(shared.hi, centre + half) - Math.max(shared.lo, centre - half) > 1e-6);
    });
  }

  private bedBacking(item: Pick<PlanFurniture, 'kind' | 'rotationDeg' | 'size' | 'at'>): boolean {
    return this.anyHeadwall || this.family !== 'luxury' || this.room.unit === undefined || !['bed_double', 'bed_single'].includes(item.kind)
      || findOpaqueBedHeadwall(this.room, item, this.bounds, this.neighbours, this.glazing) !== null;
  }

  private commit(kind: FurnitureKind, fp: UvRect, rotationDeg: 0 | 90 | 180 | 270): PlanFurniture {
    this.blocked.push(fp);
    const mount = MOUNT[kind];
    const item: PlanFurniture = {
      id: this.ids.furniture(), kind, room: this.room.id,
      at: [fp.u + fp.lu / 2, fp.v + fp.lv / 2] as Point,
      rotationDeg, size: this.sizes[kind],
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

/** A deep wall-backed piece measured like a screen: its back face 40 mm in front of
 *  the wall it needs, so a planted display stands against opaque partition, never glass. */
function backFace<T extends Pick<PlanFurniture, 'rotationDeg' | 'size' | 'at'>>(item: T): T {
  const reach = item.size[1] / 2 - .04;
  const [du, dv] = item.rotationDeg === 0 ? [0, -reach] : item.rotationDeg === 180 ? [0, reach]
    : item.rotationDeg === 90 ? [-reach, 0] : [reach, 0];
  return { ...item, at: [item.at[0] + du, item.at[1] + dv] };
}

function footprintOf(item: Pick<PlanFurniture, 'rotationDeg' | 'size' | 'at'>): UvRect {
  const swap = item.rotationDeg === 90 || item.rotationDeg === 270;
  const lu = swap ? item.size[1] : item.size[0];
  const lv = swap ? item.size[0] : item.size[1];
  return { u: item.at[0] - lu / 2, v: item.at[1] - lv / 2, lu, lv };
}

/** A toilet's footprint widened to its stall along the wall it backs onto. */
function stallOf(fp: UvRect, edge: Edge): UvRect {
  return edge.startsWith("v")
    ? { ...fp, u: fp.u - (STALL - fp.lu) / 2, lu: STALL }
    : { ...fp, v: fp.v - (STALL - fp.lv) / 2, lv: STALL };
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

/** The wall a placed piece has its back to. */
function edgeBehind(item: PlanFurniture): Edge {
  switch (item.rotationDeg) {
    case 0: return "v0";
    case 180: return "v1";
    case 90: return "u0";
    default: return "u1";
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

/** How many of one wall piece a room of this area carries: one per `per` square metres,
 *  at least one and never more than `cap`. */
function runs(area: number, per: number, cap: number): number {
  return Math.max(1, Math.min(cap, Math.floor(area / per)));
}

export function furnish(
  rooms: PlanRoom[], floorKind: FloorKind, rng: Rng, ids: IdGen, bounds: FloorBounds,
  openingZones: readonly UvRect[] = [], tier = "rich", carpets: { room: string; rect: UvRect }[] = [],
  family?: Family,
  publicRoutes: readonly UvRect[] = [],
  interiorStyle?: InteriorStyle,
  ceilingHeight = Infinity,
  strict = true,
): PlanFurniture[] {
  const out: PlanFurniture[] = [];
  const unitByRoom = new Map(rooms.map(room => [room.id, room.unit]));
  const generousUnits = new Set(rooms.filter(room => room.unit && room.kind === 'living' && room.furnishingKeepouts?.length).map(room => room.unit));
  const domestic = (family === 'capsule' || family === 'damaged') && ['apartment', 'residence_studio'].includes(floorKind);
  const residentialProfile: ResidentialCompositionProfile = family === 'damaged' ? 'damaged'
    : interiorStyle === 'sandra-dorsett' ? 'sandra-dorsett' : interiorStyle === 'japantown' ? 'japantown' : 'h10';
  const primaryLiving = new Map<string, PlanRoom>();
  for (const room of rooms) if (room.unit && (room.kind === 'living' || room.kind === 'studio_main')) {
    const previous = primaryLiving.get(room.unit);
    if (!previous || roomArea(room) > roomArea(previous)) primaryLiving.set(room.unit, room);
  }
  const zones = doorZonesByRoom(rooms);
  const capsuleSizes = { ...CAPSULE_FITTED_SIZES,
    ...CAPSULE_PROFILE_SIZES[interiorStyle === 'japantown' ? 'japantown' : 'h10'],
    ...(interiorStyle === 'sandra-dorsett'
      ? Object.fromEntries(Object.entries(SANDRA_FURNITURE).map(([kind, fit]) => [kind, fit.size])) : {}) };
  for (const room of rooms) {
    // Legacy layouts label private arrival bands as living rooms too. Keep those
    // approaches empty; the largest living/studio space owns the dwelling's salon.
    if (domestic && room.kind === 'living' && room.unit && primaryLiving.get(room.unit) !== room) continue;
    const p = new RoomPlacer(
      room, rng, ids, out, (zones.get(room.id) ?? []).map((z) => z.rect),
      commonTransit(room) ? [...openingZones, ...publicRoutes] : openingZones, bounds, carpets,
      usesResidentialVanity(family, room.kind, floorKind) ? { ...LUXURY_SIZES,
        sink: residentialVanityFit(interiorStyle).size, room_divider: CORPO_BATH_DIVIDER_FIT.size }
        : family === 'corporate' ? CORPORATE_SIZES : family === 'capsule' ? capsuleSizes
        : family !== 'industrial' && (tier === 'rich' || tier === 'high_rich') ? LUXURY_SIZES : SIZES,
      rooms, family,
    );
    const area = roomArea(room);
    if (family === 'industrial' && furnishIndustrial(room, floorKind, p)) continue;
    if (family === 'corporate' && furnishCorporate(room, floorKind, p)) continue;
    if (domestic && furnishResidentialComposition(room, p, residentialProfile)) continue;
    const luxury = tier === "rich" || tier === "high_rich";
    if (luxury && furnishLuxuryComposition(room, p)) continue;
    // Establish the arrival and staffed desk before lounge groups consume its bay.
    // The placer still reserves the complete entrance-to-core walking route.
    const receptionDesk = room.kind === 'reception'
      ? p.onAxis('reception_desk') ?? p.anyEdge('reception_desk', ['v1', 'u1', 'u0']) : null;
    if (receptionDesk) p.seatAt(receptionDesk, 'office_chair', true);
    const suite = luxury && ["studio_main", "bedroom"].includes(room.kind) && p.group("suite");
    const kitchen = luxury && ["studio_main", "kitchen"].includes(room.kind) && p.group("kitchen");
    const seating = luxury && (room.kind === 'reception' ? p.receptionWaiting()
      : ["studio_main", "living", "lounge"].includes(room.kind) && (p.group("salon") || p.group("seating")));
    if (!(domestic && room.kind === 'studio_main') && area >= 32 && ["reception", "lounge", "office_open", "dining_area", "living", "studio_main"].includes(room.kind)) {
      p.wallPiece("ornament_wall");
    }
    if (!(domestic && room.kind === 'studio_main') && area >= 65 && ["reception", "office_open", "living", "studio_main", "lounge"].includes(room.kind)) {
      p.grid("room_divider", 2.0, 1);
    }
    switch (room.kind) {
      case "studio_main":
        // clipped wedge rooms often have no straight wall for the bed: fall back to open floor
        if (!suite && !(tier === "mid" && interiorStyle !== 'sandra-dorsett' && area >= 14 && p.wallPiece("sleeping_pod"))) {
          if (!p.anyEdge("bed_double") && !p.grid("bed_double", 0.6, 1).length) p.looseBed("bed_double");
        }
        if (!luxury && family !== 'industrial' && family !== 'corporate') {
          // A studio too tight for the complete kitchen with its tested approaches keeps
          // the pieces that still fit their own clearances.
          if (!p.compactFixtures(true)) looseKitchen(p);
        } else if (!kitchen) p.anyEdge("kitchen_block");
        p.anyEdge("wardrobe");
        if (domestic && room.unit && primaryLiving.get(room.unit) === room) {
          // The living bay is optional: a studio short of it keeps a plain sofa.
          if (!p.residentialComposition(residentialProfile) && area >= 18) {
            p.anyEdge("sofa");
            p.center("low_table");
          }
        } else if (!seating && area >= 18) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        p.wallPiece("wall_art");
        break;
      case "bedroom": {
        const bed = area >= 9 ? "bed_double" as const : "bed_single" as const;
        if (!suite && !(tier === "mid" && interiorStyle !== 'sandra-dorsett' && area >= 14 && p.wallPiece("sleeping_pod"))) {
          if (!p.anyEdge(bed) && !p.grid(bed, 0.6, 1).length) p.looseBed(bed);
        }
        p.anyEdge("wardrobe");
        p.wallPiece("wall_art");
        break;
      }
      case "living":
        if (!seating && area >= 10) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        if (area >= 16) {
          for (const table of p.grid("dining_table", 1.2, 1)) p.seatsAround(table, "chair");
        }
        p.wallPiece("display_screen");
        break;
      case "kitchen":
        if (!luxury && family !== 'industrial' && family !== 'corporate') {
          if (!p.compactFixtures(true)) looseKitchen(p);
        } else {
          if (!kitchen) p.anyEdge("kitchen_block");
          p.anyEdge("fridge");
        }
        const eatIn = luxury && room.unit !== undefined
          && !out.some(piece => piece.kind === 'dining_table' && unitByRoom.get(piece.room) === room.unit)
          && p.kitchenBreakfast();
        // Optional storage never takes the cooking and fridge approaches: a kitchen whose
        // approaches cannot be protected gets no extra counters or shelving.
        const accessKept = !(luxury && room.unit !== undefined && generousUnits.has(room.unit)) || p.protectKitchenAccess();
        if (area >= 14 && !eatIn && accessKept) {
          p.anyEdge("counter");
          p.anyEdge("counter");
          p.anyEdge("shelf");
        }
        p.wallPiece("wall_shelf");
        break;
      case "bathroom":
        if (!luxury && family !== 'industrial' && family !== 'corporate') {
          if (p.compactFixtures()) break;
        } else if (luxury || area >= 9 - 1e-6) {
          if (p.bathroom(usesResidentialVanity(family, room.kind, floorKind) && ceilingHeight >= CORPO_BATH_DIVIDER_FIT.size[2] + .02)) break;
        }
        // Short of the complete recipe, the fixtures that keep their own clearances
        // stand; a home still needs its toilet (checked below).
        p.anyEdge("toilet");
        p.anyEdge("sink");
        if (area >= 3.6) p.anyEdge("shower");
        break;
      case "toilets": {
        // stalls in a row along one wall, so their users never face each other
        const stall = p.anyEdge("toilet");
        if (stall) p.anyEdge("toilet", [edgeBehind(stall)]);
        p.anyEdge("sink");
        break;
      }
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
        p.workstation();
        p.anyEdge("shelf");
        p.wallPiece("wall_art");
        break;
      }
      case "reception": {
        // Complete waiting groups flank the entrance; the rear arms stay circulation.
        if (!luxury && !seating) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        for (let i = 0; i < (luxury ? Math.min(12, Math.max(4, Math.floor(area / 90))) : 2); i++) p.anyEdge("plant");
        p.wallPiece("display_screen");
        p.wallPiece("wall_art");
        break;
      }
      case "dining_area":
      case "bar": {
        // a counter run with its back bar and stools, dining between planted screens
        const bar = p.anyEdge("bar_counter", ["v1", "u1", "u0"]);
        if (bar) {
          p.stoolsAt(bar, 5);
          p.alongEdge("shelf", edgeBehind(bar), true);
        }
        if (luxury && area >= 40) p.grid("room_divider", 3.0, runs(area, 40, 4));
        for (const table of p.grid("dining_table", 1.4, Math.floor(area / 9))) {
          p.seatsAround(table, "chair", 1, [0, 180]);
        }
        for (let i = 0; i < runs(area, 90, 5); i++) p.anyEdge("plant");
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
      case "sales_floor": {
        // checkout against a wall (the clerk stands behind it), shelving on the walls,
        // display racks in aisles across the open floor, a seated bay in a big shop
        p.anyEdge("counter", ["v1", "u1", "u0"]);
        for (let i = 0; i < runs(area, 24, 8); i++) p.anyEdge("shelf");
        p.grid("display_rack", 1.5, Math.max(1, Math.floor(area / 14)));
        if (luxury && area >= 80 && !seating) p.group("seating");
        for (let i = 0; i < runs(area, 90, 5); i++) p.anyEdge("plant");
        p.wallPiece("display_screen");
        p.wallPiece("wall_shelf");
        break;
      }
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
        if (!seating) {
          p.anyEdge("sofa");
          p.center("low_table");
        }
        p.anyEdge("plant");
        if (luxury) p.anyEdge("plant");
        p.wallPiece("wall_art");
        break;
      case "concourse":
        p.wallPiece("display_screen");
        break;
      default:
        break; // corridors, lobbies, halls without furniture, parking
    }
    if (tier === "poor" && area >= 12 && ["storage", "mechanical_room", "office_open", "studio_main", "living", "lounge"].includes(room.kind)) {
      for (let i = 0; i < (area >= 32 ? 2 : 1); i++) p.anyEdge("floor_clutter");
    }
    void floorKind;
  }
  const incomplete = incompleteHomes(rooms, out);
  if (strict && incomplete.length) throw new InteriorError('E_FLOOR_TOO_SMALL',
    `${incomplete.join(', ')} cannot fit a bed and a toilet in the rooms that carry them`);
  return out;
}

/** Cooking pieces placed one by one against their walls, each keeping its own clearance. */
function looseKitchen(p: RoomPlacer): void {
  p.anyEdge("kitchen_block");
  p.anyEdge("fridge");
}

const SLEEPING: ReadonlySet<FurnitureKind> = new Set(["bed_double", "bed_single", "sleeping_pod"]);

/** Homes missing what makes them one: a unit with a bedroom or studio needs a bed or
 *  sleeping niche, and a unit with its own bathroom needs a toilet in it. */
export function incompleteHomes(rooms: readonly PlanRoom[], furniture: readonly PlanFurniture[]): string[] {
  const units = new Map<string, PlanRoom[]>();
  for (const room of rooms) if (room.unit) units.set(room.unit, [...units.get(room.unit) ?? [], room]);
  const holds = (members: PlanRoom[], kinds: readonly string[], pieces: (kind: FurnitureKind) => boolean) => {
    const own = members.filter(room => kinds.includes(room.kind));
    return !own.length || furniture.some(item => pieces(item.kind) && own.some(room => room.id === item.room));
  };
  return [...units].filter(([, members]) => !holds(members, ['bedroom', 'studio_main'], kind => SLEEPING.has(kind))
    || !holds(members, ['bathroom'], kind => kind === 'toilet')).map(([unit]) => unit);
}
