import type { FloorKind, FurnitureKind, RoomKind } from "../../core/types.js";
import type { EdgeName } from "../plan-types.js";
import {
  TEMPLATE_KEYS, type Axis, type LevelSpec, type PublicSlot, type ReferenceKind, type SpaceTemplate, type StyleId,
  type TemplateDoor, type TemplateFixture, type TemplateKey, type TemplateLine, type TemplateRoom, type TemplateSpan,
} from "./schema.js";

/** Compiles a reconstructed blueprint (`plan.json`) into a SpaceTemplate, optionally
 *  merged with a hand overlay. Pure: dimensions in, dimensions out. Image ids, notes,
 *  unknowns, confidences and the free-text `detail` block never reach the output.
 *
 *  CLI: node --import tsx src/layout/templates/compile.ts <plan.json> [<overlay.json>] [--key <key>] */

type P = [number, number];
interface Rect { u0: number; u1: number; v0: number; v1: number }
interface Edge { axis: Axis; c: number; lo: number; hi: number }
type Level = "lower" | "upper";

interface SourceRoom {
  planId: string; name: string; level: Level; rect: Rect; edges: Edge[]; curved: boolean;
  kind: RoomKind; role?: string; ceiling?: number; floorLevel?: number;
  /** open-plan kitchen: its area and fixtures join the level's living remainder */
  mergedInto?: SourceRoom;
  remainder?: boolean; id: string;
}

interface PlanOpening { id: string; kind: string; between: string[]; center: P; width: number }
interface PlanFixture { id: string; name: string; room: string; builtIn: boolean; center: P; size: [number, number, number];
  rotationDeg?: number; againstWall?: string }

const USE: Record<TemplateKey, { scope: "dwelling" | "public"; floorKinds: FloorKind[]; kinds: ReferenceKind[]; slot?: PublicSlot }> = {
  "e1-apartment": { scope: "dwelling", floorKinds: ["apartment", "hotel_rooms"], kinds: ["A"] },
  "e6-apartment2": { scope: "dwelling", floorKinds: ["apartment", "hotel_rooms"], kinds: ["A"] },
  "e2-floor": { scope: "public", floorKinds: ["apartment", "hotel_rooms"], kinds: ["A"], slot: "core-front" },
  "e5-lobby2": { scope: "public", floorKinds: ["lobby"], kinds: ["A"], slot: "ground-front" },
  "b2-suite": { scope: "dwelling", floorKinds: ["apartment", "hotel_rooms"], kinds: ["B"] },
  "b3-apartment": { scope: "dwelling", floorKinds: ["apartment"], kinds: ["B"] },
  "b4-loft": { scope: "dwelling", floorKinds: ["apartment"], kinds: ["B"] },
  "b1-floor": { scope: "public", floorKinds: ["lobby"], kinds: ["B"], slot: "ground-front" },
  "c1-capsule": { scope: "dwelling", floorKinds: ["apartment", "residence_studio"], kinds: ["C"] },
  "c6-studio": { scope: "dwelling", floorKinds: ["apartment", "residence_studio"], kinds: ["C"] },
  "c7-room": { scope: "dwelling", floorKinds: ["apartment", "residence_studio"], kinds: ["C"] },
  "c2-corridors": { scope: "public", floorKinds: ["apartment", "residence_studio", "lobby"], kinds: ["C"], slot: "corridor" },
  "c3-poor": { scope: "public", floorKinds: ["lobby"], kinds: ["C"], slot: "ground-front" },
  "c4-bathroom": { scope: "public", floorKinds: ["lobby"], kinds: ["C"], slot: "service" },
  "c5-machine": { scope: "public", floorKinds: ["lobby", "apartment"], kinds: ["C"], slot: "service" },
  "r1-office": { scope: "public", floorKinds: ["office", "corpo_office"], kinds: ["R"], slot: "hall" },
};

const SERVICE_KINDS: ReadonlySet<RoomKind> = new Set(["bathroom", "kitchen", "storage", "toilets", "mechanical_room"]);
const COMMON_KINDS: ReadonlySet<RoomKind> = new Set(["reception", "lounge", "corridor", "office_open", "elevator_lobby"]);
const STRIPPED = new Set(["images", "notes", "unknowns", "confidence", "detail", "$remove"]);
const MERGE_TOL = 0.02;
const r2 = (x: number): number => Math.round(x * 100) / 100 + 0;
const r05 = (x: number): number => Math.round(x * 20) / 20 + 0;

/** plan.json (+ overlay) -> SpaceTemplate. */
export function compilePlan(plan: unknown, overlay?: unknown, key?: TemplateKey): SpaceTemplate {
  const src = obj(plan);
  const templateKey = resolveKey(key, overlay, src);
  const use = USE[templateKey];
  const sid = templateKey.slice(0, 2) as StyleId;
  const openings = arr(src.openings).map(parseOpening).filter((o): o is PlanOpening => !!o);
  const fixturesIn = arr(src.fixtures).map(parseFixture).filter((f): f is PlanFixture => !!f);

  // 1. rooms in scope, levels, frame
  const raw = arr(src.rooms).map(item => {
    const room = obj(item);
    const polygon = arr(room.polygon).map(point).filter((p): p is P => !!p);
    return { id: str(room.id), name: str(room.name) || str(room.id), level: optStr(room.level), polygon,
      floorLevel: num(room.floorLevel), ceiling: num(room.ceilingHeight) };
  }).filter(room => room.id && room.polygon.length >= 3);
  const levelNames = [...new Set(raw.map(room => room.level ?? ""))];
  const levelRank = (name: string): number => {
    const own = raw.filter(room => (room.level ?? "") === name).map(room => room.floorLevel).filter((v): v is number => v !== undefined);
    const floor = own.length ? Math.min(...own) : 0;
    return floor + (/upper|mezz|second|top|loft|gallery|\b2\b/i.test(name) ? 100 : 0);
  };
  levelNames.sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b));
  const lowest = levelNames[0] ?? "";
  const twoLevel = templateKey === "b4-loft" && levelNames.length > 1;
  const scoped = raw.filter(room => {
    if (!twoLevel && (room.level ?? "") !== lowest && room.level !== undefined) return false;
    if (templateKey === "e2-floor") return /lobby|corridor|lift|elevator/i.test(room.name);
    return true;
  });
  const knownPlanIds = new Set(raw.map(room => room.id));
  if (!scoped.length) throw new Error("plan.json has no rooms in scope");
  const allPoints = scoped.flatMap(room => room.polygon);
  const minX = Math.min(...allPoints.map(p => p[0])), minY = Math.min(...allPoints.map(p => p[1]));
  const local = (p: P): P => [p[0] - minX, p[1] - minY];

  // 2. rectilinearise
  const rooms: SourceRoom[] = scoped.map(room => {
    const shape = rectilinear(room.polygon.map(local));
    const { kind, role } = classify(room.name, use.scope);
    return { planId: room.id, name: room.name, level: twoLevel && (room.level ?? "") !== lowest ? "upper" : "lower",
      rect: shape.rect, edges: shape.edges, curved: shape.curved, kind, role, id: "",
      ...(room.ceiling === undefined ? {} : { ceiling: room.ceiling }),
      ...(room.floorLevel === undefined ? {} : { floorLevel: room.floorLevel }) };
  });
  const byPlan = (ref: string): SourceRoom | undefined => {
    const lower = ref.toLowerCase();
    return rooms.find(room => room.planId === ref) ?? rooms.find(room => room.planId.toLowerCase() === lower)
      ?? rooms.find(room => room.name.toLowerCase() === lower);
  };

  // open-plan kitchens: a kitchen no door, sliding door or portal closes becomes living floor
  if (use.scope === "dwelling") for (const room of rooms) {
    if (room.kind !== "kitchen") continue;
    const walled = openings.some(o => /door|sliding|pocket|portal/i.test(o.kind) && !/lift|window/i.test(o.kind)
      && o.between.some(ref => byPlan(ref) === room));
    if (walled && !/open/i.test(room.name)) continue;
    const living = largest(rooms.filter(other => other.level === room.level && other.kind === "living" && !other.mergedInto));
    if (living) room.mergedInto = living;
  }
  const kept = rooms.filter(room => !room.mergedInto);

  // one remainder per level
  for (const level of ["lower", "upper"] as const) {
    const own = kept.filter(room => room.level === level);
    if (!own.length) continue;
    const pick = use.scope === "dwelling" ? largest(own.filter(room => room.kind === "living"))
      : largest(own.filter(room => COMMON_KINDS.has(room.kind)));
    (pick ?? largest(own)!).remainder = true;
  }

  // 3. lines
  const uLines = clusterLines(kept.flatMap(room => [room.rect.u0, room.rect.u1]), "u");
  const vLines = clusterLines(kept.flatMap(room => [room.rect.v0, room.rect.v1]), "v");
  const width = uLines.at(-1)!.ref, depth = vLines.at(-1)!.ref;
  const lineId = (axis: Axis, value: number): string => nearestLine(axis === "u" ? uLines : vLines, value).id;
  const dimensions = arr(src.dimensions).map(obj).map(d => ({ value: num(d.valueM), confidence: num(d.confidence) }))
    .filter((d): d is { value: number; confidence: number } => d.value !== undefined && d.confidence !== undefined);
  for (const lines of [uLines, vLines]) lines.forEach((line, i) => {
    const offGrid = Math.abs(line.ref - Math.round(line.ref / 0.5) * 0.5) > 0.05 + 1e-9;
    if (!offGrid || !dimensions.length) return;
    const near = [line.ref, i > 0 ? line.ref - lines[i - 1]!.ref : NaN, i + 1 < lines.length ? lines[i + 1]!.ref - line.ref : NaN];
    if (dimensions.some(d => d.confidence >= 0.7 && near.some(x => Math.abs(d.value - x) <= 0.05 + 1e-9))) line.exact = true;
  });

  // daylight: a window on the far wall; facade partitions end there
  const windows = openings.filter(o => /window/i.test(o.kind));
  const daylight: SpaceTemplate["daylight"] = windows.some(o => Math.abs(local(o.center)[1] - depth) <= 0.3) ? ["v1"] : [];
  if (daylight.includes("v1")) for (const room of kept) {
    if (Math.abs(room.rect.v1 - depth) > MERGE_TOL) continue;
    for (const value of [room.rect.u0, room.rect.u1]) {
      const line = nearestLine(uLines, value);
      if (line !== uLines[0] && line !== uLines.at(-1)) line.facade = true;
    }
  }

  // 4. spans: classified by the non-remainder rooms that depend on them
  const spans: TemplateSpan[] = [];
  for (const [axis, lines] of [["u", uLines], ["v", vLines]] as const) for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i]!, b = lines[i + 1]!, ref = b.ref - a.ref;
    const covering = kept.filter(room => !room.remainder && (axis === "u"
      ? room.rect.u0 <= a.ref + MERGE_TOL && room.rect.u1 >= b.ref - MERGE_TOL
      : room.rect.v0 <= a.ref + MERGE_TOL && room.rect.v1 >= b.ref - MERGE_TOL));
    const service = (room: SourceRoom) => SERVICE_KINDS.has(room.kind) || room.role === "dressing";
    let span: TemplateSpan;
    if (covering.length && covering.every(service)) span = { from: a.id, to: b.id, min: r2(ref), max: r2(ref), weight: 0 };
    else if (covering.length && covering.every(room => service(room) || room.kind === "bedroom")) {
      span = { from: a.id, to: b.id, min: r2(Math.min(ref, Math.max(2.6, 0.8 * ref))), max: r2(1.4 * ref), weight: r2(0.5 * ref) };
    } else span = { from: a.id, to: b.id, min: r2(0.8 * ref), max: null, weight: r2(ref) };
    spans.push(span);
  }

  // 5. room ids and output rooms
  const taken = new Map<string, number>();
  for (const room of kept) room.id = uniqueId(baseRoomId(room), taken);
  for (const room of rooms) if (room.mergedInto) room.id = room.mergedInto.id;
  const outRooms: TemplateRoom[] = kept.map(room => {
    const out: TemplateRoom = { id: room.id, kind: room.kind, ...(room.role ? { role: room.role } : {}) };
    if (!room.remainder) {
      out.u = [lineId("u", room.rect.u0), lineId("u", room.rect.u1)];
      out.v = [lineId("v", room.rect.v0), lineId("v", room.rect.v1)];
    } else out.remainder = true;
    if (twoLevel) out.level = room.level;
    if (room.role === "foyer") out.keepouts = [{ u: [lineId("u", room.rect.u0), lineId("u", room.rect.u1)],
      v: [lineId("v", room.rect.v0), lineId("v", room.rect.v1)] }];
    if (room.ceiling !== undefined) out.ceiling = r2(room.ceiling);
    return out;
  });
  const outById = new Map(outRooms.map(room => [room.id, room]));

  // 6. openings -> doors
  const doors: TemplateDoor[] = [];
  const doorIds = new Map<string, number>();
  let entry: { door: TemplateDoor; v: number } | null = null;
  for (const opening of openings) {
    const kind = doorKind(opening.kind);
    if (!kind) continue;
    const ends = opening.between.slice(0, 2).map(ref => {
      const room = byPlan(ref);
      if (room) return room;
      return knownPlanIds.has(ref) ? null : "@public" as const;
    });
    if (ends.length < 2 || ends.some(end => end === null)) continue;
    const [a, b] = ends as (SourceRoom | "@public")[];
    const ida = a === "@public" ? "@public" : a!.id, idb = b === "@public" ? "@public" : b!.id;
    if (ida === idb) continue;
    const center = local(opening.center);
    const owners = [a, b].filter((end): end is SourceRoom => end !== "@public");
    const along = alongStretch(owners, center);
    const owner = a === "@public" ? idb : ida;
    const width = r05(opening.width);
    const leaves = kind === "open" ? Math.min(4, Math.max(1, Math.round(width / 0.9)))
      : kind === "pocket" ? width >= 1.4 ? 2 : 1 : 1;
    const isPublic = ida === "@public" || idb === "@public";
    const base = isPublic ? "public" : `${owner}-${owner === ida ? idb : ida}`;
    const door: TemplateDoor = { id: uniqueId(base, doorIds), between: [ida, idb], width, leaves: leaves as TemplateDoor["leaves"],
      kind, along, owner };
    doors.push(door);
    if (isPublic && (!entry || center[1] < entry.v)) entry = { door, v: center[1] };
  }
  if (entry) {
    const old = entry.door.id;
    entry.door.id = "entry";
    for (const door of doors) if (door !== entry.door && door.id === "entry") door.id = `${old}`;
  }

  // 7. fixtures
  const fixtures: TemplateFixture[] = [];
  const fixtureIds = new Map<string, number>();
  const allLines = { u: uLines, v: vLines };
  for (const piece of fixturesIn) {
    const mapped = fixtureKind(piece, sid);
    if (!mapped) continue;
    const room = byPlan(piece.room);
    if (!room) continue;
    const target = room.mergedInto ?? room;
    const center = local(piece.center);
    const rotation = quarter(piece.rotationDeg ?? 0);
    const extU = rotation === 90 || rotation === 270 ? piece.size[1] : piece.size[0];
    const extV = rotation === 90 || rotation === 270 ? piece.size[0] : piece.size[1];
    const fp: Rect = { u0: center[0] - extU / 2, u1: center[0] + extU / 2, v0: center[1] - extV / 2, v1: center[1] + extV / 2 };
    const wall = wallOf(piece.againstWall) ?? nearestWall(room.rect, fp);
    const out: TemplateFixture = { id: uniqueId(fixtureBase(mapped.kind), fixtureIds), room: target.id, kind: mapped.kind,
      ...(mapped.fit ? { fit: mapped.fit } : {}), required: mapped.required,
      wall: wall ?? "free", along: { centred: true }, size: [0, 0, 0], rotationDeg: 0 };
    if (wall) {
      const alongU = wall === "v0" || wall === "v1";
      const low = alongU ? fp.u0 : fp.v0;
      const line = nearestLine(allLines[alongU ? "u" : "v"], low);
      out.along = { line: line.id, offset: r2(low - line.ref) };
      out.size = [r05(alongU ? extU : extV), r05(alongU ? extV : extU), r05(piece.size[2])];
      out.rotationDeg = wall === "v0" ? 0 : wall === "v1" ? 180 : wall === "u0" ? 90 : 270;
      if (piece.builtIn) out.stretch = [alongU ? "u" : "v"];
    } else {
      out.size = [r05(piece.size[0]), r05(piece.size[1]), r05(piece.size[2])];
      out.rotationDeg = rotation;
      const home = target.rect;
      out.at = [r2(center[0] - home.u0), r2(center[1] - home.v0)];
    }
    fixtures.push(out);
  }
  let curve = 0;
  for (const room of kept) if (room.curved) {
    curve++;
    fixtures.push({ id: uniqueId(`curve-${curve}`, fixtureIds), room: room.id, kind: "ornament_wall", fit: `asm-${sid}-curve-${curve}`,
      required: false, wall: "free", along: { centred: true },
      size: [r05(room.rect.u1 - room.rect.u0), 0.2, r05(room.ceiling ?? 2.7)], rotationDeg: 0,
      at: [r2((room.rect.u1 - room.rect.u0) / 2), r2((room.rect.v1 - room.rect.v0) / 2)] });
  }

  // 8. level changes (LevelZones only up to 1.5 m; deeper ones are two-level templates)
  for (const change of arr(src.levelChanges).map(obj)) {
    const delta = num(change.deltaM);
    if (delta === undefined || Math.abs(delta) > 1.5 || Math.abs(delta) < 1e-3) continue;
    const where = change.where;
    const at = point(where) ?? pointText(where);
    const room = at ? kept.find(r => contains(r.rect, local(at)))
      : typeof where === "string" ? (byPlan(where) ?? rooms.find(r => r.name.toLowerCase().includes(where.toLowerCase())
        || where.toLowerCase().includes(r.name.toLowerCase()))) : undefined;
    const home = room?.mergedInto ?? room;
    if (!home || !room) continue;
    const zone: LevelSpec = { u: [lineId("u", room.rect.u0), lineId("u", room.rect.u1)],
      v: [lineId("v", room.rect.v0), lineId("v", room.rect.v1)], delta: r2(delta), edge: Math.abs(delta) > 0.45 ? "guard" : "step" };
    const out = outById.get(home.id)!;
    out.levels = [...out.levels ?? [], zone];
  }

  const lines: TemplateLine[] = [...uLines, ...vLines].map(line => ({ id: line.id, axis: line.axis, ref: r2(line.ref),
    ...(line.exact ? { exact: true } : {}), ...(line.facade ? { facade: true } : {}) }));
  const entryRoom = entry ? entry.door.owner! : null;
  const template: SpaceTemplate = {
    id: templateKey, version: 1, scope: use.scope, style: sid,
    use: { floorKinds: [...use.floorKinds], kinds: [...use.kinds], ...(use.slot ? { slot: use.slot } : {}) },
    envelope: { width: r2(width), depth: r2(depth), min: [r05(0.7 * width), r05(0.7 * depth)], max: [r05(2.5 * width), r05(2.5 * depth)] },
    entry: entry && entryRoom ? { room: entryRoom, door: "entry" } : null,
    daylight, mirror: "allow", lines, spans, rooms: outRooms, doors, fixtures,
    source: { key: templateKey, revision: "plan-1" },
  };
  const merged = overlay === undefined ? template : mergeOverlay(template, overlay) as SpaceTemplate;
  return strip(merged) as SpaceTemplate;
}

// ---------------------------------------------------------------- plan parsing

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function str(value: unknown): string { return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; }
function optStr(value: unknown): string | undefined { const s = str(value); return s ? s : undefined; }
function num(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function point(value: unknown): P | undefined {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") return [value[0], value[1]];
  const o = obj(value);
  const x = num(o.x), y = num(o.y);
  return x !== undefined && y !== undefined ? [x, y] : undefined;
}
function pointText(value: unknown): P | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^\s*\[?\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*\]?\s*$/.exec(value);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

function parseOpening(value: unknown): PlanOpening | null {
  const o = obj(value);
  const center = point(o.center), width = num(o.width);
  if (!center || width === undefined) return null;
  return { id: str(o.id), kind: str(o.kind).toLowerCase(), between: arr(o.between).map(str).filter(Boolean), center, width };
}

function parseFixture(value: unknown): PlanFixture | null {
  const o = obj(value);
  const center = point(o.center);
  const size = arr(o.size).map(num);
  if (!center || size.length < 2 || size.slice(0, 2).some(v => v === undefined)) return null;
  return { id: str(o.id), name: str(o.name), room: str(o.room), builtIn: o.builtIn === true, center,
    size: [size[0]!, size[1]!, size[2] ?? 0.9], rotationDeg: num(o.rotationDeg), againstWall: optStr(o.againstWall) };
}

function resolveKey(key: TemplateKey | undefined, overlay: unknown, plan: Record<string, unknown>): TemplateKey {
  const candidates = [key, obj(overlay).id, plan.key, plan.id, obj(plan.source).key];
  for (const candidate of candidates) if (typeof candidate === "string" && (TEMPLATE_KEYS as readonly string[]).includes(candidate)) {
    return candidate as TemplateKey;
  }
  throw new Error("template key unknown: pass --key <key> (or an overlay with its id)");
}

// ---------------------------------------------------------------- geometry

/** Edges within 10 degrees of an axis snap to it; a room with any other edge is curved
 *  or diagonal and keeps only its bounding rectangle. */
function rectilinear(polygon: P[]): { rect: Rect; edges: Edge[]; curved: boolean } {
  const n = polygon.length;
  const tan10 = Math.tan((10 * Math.PI) / 180);
  const kinds = polygon.map((a, i) => {
    const b = polygon[(i + 1) % n]!;
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dx < 1e-9 && dy < 1e-9) return "none" as const;
    return dy <= dx * tan10 ? "h" as const : dx <= dy * tan10 ? "v" as const : "d" as const;
  });
  const bounds = (points: P[]): Rect => ({ u0: Math.min(...points.map(p => p[0])), u1: Math.max(...points.map(p => p[0])),
    v0: Math.min(...points.map(p => p[1])), v1: Math.max(...points.map(p => p[1])) });
  if (kinds.some(kind => kind === "d")) {
    const rect = bounds(polygon);
    return { rect, edges: rectEdges(rect), curved: true };
  }
  const snapped: P[] = polygon.map((p, i) => {
    const prev = (i - 1 + n) % n;
    let x = p[0], y = p[1];
    for (const e of [prev, i]) {
      const a = polygon[e]!, b = polygon[(e + 1) % n]!;
      if (kinds[e] === "v") x = (a[0] + b[0]) / 2;
      if (kinds[e] === "h") y = (a[1] + b[1]) / 2;
    }
    return [x, y];
  });
  const edges: Edge[] = [];
  snapped.forEach((a, i) => {
    const b = snapped[(i + 1) % n]!;
    if (kinds[i] === "h") edges.push({ axis: "u", c: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) });
    if (kinds[i] === "v") edges.push({ axis: "v", c: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) });
  });
  return { rect: bounds(snapped), edges: edges.filter(edge => edge.hi - edge.lo > 1e-6), curved: false };
}

function rectEdges(rect: Rect): Edge[] {
  return [{ axis: "u", c: rect.v0, lo: rect.u0, hi: rect.u1 }, { axis: "u", c: rect.v1, lo: rect.u0, hi: rect.u1 },
    { axis: "v", c: rect.u0, lo: rect.v0, hi: rect.v1 }, { axis: "v", c: rect.u1, lo: rect.v0, hi: rect.v1 }];
}

function contains(rect: Rect, p: P): boolean {
  return p[0] >= rect.u0 - 1e-6 && p[0] <= rect.u1 + 1e-6 && p[1] >= rect.v0 - 1e-6 && p[1] <= rect.v1 + 1e-6;
}

function largest(rooms: SourceRoom[]): SourceRoom | undefined {
  const area = (room: SourceRoom) => (room.rect.u1 - room.rect.u0) * (room.rect.v1 - room.rect.v0);
  return rooms.reduce<SourceRoom | undefined>((best, room) => !best || area(room) > area(best) + 1e-9 ? room : best, undefined);
}

interface WorkLine { id: string; axis: Axis; ref: number; exact?: boolean; facade?: boolean }

function clusterLines(values: number[], axis: Axis): WorkLine[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const last = groups.at(-1);
    if (last && value - last[last.length - 1]! <= MERGE_TOL) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group, i) => ({ id: `${axis}${i}`, axis, ref: r2(group.reduce((s, v) => s + v, 0) / group.length) }));
}

function nearestLine(lines: WorkLine[], value: number): WorkLine {
  return lines.reduce((best, line) => Math.abs(line.ref - value) < Math.abs(best.ref - value) ? line : best, lines[0]!);
}

/** 0..1 position of a door centre along the stretch its rooms share (or its owner's wall). */
function alongStretch(rooms: SourceRoom[], center: P): number {
  const found = rooms.map(room => {
    let best: Edge | null = null, distance = Infinity;
    for (const edge of room.edges) {
      const t = edge.axis === "u" ? center[0] : center[1];
      const c = edge.axis === "u" ? center[1] : center[0];
      const outside = Math.max(0, edge.lo - t, t - edge.hi);
      const d = Math.hypot(c - edge.c, outside);
      if (d < distance) { distance = d; best = edge; }
    }
    return distance <= 0.5 ? best : null;
  }).filter((edge): edge is Edge => !!edge);
  if (!found.length) return 0.5;
  let { axis, lo, hi } = found[0]!;
  const other = found[1];
  if (other && other.axis === axis && Math.abs(other.c - found[0]!.c) <= 0.1) {
    const l = Math.max(lo, other.lo), h = Math.min(hi, other.hi);
    if (h - l > 1e-6) { lo = l; hi = h; }
  }
  const t = axis === "u" ? center[0] : center[1];
  const value = hi - lo > 1e-6 ? (t - lo) / (hi - lo) : 0.5;
  return r2(Math.min(0.95, Math.max(0.05, value)));
}

function wallOf(value: string | undefined): EdgeName | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase().trim();
  if (v === "u0" || v === "u1" || v === "v0" || v === "v1") return v;
  if (/left/.test(v)) return "u0";
  if (/right/.test(v)) return "u1";
  if (/back|far|rear/.test(v)) return "v1";
  if (/front|entry|entrance/.test(v)) return "v0";
  return undefined;
}

function nearestWall(room: Rect, fp: Rect): EdgeName | undefined {
  const gaps: [EdgeName, number][] = [["v0", fp.v0 - room.v0], ["v1", room.v1 - fp.v1], ["u0", fp.u0 - room.u0], ["u1", room.u1 - fp.u1]];
  const [edge, gap] = gaps.reduce((best, item) => Math.abs(item[1]) < Math.abs(best[1]) ? item : best);
  return Math.abs(gap) <= 0.4 ? edge : undefined;
}

function quarter(deg: number): 0 | 90 | 180 | 270 {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

// ---------------------------------------------------------------- vocabularies

/** Room names -> RoomKind + planning role (00-PLAN §2.4 step 5). */
export function classify(name: string, scope: "dwelling" | "public"): { kind: RoomKind; role?: string } {
  const n = name.toLowerCase();
  if (/(lift|elevator)\s*(lobby|landing|hall)/.test(n)) return { kind: "elevator_lobby" };
  if (/restroom|toilets\b|lavatories|public bath|washroom/.test(n)) return { kind: "toilets" };
  if (/machine|plant room|electrical|mechanical|boiler|generator/.test(n)) return { kind: "mechanical_room" };
  if (/terrace|balcony/.test(n)) return { kind: "terrace_open" };
  if (/executive/.test(n)) return { kind: "executive_office" };
  if (/meeting|conference/.test(n)) return { kind: "meeting" };
  if (/kitchen/.test(n)) return { kind: "kitchen", role: "kitchen" };
  if (/\bbar\b/.test(n)) return scope === "dwelling" ? { kind: "living", role: "bar" } : { kind: "bar" };
  if (/lobby|reception/.test(n)) return { kind: "reception", role: "lobby" };
  if (/corridor|gallery|hallway|passage|landing/.test(n)) return { kind: "corridor" };
  if (/foyer|vestibule|entry|entrance|\bhall\b/.test(n)) return scope === "dwelling" ? { kind: "living", role: "foyer" } : { kind: "reception", role: "lobby" };
  if (/bed|sleep|capsule pod/.test(n)) return { kind: "bedroom", role: "bedroom" };
  if (/bath|shower|\bwc\b|toilet|powder/.test(n)) return { kind: "bathroom", role: "bath" };
  if (/wardrobe|dressing|walk-?in|closet/.test(n)) return { kind: "storage", role: "dressing" };
  if (/study|office|library|den\b/.test(n)) return scope === "dwelling" ? { kind: "office_private", role: "study" } : { kind: "office_private" };
  if (/storage|store|pantry|utility|laundry|cupboard/.test(n)) return { kind: "storage" };
  if (/dining/.test(n)) return scope === "dwelling" ? { kind: "living", role: "dining" } : { kind: "dining_area" };
  if (/stair/.test(n)) return scope === "dwelling" ? { kind: "living", role: "stair" } : { kind: "corridor", role: "stair" };
  if (/living|lounge|salon|great room|sitting|family/.test(n)) return scope === "dwelling" ? { kind: "living", role: "living" } : { kind: "lounge" };
  return scope === "dwelling" ? { kind: "living", role: "living" } : { kind: "lounge" };
}

const ROLE_ID: Record<string, string> = { bedroom: "bed", bath: "bath" };
const KIND_ID: Partial<Record<RoomKind, string>> = {
  corridor: "corridor", elevator_lobby: "lift-lobby", toilets: "toilets", mechanical_room: "machine",
  terrace_open: "terrace", executive_office: "executive", meeting: "meeting", lounge: "lounge", storage: "storage",
  office_private: "office", reception: "lobby", bar: "bar", dining_area: "dining", office_open: "office-open",
};

function baseRoomId(room: SourceRoom): string {
  if (room.role) return ROLE_ID[room.role] ?? room.role;
  return KIND_ID[room.kind] ?? room.kind.replace(/_/g, "-");
}

function uniqueId(base: string, taken: Map<string, number>): string {
  const count = (taken.get(base) ?? 0) + 1;
  taken.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function doorKind(kind: string): TemplateDoor["kind"] | null {
  if (/window|lift|elevator/.test(kind)) return null;
  if (/sliding|pocket/.test(kind)) return "pocket";
  if (/portal/.test(kind)) return "portal";
  if (/arch|pass|open/.test(kind)) return "open";
  if (/door/.test(kind)) return "swing";
  return null;
}

/** Fixture names -> FurnitureKind (+ assembly/module fit) per 00-PLAN §2.4 step 7. */
function fixtureKind(piece: PlanFixture, sid: StyleId): { kind: FurnitureKind; fit?: string; required: boolean } | null {
  const n = piece.name.toLowerCase();
  const k = (kind: string, required = false, fit?: string) => ({ kind: kind as FurnitureKind, required, ...(fit ? { fit } : {}) });
  if (/bedside|night\s*stand|nightstand/.test(n)) return null;
  if (/\bbed\b|bed\s*frame|double bed|single bed|mattress/.test(n) || /^bed/.test(n)) {
    return k(Math.min(piece.size[0], piece.size[1]) >= 1.4 ? "bed_double" : "bed_single", true);
  }
  if (/sleeping pod|capsule bed|sleep niche/.test(n)) return k("sleeping_pod", true);
  if (/stool/.test(n)) return k("stool");
  if (/island|\bbar\b|bar counter/.test(n)) return k("bar_counter", true, `asm-${sid}-bar`);
  if (/kitchen|cooktop|hob|kitchenette/.test(n)) return k("kitchen_block", true, `asm-${sid}-kitchen`);
  if (/fridge|refrigerator/.test(n)) return k("fridge", true);
  if (/wardrobe|closet/.test(n)) return k("wardrobe", false, piece.builtIn ? `asm-${sid}-wardrobe` : undefined);
  if (/\btub\b|bathtub|bath tub/.test(n)) return k("bathtub", true);
  if (/urinal/.test(n)) return k("urinal");
  if (/stall|cubicle/.test(n)) return k("room_divider", true, `asm-${sid}-stall`);
  if (/terrarium/.test(n)) return k("ornament_wall", false, `asm-${sid}-terrarium`);
  if (/planter|trough/.test(n)) return k("plant", false, `asm-${sid}-planter`);
  if (/kiosk|payment/.test(n)) return k("reception_desk", false, `fit-${sid}-kiosk`);
  if (/reception|front desk|concierge/.test(n)) return k("reception_desk");
  if (/toilet|\bwc\b/.test(n)) return k("toilet", true);
  if (/sink|basin|vanity/.test(n)) return k("sink", true);
  if (/shower/.test(n)) return k("shower", true);
  if (/screen|\btv\b|television|monitor|display/.test(n)) return k("display_screen");
  if (/bookcase|library|shelving unit/.test(n)) return k("shelf");
  if (/shelf|shelves/.test(n)) return k("wall_shelf");
  if (/meeting table|conference table/.test(n)) return k("meeting_table");
  if (/desk/.test(n)) return k("desk");
  if (/sofa|couch|settee/.test(n)) return k("sofa");
  if (/coffee table|low table/.test(n)) return k("low_table");
  if (/dining table|table/.test(n)) return k("dining_table");
  if (/office chair/.test(n)) return k("office_chair");
  if (/chair|armchair/.test(n)) return k("chair");
  if (/bench/.test(n)) return k("bench");
  if (/divider|partition screen/.test(n)) return k("room_divider");
  if (/plant/.test(n)) return k("plant");
  if (/painting|artwork|\bart\b/.test(n)) return k("wall_art");
  return null;
}

function fixtureBase(kind: FurnitureKind): string {
  return kind === "bed_double" || kind === "bed_single" ? "bed" : kind === "kitchen_block" ? "kitchen"
    : kind === "bar_counter" ? "bar" : kind.replace(/_/g, "-");
}

// ---------------------------------------------------------------- overlay

const KEYED = new Set(["rooms", "doors", "fixtures", "lines", "spans"]);

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Overlay merge: arrays of rooms/doors/fixtures/lines by `id`, spans by `from`+`to`,
 *  objects recursively, everything else replaced. `"$remove": true` drops an item. */
export function mergeOverlay(base: unknown, overlay: unknown): unknown {
  if (!isPlain(overlay) || !isPlain(base)) return overlay === undefined ? base : overlay;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    if (KEYED.has(key) && Array.isArray(value) && Array.isArray(current)) out[key] = mergeArray(current, value, key === "spans");
    else if (isPlain(value) && isPlain(current)) out[key] = mergeOverlay(current, value);
    else out[key] = value;
  }
  return out;
}

function mergeArray(base: unknown[], overlay: unknown[], spans: boolean): unknown[] {
  const keyOf = (item: unknown): string => {
    const o = obj(item);
    return spans ? `${str(o.from)}>${str(o.to)}` : str(o.id);
  };
  const result = [...base];
  for (const item of overlay) {
    const key = keyOf(item);
    const index = result.findIndex(existing => keyOf(existing) === key);
    if (obj(item).$remove === true) {
      if (index >= 0) result.splice(index, 1);
    } else if (index >= 0) result[index] = mergeOverlay(result[index], item);
    else result.push(item);
  }
  return result;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !STRIPPED.has(key)).map(([key, item]) => [key, strip(item)]));
}

// ---------------------------------------------------------------- CLI

async function main(argv: string[]): Promise<void> {
  const { pathToFileURL } = await import("node:url");
  if (!argv[1] || import.meta.url !== pathToFileURL(argv[1]).href) return;
  const { readFileSync } = await import("node:fs");
  const args = argv.slice(2);
  let key: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key") key = args[++i];
    else files.push(args[i]!);
  }
  if (!files[0]) {
    process.stderr.write("usage: compile.ts <plan.json> [<overlay.json>] [--key <key>]\n");
    process.exitCode = 2;
    return;
  }
  const plan = JSON.parse(readFileSync(files[0], "utf8"));
  const overlay = files[1] ? JSON.parse(readFileSync(files[1], "utf8")) : undefined;
  const template = compilePlan(plan, overlay, key as TemplateKey | undefined);
  process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
}

const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (argv?.[1] && /compile\.(?:ts|js|mts|mjs)$/.test(argv[1])) void main(argv);
