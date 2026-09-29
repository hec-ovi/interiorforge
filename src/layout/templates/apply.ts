import type { Point } from "../../core/geom.js";
import { boundaryDistance, clipPolygonToRect, polygonArea, polygonBounds } from "../../core/geom.js";
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from "../../core/types.js";
import { commonTransit } from "../architecture-access.js";
import { WALL } from "../constants.js";
import type { CorePlan } from "../core-plan.js";
import { Facade, partitionConflicts } from "../openings.js";
import { coreRectsOf } from "../pier-align.js";
import type { EdgeName, PlanDoor, PlanRoom } from "../plan-types.js";
import { doorUvPoint } from "../plan-floor.js";
import { RoomRegion } from "../room-region.js";
import { roomArea, roomPolygon, sharedRoomEdges } from "../room-shape.js";
import { MIN_STRETCH, type IdGen } from "../rooms.js";
import type { ProgramChange } from "../service-program.js";
import { facadeDepth } from "../shell.js";
import { gridOrigin } from "../tile-fit.js";
import { toWorldPolygon, uvToWorld, worldToUv, type UvRect } from "../uv.js";
import { fitTemplate } from "./fit.js";
import { dwellingTemplates, publicTemplates } from "./registry.js";
import type { PublicSlot, SpaceTemplate, TemplateFit, TemplateTarget } from "./schema.js";

export interface TemplateContext {
  request: InteriorRequest;
  floor: BlueprintFloor;
  kind: FloorKind;
  core: CorePlan;
  /** construction plate, uv */
  plate: Point[];
  /** floor outline, uv */
  outline: Point[];
  rooms: PlanRoom[];
  ids: IdGen;
  /** furnishes candidate rooms the way the floor will; false rejects the candidate */
  furnishes: (rooms: PlanRoom[]) => boolean;
  /** units (or common room ids) a previous attempt of this floor could not keep templated */
  exclude?: ReadonlySet<string>;
  /** floor ceiling height and glass head, floor-local metres */
  ceiling?: { height: number; glassHead: number };
  /** test override of the registry */
  templates?: { dwellings?: SpaceTemplate[]; hall?: SpaceTemplate[] };
}

export interface TemplateResult {
  rooms: PlanRoom[];
  changes: ProgramChange[];
  /** templated unit (or hall room) id -> its template key and room ids */
  templated: Map<string, { key: string; rooms: string[] }>;
}

/** The plan-floor hook: replaces generic dwellings (and office halls) with fitted authored
 *  templates where they fit, keeps the generic program where they do not. Never throws. */
export function applySpaceTemplates(ctx: TemplateContext): TemplateResult {
  const templated = new Map<string, { key: string; rooms: string[] }>();
  const changes: ProgramChange[] = [];
  let rooms = ctx.rooms;
  const dwellings = ctx.templates?.dwellings ?? dwellingTemplates(ctx.request, ctx.kind);
  const slots = SLOT_TARGETS.map(item => ({ ...item,
    templates: item.slot === "hall" && ctx.templates?.hall ? ctx.templates.hall : publicTemplates(ctx.request, ctx.kind, item.slot) }))
    .filter(item => item.templates.length);
  if (!dwellings.length && !slots.length) return { rooms, changes, templated };
  const facade = new Facade(ctx.floor, ctx.request.blueprint.facade);
  const reach = facadeDepth(ctx.request.blueprint.facade) + WALL / 2;
  const seatCache = new Map<string, boolean>();
  const seatLegal = (point: Point): boolean => {
    const key = `${point[0].toFixed(3)}:${point[1].toFixed(3)}`;
    let legal = seatCache.get(key);
    if (legal === undefined) {
      legal = facade.crossedBy(uvToWorld(point, ctx.core.frame), WALL / 2, reach) === null;
      seatCache.set(key, legal);
    }
    return legal;
  };
  const origin = gridOrigin(ctx.outline);
  const ceiling = ctx.ceiling;
  const probe = (candidate: PlanRoom[], own: PlanRoom[]): boolean => {
    const conflicts = partitionConflicts({ rooms: own.map(room => ({ id: room.id, kind: room.kind,
      polygon: toWorldPolygon(roomPolygon(room), ctx.core.frame), doors: [] })) }, ctx.floor,
      ctx.request.blueprint.facade, toWorldPolygon(ctx.plate, ctx.core.frame));
    if (conflicts.length) return false;
    return ctx.furnishes(candidate);
  };

  if (dwellings.length) {
    const units = discoverUnits(rooms, ctx);
    units.forEach((unit, index) => {
      if (ctx.exclude?.has(unit.id)) return;
      const target: TemplateTarget = { ...unit.target, seatLegal, gridOrigin: origin, ...(ceiling ? { ceiling } : {}) };
      let fit: TemplateFit | null = null;
      let key = "";
      for (let k = 0; k < dwellings.length && !fit; k++) {
        const template = dwellings[(index + k) % dwellings.length]!;
        fit = safeFit(template, target, unit.id, ctx.ids, (candidate) =>
          probe(candidate, candidate.filter(room => room.unit === unit.id)));
        if (fit) key = template.id;
      }
      if (!fit) {
        const first = dwellings[index % dwellings.length]!;
        const [w, d] = widthDepth(unit.target);
        if (w >= first.envelope.min[0] && d >= first.envelope.min[1])
          changes.push({ kind: "living", requested: [first.envelope.width, first.envelope.depth], fitted: null });
        return;
      }
      rooms = replaceRooms(rooms, unit.rooms, fit.rooms);
      templated.set(unit.id, { key, rooms: fit.rooms.map(room => room.id) });
      changes.push(...fit.changes);
    });
  }

  // Common rooms an authored public template refines in place: it keeps the room's id and
  // doors and carves its own rooms out of it (office halls, lobbies, restrooms, plant rooms).
  const street = streetDoor(ctx);
  for (const slot of slots) {
    const targets = rooms.filter(room => !room.unit && slot.kinds.includes(room.kind) && !ctx.exclude?.has(room.id))
      .sort((a, b) => roomArea(b) - roomArea(a) || a.id.localeCompare(b.id)).slice(0, slot.count);
    targets.forEach((room, index) => {
      const fitting = slot.templates.filter(t => remainderKind(t) === room.kind || slot.slot === "hall");
      if (!fitting.length) return;
      const template = fitting[index % fitting.length]!;
      const facadeEdges = facadeEdgesOf(room.rect, ctx.plate);
      for (const entryEdge of entryEdges(slot.slot, room, facadeEdges, template, street)) {
        const target: TemplateTarget = { rect: room.rect, polygon: roomPolygon(room, ctx.outline),
          ...(room.holes?.length ? { holes: room.holes } : {}), entryEdge, publicRoom: room, facadeEdges,
          seatLegal, gridOrigin: origin, ...(ceiling ? { ceiling } : {}) };
        const fit = safeFit(template, target, undefined, ctx.ids, (candidate) => {
          const kept = candidate.find(item => item.id === room.id)!;
          const reaches = (a: PlanRoom, b: PlanRoom) => sharedRoomEdges(a, b).some(edge => edge.hi - edge.lo >= MIN_STRETCH);
          // every room that opened onto it still shares a wall with what is left of it, and so
          // does every room its own doors lead to
          const stillReached = rooms.every(other => other === room || !other.doors.some(door => door.to === room.id)
            || reaches(other, kept)) && kept.doors.every(door => {
              const other = rooms.find(item => item.id === door.to);
              return !other || reaches(kept, other);
            });
          return stillReached && probe(candidate, candidate.filter(item => item.id !== room.id));
        }, room);
        if (!fit) continue;
        rooms = replaceRooms(rooms, [room], fit.rooms);
        templated.set(room.id, { key: template.id, rooms: fit.rooms.map(item => item.id) });
        changes.push(...fit.changes);
        break;
      }
    });
  }
  return { rooms, changes, templated };
}

function safeFit(template: SpaceTemplate, target: TemplateTarget, unit: string | undefined, ids: IdGen,
  probe: (rooms: PlanRoom[]) => boolean, keep?: PlanRoom): TemplateFit | null {
  try {
    return fitTemplate(template, target, unit, ids, probe, keep);
  } catch {
    // a template problem refuses the template, never the building
    return null;
  }
}

const SPINE = new Set(["corridor", "elevator_lobby", "concourse"]);

/** Which common rooms each public slot refines, and how many per floor. */
const SLOT_TARGETS: { slot: PublicSlot; kinds: RoomKind[]; count: number }[] = [
  { slot: "hall", kinds: ["office_open"], count: 2 },
  { slot: "ground-front", kinds: ["reception"], count: 1 },
  { slot: "service", kinds: ["toilets", "mechanical_room"], count: 4 },
];

function remainderKind(template: SpaceTemplate): RoomKind | undefined {
  return template.rooms.find(room => room.remainder && room.level !== "upper")?.kind;
}

/** Local entry edges to try for a refined common room: a hall looks out of its far wall,
 *  a lobby turns its front to the street door, a service room to its own door. */
function entryEdges(slot: PublicSlot, room: PlanRoom, facade: EdgeName[], template: SpaceTemplate,
  street: Point | null): EdgeName[] {
  const all: EdgeName[] = ["v0", "v1", "u0", "u1"];
  if (slot === "hall" || template.daylight.length) return all.filter(edge => facade.includes(opposite(edge)));
  const r = room.rect;
  const at = slot === "ground-front" ? street : room.doors[0] ? doorUvPoint(room.doors[0], room) : null;
  if (!at) return all;
  const distance = (edge: EdgeName) => edge === "v0" ? Math.abs(at[1] - r.v) : edge === "v1" ? Math.abs(at[1] - r.v - r.lv)
    : edge === "u0" ? Math.abs(at[0] - r.u) : Math.abs(at[0] - r.u - r.lu);
  return [...all].sort((a, b) => distance(a) - distance(b));
}

/** The main street door of the floor, in uv, when it has one. */
function streetDoor(ctx: TemplateContext): Point | null {
  const openings = ctx.floor.openings.filter(o => o.kind !== "window");
  const main = openings.find(o => (o as { doorRole?: string }).doorRole === "main") ?? openings[0];
  if (!main) return null;
  const a = ctx.floor.outline[main.edge]!, b = ctx.floor.outline[(main.edge + 1) % ctx.floor.outline.length]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (main.offset + main.width / 2) / length;
  return worldToUv([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ctx.core.frame);
}

interface Unit { id: string; rooms: PlanRoom[]; target: Omit<TemplateTarget, "seatLegal" | "gridOrigin">; angle: number; at: Point }

/** Dwellings that are one shape (a rectangle, or one notched by the core) with exactly one
 *  door to common circulation, in parity order around the core. */
function discoverUnits(rooms: PlanRoom[], ctx: TemplateContext): Unit[] {
  const groups = new Map<string, PlanRoom[]>();
  for (const room of rooms) if (room.unit) groups.set(room.unit, [...groups.get(room.unit) ?? [], room]);
  const byId = new Map(rooms.map(room => [room.id, room]));
  const core = coreRectsOf(ctx.core);
  const coreBounds = polygonBounds(core.flatMap(rect => [[rect.u, rect.v], [rect.u + rect.lu, rect.v + rect.lv]] as Point[]));
  const centre: Point = [coreBounds.x + coreBounds.w / 2, coreBounds.z + coreBounds.d / 2];
  const out: Unit[] = [];
  for (const [id, own] of groups) {
    const polygons = own.map(room => roomPolygon(room, ctx.outline));
    const b = polygonBounds(polygons.flat());
    const rect: UvRect = { u: b.x, v: b.z, lu: b.w, lv: b.d };
    const area = own.reduce((sum, room) => sum + roomArea(room, ctx.outline), 0);
    const clipped = clipPolygonToRect(ctx.plate, b);
    if (clipped.length < 3) continue;
    const shapes = new RoomRegion(clipped).subtract(core.filter(cut => overlaps(cut, rect)));
    if (shapes.length !== 1) continue;
    const shape = shapes[0]!;
    if (Math.abs(roomArea(shape) - area) > Math.max(0.05, area * 1e-3)) continue;
    // the one public door, from either side
    const entries: { door: PlanDoor; owner: PlanRoom; common: PlanRoom }[] = [];
    for (const room of own) for (const door of room.doors) {
      const other = byId.get(door.to);
      if (other && commonTransit(other)) entries.push({ door, owner: room, common: other });
    }
    for (const other of rooms) if (commonTransit(other)) for (const door of other.doors) {
      if (own.some(room => room.id === door.to)) entries.push({ door, owner: other, common: other });
    }
    // one public door; a unit that also opens onto a lounge keeps its corridor door
    const spine = entries.length > 1 ? entries.filter(entry => SPINE.has(entry.common.kind)) : entries;
    if (spine.length !== 1 || spine[0]!.door.openFront) continue;
    const { door, owner, common } = spine[0]!;
    const at = doorUvPoint(door, owner);
    const edge = edgeAt(rect, at);
    if (!edge) continue;
    const polygon = shape.polygon ?? [];
    out.push({ id, rooms: own, angle: Math.atan2(at[1] - centre[1], at[0] - centre[0]), at,
      target: { rect, polygon, ...(shape.holes?.length ? { holes: shape.holes } : {}), entryEdge: edge,
        publicRoom: common, facadeEdges: facadeEdgesOf(rect, ctx.plate),
        entryDoor: { width: door.width, leaves: (door.leaves ?? 1) as 1 | 2 | 3 | 4,
          ...(door.openFront || door.clearDepth === undefined ? {} : { clearDepth: door.clearDepth }), at } } });
  }
  return out.sort((a, b) => a.angle - b.angle || a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}

function edgeAt(rect: UvRect, [u, v]: Point): EdgeName | null {
  const tol = 0.02;
  if (Math.abs(v - rect.v) < tol) return "v0";
  if (Math.abs(v - rect.v - rect.lv) < tol) return "v1";
  if (Math.abs(u - rect.u) < tol) return "u0";
  if (Math.abs(u - rect.u - rect.lu) < tol) return "u1";
  return null;
}

/** Rect edges standing on the plate boundary over (nearly) their whole length. */
export function facadeEdgesOf(rect: UvRect, plate: readonly Point[]): EdgeName[] {
  const edges: [EdgeName, Point, Point][] = [
    ["v0", [rect.u, rect.v], [rect.u + rect.lu, rect.v]],
    ["v1", [rect.u, rect.v + rect.lv], [rect.u + rect.lu, rect.v + rect.lv]],
    ["u0", [rect.u, rect.v], [rect.u, rect.v + rect.lv]],
    ["u1", [rect.u + rect.lu, rect.v], [rect.u + rect.lu, rect.v + rect.lv]],
  ];
  return edges.filter(([, a, b]) => [0.2, 0.5, 0.8].every(t =>
    boundaryDistance([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], plate) < 0.05)).map(([edge]) => edge);
}

function opposite(edge: EdgeName): EdgeName {
  return edge === "v0" ? "v1" : edge === "v1" ? "v0" : edge === "u0" ? "u1" : "u0";
}

function widthDepth(target: Pick<TemplateTarget, "rect" | "entryEdge">): [number, number] {
  return target.entryEdge.startsWith("v") ? [target.rect.lu, target.rect.lv] : [target.rect.lv, target.rect.lu];
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;
}

/** Splice the fitted rooms where the old ones stood; drop every door into a removed room. */
function replaceRooms(rooms: PlanRoom[], removed: PlanRoom[], added: PlanRoom[]): PlanRoom[] {
  const gone = new Set(removed.map(room => room.id));
  const kept = new Set(added.map(room => room.id));
  const index = rooms.findIndex(room => gone.has(room.id));
  const out: PlanRoom[] = [];
  rooms.forEach((room, i) => {
    if (i === index) out.push(...added);
    if (gone.has(room.id)) return;
    out.push({ ...room, doors: room.doors.filter(door => !gone.has(door.to) || kept.has(door.to)) });
  });
  return out;
}

export { polygonArea };
