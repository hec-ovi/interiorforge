import type { Point } from "../../core/geom.js";
import { polygonArea } from "../../core/geom.js";
import { doorApproachFits, pocketInterval } from "../door-fit.js";
import { livingConnected } from "../living-connectivity.js";
import type { AuthoredPiece, EdgeName, PlanDoor, PlanRoom } from "../plan-types.js";
import { RoomRegion } from "../room-region.js";
import { roomCoversRect, sharedRoomEdges, type RoomShape, type RoomStretch } from "../room-shape.js";
import { BAND_CLEAR, doorWidthOn, MIN_STRETCH, type IdGen } from "../rooms.js";
import type { ProgramChange } from "../service-program.js";
import { uvRectCorners, type UvRect } from "../uv.js";
import { axisToUv, edgeToUv, localFrame, rectToUv, rotationToUv, toUv, type LocalFrame } from "./frame.js";
import type { FitProbe, SpaceTemplate, TemplateDoor, TemplateFit, TemplateLine, TemplateRoom, TemplateSpan,
  TemplateTarget } from "./schema.js";
import { positionsOf, snapAxis, solveAxis, type AxisSpan, type SnapCandidate } from "./solve.js";

const GRID = 0.5;
const EPS = 1e-6;
/** How far a facade partition may move from its solved place to find a legal seat. */
const SEAT_REACH = 1.5;
const SEAT_STEP = 0.05;
/** Smallest room side a template may be solved to, whatever it authors. */
const MIN_SIDE = 1.2;
/** Clearance a wall piece keeps from its wall (the placer needs 0.05). */
const WALL_GAP = 0.06;

/** Optional diagnostics sink for tuning templates (tests and review scripts). */
let trace: ((message: string) => void) | undefined;
export function traceTemplates(sink: ((message: string) => void) | undefined): void { trace = sink; }
export function templateTrace(message: string): void { trace?.(message); }
const refuse = (why: string): null => { trace?.(why); return null; };

interface AxisModel { lines: TemplateLine[]; spans: AxisSpan[]; rigid: boolean[] }
interface Solved { pos: Map<string, number>; exact: boolean }

/** Fits one template into one target: exact reference spans where they fit, weighted
 *  scaling within authored bounds, then optional rooms dropped in order; null refuses
 *  (the caller keeps its generic program). Never throws for geometry. */
export function fitTemplate(t: SpaceTemplate, target: TemplateTarget, unit: string | undefined, ids: IdGen,
  probe: FitProbe, keepRemainder?: PlanRoom): TemplateFit | null {
  const mirrors = t.mirror === "allow" ? [false, true] : [false];
  let best: (TemplateFit & { frame: LocalFrame }) | null = null;
  for (const mirrored of mirrors) {
    const frame = localFrame(target.rect, target.entryEdge, mirrored);
    // a hall's remainder absorbs any size above the minimum; a dwelling stays within its envelope
    if (frame.width < t.envelope.min[0] - EPS || frame.depth < t.envelope.min[1] - EPS
      || !keepRemainder && (frame.width > t.envelope.max[0] + EPS || frame.depth > t.envelope.max[1] + EPS))
      return refuse(`${t.id}: target ${frame.width.toFixed(2)}x${frame.depth.toFixed(2)} outside the envelope`);
    if (!t.daylight.every(edge => target.facadeEdges.includes(edgeToUv(frame, edge)))) {
      trace?.(`${t.id}: no daylight on ${t.daylight.join(',')} (facade ${target.facadeEdges.join(',')}, entry ${target.entryEdge})`);
      continue;
    }
    for (const dropped of dropSequence(t)) {
      const fit = attempt(t, target, frame, dropped, unit, probe, keepRemainder);
      if (!fit) continue;
      if (!best || fit.cost < best.cost - 1e-9) best = { ...fit, frame };
      break;
    }
    if (best?.exact && !best.dropped.length) break;
  }
  if (!best) return null;
  const { frame: _frame, ...fit } = best;
  trace?.(`fitted ${t.id} ${fit.exact ? "exact" : fit.dropped.length ? "dropped" : "scaled"} ${best.frame.width.toFixed(1)}x${best.frame.depth.toFixed(1)}`);
  return { ...fit, rooms: reId(fit.rooms, ids, keepRemainder) };
}

/** Progressive drop sets: nothing, then the optional rooms one at a time in `drop` order. */
function dropSequence(t: SpaceTemplate): string[][] {
  const optional = t.rooms.filter(room => room.optional && !room.remainder)
    .sort((a, b) => a.optional!.drop - b.optional!.drop || a.id.localeCompare(b.id));
  const out: string[][] = [[]];
  for (let i = 1; i <= optional.length; i++) out.push(optional.slice(0, i).map(room => room.id));
  return out;
}

function attempt(t: SpaceTemplate, target: TemplateTarget, frame: LocalFrame, dropped: string[],
  unit: string | undefined, probe: FitProbe, keepRemainder?: PlanRoom): TemplateFit | null {
  const active = t.rooms.filter(room => !dropped.includes(room.id) && room.level !== "upper");
  const remainder = active.find(room => room.remainder);
  if (!remainder) return refuse(`${t.id}: no remainder`);
  const placed = active.filter(room => !room.remainder && room.u && room.v);
  const targetShape: RoomShape = { rect: target.rect, polygon: target.polygon, holes: target.holes };

  const solved: Record<"u" | "v", Solved> = { u: { pos: new Map(), exact: true }, v: { pos: new Map(), exact: true } };
  for (const axis of ["u", "v"] as const) {
    const model = axisModel(t, axis, placed);
    if (!model) return refuse(`${t.id}: axis ${axis} has no lines`);
    const length = axis === "u" ? frame.width : frame.depth;
    const lengths = solveAxis(model.spans, length);
    if (!lengths) return refuse(`${t.id}: ${axis} ${length.toFixed(2)} below the span minimums`);
    const positions = positionsOf(lengths);
    positions[positions.length - 1] = length;
    const facade = facadeLines(t, axis, placed, frame, target);
    const phase = gridPhase(frame, axis, target.gridOrigin);
    const candidates = model.lines.map((line, i): SnapCandidate[] => {
      if (i === 0) return [{ at: 0, penalty: 0 }];
      if (i === model.lines.length - 1) return [{ at: length, penalty: 0 }];
      return lineCandidates(line, positions[i]!, length, phase, facade.get(line.id), frame, target);
    });
    const bounds = model.spans.map((span, i): [number, number] =>
      [Math.max(Math.min(span.min, lengths[i]!), MIN_SIDE * 0.5), Math.max(span.max, lengths[i]!)]);
    const snapped = snapAxis(positions, candidates, bounds);
    if (!snapped) return refuse(`${t.id}: ${axis} lines find no legal seats`);
    model.lines.forEach((line, i) => solved[axis].pos.set(line.id, snapped[i]!));
    solved[axis].exact = model.spans.every((span, i) => !model.rigid[i]
      || Math.abs(snapped[i + 1]! - snapped[i]! - span.ref) < 0.005);
  }
  const at = (axis: "u" | "v", id: string) => solved[axis].pos.get(id);

  // rooms, in the core frame
  const rooms: PlanRoom[] = [];
  const byId = new Map<string, PlanRoom>();
  const changes: ProgramChange[] = [];
  let cost = 0;
  const lineRef = new Map(t.lines.map(line => [`${line.axis}:${line.id}`, line.ref]));
  let probeCount = 0;
  const probeId = () => `tpl-${probeCount++}`;
  for (const room of placed) {
    const [x0, x1, y0, y1] = [at("u", room.u![0]), at("u", room.u![1]), at("v", room.v![0]), at("v", room.v![1])];
    if ([x0, x1, y0, y1].some(value => value === undefined)) return refuse(`${t.id}: ${room.id} lost a line`);
    const w = x1! - x0!, d = y1! - y0!;
    const clear = room.minClear ?? [MIN_SIDE, MIN_SIDE];
    if (w < Math.max(MIN_SIDE, clear[0]) - 1e-6 || d < Math.max(MIN_SIDE, clear[1]) - 1e-6) return refuse(`${t.id}: ${room.id} ${w.toFixed(2)}x${d.toFixed(2)} under its clear minimum`);
    const rect = rectToUv(frame, x0!, x1!, y0!, y1!);
    if (!roomCoversRect(targetShape, rect)) return refuse(`${t.id}: ${room.id} leaves the target shape at ${rect.u.toFixed(2)},${rect.v.toFixed(2)} ${rect.lu.toFixed(2)}x${rect.lv.toFixed(2)}`);
    const plan: PlanRoom = { id: probeId(), kind: room.kind, rect, polygon: uvRectCorners(rect), doors: [],
      ...(unit ? { unit } : {}), ...stamp(t, room, target, onFacade(rect, target)) };
    const keepouts = (room.keepouts ?? []).flatMap(k => {
      const kx0 = at("u", k.u[0]), kx1 = at("u", k.u[1]), ky0 = at("v", k.v[0]), ky1 = at("v", k.v[1]);
      return kx0 === undefined || kx1 === undefined || ky0 === undefined || ky1 === undefined ? []
        : [rectToUv(frame, kx0, kx1, ky0, ky1)];
    });
    if (keepouts.length) plan.furnishingKeepouts = keepouts;
    const levels = levelZones(room, frame, at);
    if (levels.length) plan.levels = levels;
    rooms.push(plan);
    byId.set(room.id, plan);
    const rw = lineRef.get(`u:${room.u![1]}`)! - lineRef.get(`u:${room.u![0]}`)!;
    const rd = lineRef.get(`v:${room.v![1]}`)! - lineRef.get(`v:${room.v![0]}`)!;
    cost += Math.abs(w - rw) / rw + Math.abs(d - rd) / rd;
    if (Math.abs(w - rw) > 0.05 || Math.abs(d - rd) > 0.05)
      changes.push({ kind: room.kind, requested: [round2(rw), round2(rd)], fitted: [round2(w), round2(d)] });
  }
  for (const id of dropped) {
    const room = t.rooms.find(item => item.id === id)!;
    const rw = room.u ? lineRef.get(`u:${room.u[1]}`)! - lineRef.get(`u:${room.u[0]}`)! : 0;
    const rd = room.v ? lineRef.get(`v:${room.v[1]}`)! - lineRef.get(`v:${room.v[0]}`)! : 0;
    changes.push({ kind: room.kind, requested: [round2(rw), round2(rd)], fitted: null });
    cost += 10;
  }
  const shapes = new RoomRegion(target.polygon, target.holes ?? []).subtract(rooms.map(room => room.rect));
  if (shapes.length !== 1) return refuse(`${t.id}: remainder splits into ${shapes.length}`);
  const shape = shapes[0]!;
  if (Math.abs(polygonArea(shape.polygon!)) < 4 || shape.rect.lu < MIN_SIDE || shape.rect.lv < MIN_SIDE) return refuse(`${t.id}: remainder too small`);
  if (!livingConnected(shape)) return refuse(`${t.id}: remainder necked`);
  const rest: PlanRoom = { ...shape, id: keepRemainder?.id ?? probeId(), kind: keepRemainder?.kind ?? remainder.kind,
    doors: keepRemainder ? keepRemainder.doors.map(door => ({ ...door })) : [],
    ...(unit ? { unit } : {}), ...stamp(t, remainder, target, target.facadeEdges.length > 0) };
  const remainderKeepouts = (remainder.keepouts ?? []).flatMap(k => {
    const kx0 = at("u", k.u[0]), kx1 = at("u", k.u[1]), ky0 = at("v", k.v[0]), ky1 = at("v", k.v[1]);
    return kx0 === undefined || kx1 === undefined || ky0 === undefined || ky1 === undefined ? []
      : [rectToUv(frame, kx0, kx1, ky0, ky1)];
  });
  if (remainderKeepouts.length) rest.furnishingKeepouts = remainderKeepouts;
  rooms.unshift(rest);
  byId.set(remainder.id, rest);

  // doors: the one public entrance first, then the private doors, then any repair a room needs
  const doorIds = () => `tpl-d${probeCount++}`;
  const publicRoom = target.publicRoom;
  const entryDoor = t.entry ? t.doors.find(door => door.id === t.entry!.door) : undefined;
  if (!keepRemainder) {
    if (!entryDoor) return refuse(`${t.id}: no entry door`);
    const entryRoom = byId.get(entryDoor.between.find(id => id !== "@public") ?? "");
    if (!entryRoom || !placeEntry(entryRoom, publicRoom, entryDoor, target, frame, doorIds)) return refuse(`${t.id}: entrance has no pocket wall or approach`);
  }
  for (const door of t.doors) {
    if (door === entryDoor || door.between.includes("@public")) continue;
    const a = byId.get(door.between[0]), b = byId.get(door.between[1]);
    if (!a || !b) continue;
    const owner = door.owner === door.between[1] ? b : a, other = owner === a ? b : a;
    placeInternal(owner, other, door, doorIds);
  }
  const entryRoom = keepRemainder ? rest : rooms.find(room => room.doors.some(door => door.to === publicRoom.id));
  if (!entryRoom || !connectAll(rooms, entryRoom, doorIds, keepRemainder)) return refuse(`${t.id}: rooms cannot all be reached`);

  // fixtures become authored pieces of their rooms
  for (const fixture of t.fixtures) {
    const room = byId.get(fixture.room);
    const spec = active.find(item => item.id === fixture.room);
    if (!room || !spec) continue;
    const piece = placeFixture(fixture, spec, room, frame, at, lineRef);
    if (piece) (room.authored ??= []).push(piece);
    else if (fixture.required) delete room.authored;
  }

  const candidate = keepRemainder ? rooms : [...rooms, publicRoom];
  if (!probe(candidate, t)) return refuse(`${t.id}: probe (facade seats or furnishing) failed`);
  return { rooms, mirrored: frame.mirrored, dropped, changes, cost,
    exact: solved.u.exact && solved.v.exact && !dropped.length };
}

function stamp(t: SpaceTemplate, room: TemplateRoom, target: TemplateTarget, glazed: boolean): Pick<PlanRoom, "style" | "template" | "role" | "ceilingDrop"> {
  // the reference room height as a drop below the floor's ceiling, never below the glass head
  let drop = room.ceilingDrop ?? (room.ceiling !== undefined && target.ceiling ? target.ceiling.height - room.ceiling : 0);
  if (glazed && target.ceiling) drop = Math.min(drop, target.ceiling.height - target.ceiling.glassHead);
  drop = Math.round(Math.min(2, Math.max(0, drop)) * 100) / 100;
  return { style: room.style ?? t.style, template: `${t.id}/${room.id}`,
    ...(room.role ? { role: room.role } : {}),
    ...(drop > 0 ? { ceilingDrop: drop } : {}) };
}

/** Whether a rectangle reaches one of the target's facade edges. */
function onFacade(rect: UvRect, target: TemplateTarget): boolean {
  const r = target.rect, eps = 1e-6;
  return target.facadeEdges.some(edge => edge === "v0" ? rect.v <= r.v + eps : edge === "v1" ? rect.v + rect.lv >= r.v + r.lv - eps
    : edge === "u0" ? rect.u <= r.u + eps : rect.u + rect.lu >= r.u + r.lu - eps);
}

/** The active lines of one axis and the spans between them. A span that merges several
 *  authored spans (a dropped room's lines vanished) is flexible where no room still
 *  covers it, so dropping a room really frees its space. */
function axisModel(t: SpaceTemplate, axis: "u" | "v", placed: TemplateRoom[]): AxisModel | null {
  const all = t.lines.filter(line => line.axis === axis).sort((a, b) => a.ref - b.ref);
  if (all.length < 2) return null;
  const used = new Set<string>([all[0]!.id, all.at(-1)!.id]);
  for (const room of placed) {
    for (const id of axis === "u" ? room.u! : room.v!) used.add(id);
    for (const k of room.keepouts ?? []) for (const id of axis === "u" ? k.u : k.v) used.add(id);
    for (const level of room.levels ?? []) for (const id of axis === "u" ? level.u : level.v) used.add(id);
  }
  const lines = all.filter(line => used.has(line.id));
  const authored = new Map(t.spans.map(span => [`${span.from}>${span.to}`, span]));
  const spans: AxisSpan[] = [], rigid: boolean[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i]!, b = lines[i + 1]!;
    const parts: TemplateSpan[] = [];
    for (let k = all.indexOf(a); k < all.indexOf(b); k++) {
      const from = all[k]!, to = all[k + 1]!;
      parts.push(authored.get(`${from.id}>${to.id}`)
        ?? { from: from.id, to: to.id, min: 0.8 * (to.ref - from.ref), max: null, weight: to.ref - from.ref });
    }
    const ref = b.ref - a.ref;
    if (ref <= EPS) return null;
    const covered = placed.some(room => {
      const [lo, hi] = (axis === "u" ? room.u! : room.v!).map(id => all.find(line => line.id === id)?.ref ?? NaN);
      return lo! <= a.ref + EPS && hi! >= b.ref - EPS;
    });
    if (parts.length > 1 && !covered) {
      // a remainder-only axis (every room on it dropped) takes whatever the target has
      spans.push({ ref, min: lines.length === 2 ? MIN_SIDE : Math.max(MIN_SIDE * 0.5, 0.6 * ref), max: Infinity, weight: ref });
      rigid.push(false);
      continue;
    }
    const max = parts.some(part => part.max === null || part.max === undefined) ? Infinity
      : parts.reduce((sum, part) => sum + (part.max as number), 0);
    spans.push({ ref, min: Math.min(ref, parts.reduce((sum, part) => sum + part.min, 0)), max: Math.max(max, ref),
      weight: parts.reduce((sum, part) => sum + part.weight, 0) });
    rigid.push(parts.every(part => part.weight === 0));
  }
  return { lines, spans, rigid };
}

interface FacadeWall { y?: number; x?: number }

/** Lines whose partition meets a facade: they must land on a legal seat there. */
function facadeLines(t: SpaceTemplate, axis: "u" | "v", placed: TemplateRoom[], frame: LocalFrame,
  target: TemplateTarget): Map<string, ("far" | "low" | "high")[]> {
  const out = new Map<string, ("far" | "low" | "high")[]>();
  const lines = t.lines.filter(line => line.axis === axis).sort((a, b) => a.ref - b.ref);
  const other = t.lines.filter(line => line.axis !== axis).sort((a, b) => a.ref - b.ref);
  const firstOther = other[0]?.id, lastOther = other.at(-1)?.id;
  const far = target.facadeEdges.includes(edgeToUv(frame, "v1"));
  const low = target.facadeEdges.includes(edgeToUv(frame, "u0"));
  const high = target.facadeEdges.includes(edgeToUv(frame, "u1"));
  const add = (id: string, wall: "far" | "low" | "high") => {
    if (id === lines[0]?.id || id === lines.at(-1)?.id) return;
    const list = out.get(id) ?? [];
    if (!list.includes(wall)) list.push(wall);
    out.set(id, list);
  };
  for (const room of placed) {
    if (axis === "u") {
      if (far && room.v![1] === lastOther) for (const id of room.u!) add(id, "far");
    } else {
      if (low && room.u![0] === firstOther) for (const id of room.v!) add(id, "low");
      if (high && room.u![1] === lastOther) for (const id of room.v!) add(id, "high");
    }
  }
  return out;
}

function gridPhase(frame: LocalFrame, axis: "u" | "v", origin: Point): number {
  const { uvAxis, origin: zero, sign } = axisToUv(frame, axis);
  return mod(sign * (origin[uvAxis]! - zero), GRID);
}

function lineCandidates(line: TemplateLine, solved: number, length: number, phase: number,
  walls: ("far" | "low" | "high")[] | undefined, frame: LocalFrame, target: TemplateTarget): SnapCandidate[] {
  const onGrid = (x: number) => Math.abs(mod(x - phase + GRID / 2, GRID) - GRID / 2) < 1e-4;
  if (walls?.length) {
    const legal = (x: number) => walls.every(wall => target.seatLegal(toUv(frame,
      wall === "far" ? [x, frame.depth] : wall === "low" ? [0, x] : [frame.width, x])));
    const out: SnapCandidate[] = [];
    for (let d = -SEAT_REACH; d <= SEAT_REACH + 1e-9; d += SEAT_STEP) {
      const x = Math.round((solved + d) * 1000) / 1000;
      if (x < MIN_SIDE * 0.5 || x > length - MIN_SIDE * 0.5 || !legal(x)) continue;
      out.push({ at: x, penalty: onGrid(x) ? 0 : 0.002 });
    }
    return out.sort((a, b) => Math.abs(a.at - solved) - Math.abs(b.at - solved)).slice(0, 10);
  }
  if (line.exact) return [{ at: solved, penalty: 0 }];
  const out: SnapCandidate[] = [{ at: solved, penalty: 0.003 }];
  const first = Math.ceil((solved - 0.5 - phase) / GRID) * GRID + phase;
  for (let x = first; x <= solved + 0.5 + 1e-9; x += GRID) {
    if (x > 1e-6 && x < length - 1e-6) out.push({ at: Math.round(x * 1e6) / 1e6, penalty: 0 });
  }
  return out;
}

function levelZones(room: TemplateRoom, frame: LocalFrame, at: (axis: "u" | "v", id: string) => number | undefined): NonNullable<PlanRoom["levels"]> {
  const out: NonNullable<PlanRoom["levels"]> = [];
  for (const level of room.levels ?? []) {
    const x0 = at("u", level.u[0]), x1 = at("u", level.u[1]), y0 = at("v", level.v[0]), y1 = at("v", level.v[1]);
    if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) continue;
    const rect = rectToUv(frame, x0, x1, y0, y1);
    const zone: NonNullable<PlanRoom["levels"]>[number] = { polygon: uvRectCorners(rect), delta: level.delta, edge: level.edge };
    if (level.stair) {
      const p: Point = level.stair.along === "u" ? [x0 + level.stair.at, y0] : [x0, y0 + level.stair.at];
      const { uvAxis } = axisToUv(frame, level.stair.along);
      zone.stair = { at: toUv(frame, p), axis: uvAxis === 0 ? "u" : "v", width: level.stair.width };
    }
    out.push(zone);
  }
  return out;
}

/** The unit's one public entrance: on the entry wall, with a pocket cassette's worth of
 *  solid wall on both sides and a clear approach in both rooms. */
function placeEntry(owner: PlanRoom, publicRoom: PlanRoom, door: TemplateDoor, target: TemplateTarget,
  frame: LocalFrame, nextId: () => string): boolean {
  const width = target.entryDoor?.width ?? door.width;
  const leaves = Math.min(2, target.entryDoor?.leaves ?? door.leaves) as 1 | 2;
  const edge = edgeToUv(frame, "v0");
  const stretches = sharedRoomEdges(owner, publicRoom).filter(s => s.edge === edge && s.hi - s.lo >= MIN_STRETCH);
  for (const stretch of stretches) {
    const interval = pocketInterval(stretch, width);
    if (!interval) continue;
    const alongU = edge.startsWith("v");
    const wanted = target.entryDoor ? target.entryDoor.at[alongU ? 0 : 1] : undefined;
    const preferred = [wanted, stretch.lo + (stretch.hi - stretch.lo) * door.along, (interval[0] + interval[1]) / 2,
      interval[0], interval[1]].filter((value): value is number => value !== undefined);
    for (const raw of preferred) {
      const centre = Math.min(interval[1], Math.max(interval[0], raw));
      const snapped = Math.min(interval[1], Math.max(interval[0], Math.round(centre * 4) / 4));
      for (const at of [snapped, centre]) {
        if (!doorApproachFits(owner, publicRoom, edge, stretch.c, at, width, 1.25)) continue;
        owner.doors.push({ id: nextId(), to: publicRoom.id, leaves, width, edge, at,
          position: alongU ? [at, stretch.c] : [stretch.c, at],
          ...(target.entryDoor?.clearDepth !== undefined ? { clearDepth: target.entryDoor.clearDepth }
            : door.kind !== "swing" ? { clearDepth: 0 } : {}) });
        return true;
      }
    }
  }
  return false;
}

/** A private door on the stretch two rooms share, at the authored place when its approach
 *  is clear, else at the usual fallback fractions. */
function placeInternal(owner: PlanRoom, other: PlanRoom, door: Pick<TemplateDoor, "width" | "leaves" | "kind" | "along">,
  nextId: () => string): boolean {
  const stretches = sharedRoomEdges(owner, other).filter(s => s.hi - s.lo >= MIN_STRETCH);
  for (const stretch of stretches) {
    const w = doorWidthOn(stretch.hi - stretch.lo, door.width);
    const leaves = (w < door.width - 1e-6 ? Math.max(1, Math.min(door.leaves, Math.round(w / 0.9))) : door.leaves) as 1 | 2 | 3 | 4;
    const span = stretch.hi - stretch.lo - w - 2 * BAND_CLEAR;
    for (const fraction of [door.along, 0.5, 0.25, 0.75, 0.1, 0.9]) {
      const at = span > 0 ? stretch.lo + w / 2 + BAND_CLEAR + span * fraction : (stretch.lo + stretch.hi) / 2;
      if (!doorApproachFits(owner, other, stretch.edge, stretch.c, at, w)) continue;
      owner.doors.push(internalDoor(nextId(), other.id, w, leaves, stretch, at, door.kind));
      return true;
    }
  }
  return false;
}

function internalDoor(id: string, to: string, width: number, leaves: 1 | 2 | 3 | 4, stretch: RoomStretch, at: number,
  kind: TemplateDoor["kind"]): PlanDoor {
  return { id, to, width, leaves, edge: stretch.edge, at,
    position: stretch.edge.startsWith("v") ? [at, stretch.c] : [stretch.c, at],
    ...(kind === "swing" ? {} : { clearDepth: 0 }) };
}

/** Every room reachable from the entrance through the unit's own doors; a room the authored
 *  doors left isolated gets a plain door to a reachable neighbour, or the fit fails. */
function connectAll(rooms: PlanRoom[], entry: PlanRoom, nextId: () => string, keep?: PlanRoom): boolean {
  const own = new Set(rooms.map(room => room.id));
  for (let guard = 0; guard <= rooms.length; guard++) {
    const reached = new Set([entry.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const room of rooms) for (const door of room.doors) {
        if (!own.has(door.to)) continue;
        if (reached.has(room.id) !== reached.has(door.to)) { reached.add(room.id); reached.add(door.to); grew = true; }
      }
    }
    const missing = rooms.filter(room => !reached.has(room.id));
    if (!missing.length) return true;
    let fixed = false;
    for (const room of missing) {
      const neighbours = rooms.filter(other => reached.has(other.id))
        .sort((a, b) => (a === (keep ?? rooms[0]) ? -1 : 0) - (b === (keep ?? rooms[0]) ? -1 : 0));
      for (const other of neighbours) {
        if (placeInternal(room, other, { width: 0.9, leaves: 1, kind: "swing", along: 0.5 }, nextId)) { fixed = true; break; }
      }
      if (fixed) break;
    }
    if (!fixed) return false;
  }
  return false;
}

function placeFixture(fixture: SpaceTemplate["fixtures"][number], spec: TemplateRoom, room: PlanRoom, frame: LocalFrame,
  at: (axis: "u" | "v", id: string) => number | undefined, lineRef: Map<string, number>): AuthoredPiece | null {
  let bounds: [number, number, number, number];
  if (spec.remainder) {
    // the remainder's own local bounds: the whole target
    bounds = [0, frame.width, 0, frame.depth];
  } else {
    const b = [at("u", spec.u![0]), at("u", spec.u![1]), at("v", spec.v![0]), at("v", spec.v![1])];
    if (b.some(value => value === undefined)) return null;
    bounds = b as [number, number, number, number];
  }
  const [x0, x1, y0, y1] = bounds;
  const wall = fixture.wall ?? "free";
  let [a, d] = fixture.size;
  const h = fixture.size[2];
  const alongU = wall === "v0" || wall === "v1" || wall === "free";
  const lo = alongU ? x0 : y0, hi = alongU ? x1 : y1;
  const axis: "u" | "v" = alongU ? "u" : "v";
  if (fixture.stretch?.includes(axis) && !spec.remainder && spec.u && spec.v) {
    const ref = alongU ? lineRef.get(`u:${spec.u[1]}`)! - lineRef.get(`u:${spec.u[0]}`)!
      : lineRef.get(`v:${spec.v[1]}`)! - lineRef.get(`v:${spec.v[0]}`)!;
    a = Math.max(0.6 * a, a + (hi - lo) - ref);
  }
  if (a > hi - lo - 2 * WALL_GAP) {
    if (!fixture.stretch?.length) return null;
    a = hi - lo - 2 * WALL_GAP;
  }
  let start: number;
  if ("line" in fixture.along) {
    const base = at(axis, fixture.along.line);
    start = base === undefined ? (lo + hi - a) / 2 : base + fixture.along.offset;
  } else start = (lo + hi - a) / 2;
  start = Math.min(hi - a - WALL_GAP, Math.max(lo + WALL_GAP, start));
  let rect: [number, number, number, number];
  switch (wall) {
    case "v0": rect = [start, start + a, y0 + WALL_GAP, y0 + WALL_GAP + d]; break;
    case "v1": rect = [start, start + a, y1 - WALL_GAP - d, y1 - WALL_GAP]; break;
    case "u0": rect = [x0 + WALL_GAP, x0 + WALL_GAP + d, start, start + a]; break;
    case "u1": rect = [x1 - WALL_GAP - d, x1 - WALL_GAP, start, start + a]; break;
    default: {
      const cx = x0 + (fixture.at?.[0] ?? (x1 - x0) / 2), cy = y0 + (fixture.at?.[1] ?? (y1 - y0) / 2);
      const quarter = fixture.rotationDeg === 90 || fixture.rotationDeg === 270;
      const [fu, fv] = quarter ? [d, a] : [a, d];
      rect = [cx - fu / 2, cx + fu / 2, cy - fv / 2, cy + fv / 2];
    }
  }
  if (rect[0] < x0 - 1e-6 || rect[1] > x1 + 1e-6 || rect[2] < y0 - 1e-6 || rect[3] > y1 + 1e-6) return null;
  const uv = rectToUv(frame, rect[0], rect[1], rect[2], rect[3]);
  const centre: Point = [uv.u + uv.lu / 2, uv.v + uv.lv / 2];
  if (spec.remainder && !roomCoversRect(room, uv)) return null;
  const elevation = fixture.elevation ?? room.levels?.find(level => inside(centre, level.polygon))?.delta;
  return { id: fixture.id, kind: fixture.kind, ...(fixture.fit ? { fit: fixture.fit } : {}), at: centre,
    rotationDeg: rotationToUv(frame, fixture.rotationDeg), size: [round3(a), round3(d), h],
    ...(elevation ? { elevation } : {}), required: fixture.required };
}

function inside([u, v]: Point, polygon: Point[]): boolean {
  const us = polygon.map(p => p[0]), vs = polygon.map(p => p[1]);
  return u > Math.min(...us) && u < Math.max(...us) && v > Math.min(...vs) && v < Math.max(...vs);
}

/** Probe ids become real ones only for the fit that is kept. */
function reId(rooms: PlanRoom[], ids: IdGen, keep?: PlanRoom): PlanRoom[] {
  const map = new Map<string, string>();
  for (const room of rooms) map.set(room.id, keep && room.id === keep.id ? keep.id : ids.room());
  return rooms.map(room => ({ ...room, id: map.get(room.id)!,
    doors: room.doors.map(door => (door.id.startsWith("tpl-") ? { ...door, id: ids.door(), to: map.get(door.to) ?? door.to }
      : { ...door, to: map.get(door.to) ?? door.to }) as PlanDoor) }));
}

function mod(a: number, m: number): number { return ((a % m) + m) % m; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

export type { EdgeName, UvRect };
