import type { SpaceTemplate, TemplateDoor, TemplateFixture, TemplateLine, TemplateRoom, TemplateSpan } from "./schema.js";

/** Shallowest entry band worth its own rooms; less extra depth the template's spans absorb. */
export const BAND_MIN = 1.5;
/** Deepest entry band: a dwelling this much deeper than its reference is the wrong unit. */
export const BAND_MAX = 6;
/** Id of the band's inner line. */
export const BAND_LINE = "v-band";
/** Narrowest service room of the band; a narrower stretch joins its neighbour. */
const BAND_ROOM_MIN = 3;
/** Widest service room pieces before the same room merge into. */
const BAND_ROOM_MAX = 7.5;

interface Piece { lo: string; hi: string; width: number; behind: string; role: string }
/** Finished ceiling of the service rooms in the band. */
const BAND_CEILING = 2.7;

/** A dwelling deeper than its envelope keeps its rooms within their authored spans and turns
 *  the extra depth into a band of service rooms along the entry wall: a utility room before
 *  the bath, a pantry before the kitchen, a dressing room before a bedroom, a store before
 *  anything else, each opening into the room behind it. The entry room reaches through the
 *  band to the unit's door (a longer entry hall), a store or dressing room of the template
 *  runs deeper through it, and so does a remainder that is the entry room. Returns the template the fit then solves at `band` metres deeper. */
export function withEntryBand(t: SpaceTemplate, band: number): SpaceTemplate {
  const vLines = t.lines.filter(line => line.axis === "v").sort((a, b) => a.ref - b.ref);
  const uLines = t.lines.filter(line => line.axis === "u").sort((a, b) => a.ref - b.ref);
  const v0 = vLines[0]!.id;
  const entryRoom = t.entry?.room;
  const remainder = t.rooms.find(room => room.remainder && room.level !== "upper");
  const remainderEnters = !!remainder && remainder.id === entryRoom;
  const lines: TemplateLine[] = t.lines.map(line => line.axis === "v" && line.id !== v0 ? { ...line, ref: line.ref + band } : { ...line });
  lines.push({ id: BAND_LINE, axis: "v", ref: band, exact: true });
  const spans: TemplateSpan[] = t.spans.map(span => span.from === v0 ? { ...span, from: BAND_LINE } : { ...span });
  spans.push({ from: v0, to: BAND_LINE, min: Math.max(1.2, band - .6), max: band + .6, weight: 0 });
  const ref = (id: string) => uLines.find(line => line.id === id)?.ref ?? NaN;
  const remapV = (pair: [string, string]): [string, string] => [pair[0] === v0 ? BAND_LINE : pair[0], pair[1] === v0 ? BAND_LINE : pair[1]];

  const rooms: TemplateRoom[] = [];
  const doors: TemplateDoor[] = t.doors.map(door => ({ ...door }));
  const banded = new Set<string>();
  // Stretches of the entry wall before each room (and the remainder's own, unless it is the
  // entry), split at every template line, then merged into service rooms of useful width.
  const pieces: Piece[] = [];
  const entrySpec = t.rooms.find(room => room.id === entryRoom);
  const entryRange: [number, number] | null = entrySpec?.u && entrySpec.v?.[0] === v0 ? [ref(entrySpec.u[0]), ref(entrySpec.u[1])] : null;
  const covered: [number, number][] = [];
  for (const room of t.rooms) {
    const copy: TemplateRoom = { ...room,
      ...(room.levels ? { levels: room.levels.map(level => ({ ...level, v: remapV(level.v) })) } : {}),
      ...(room.keepouts ? { keepouts: room.keepouts.map(k => ({ ...k, v: remapV(k.v) })) } : {}) };
    rooms.push(copy);
    if (!room.u || !room.v || room.v[0] !== v0 || room.level === "upper") continue;
    covered.push([ref(room.u[0]), ref(room.u[1])]);
    // the entry reaches the unit's door; a store or dressing room of a room's width simply
    // runs deeper
    if (room.id === entryRoom || room.kind === "storage" && ref(room.u[1]) - ref(room.u[0]) >= BAND_ROOM_MIN) continue;
    copy.v = [BAND_LINE, room.v[1]];
    banded.add(room.id);
    pieces.push({ lo: room.u[0], hi: room.u[1], width: ref(room.u[1]) - ref(room.u[0]), behind: room.id, role: bandRole(room) });
  }
  if (remainder && !remainderEnters) {
    covered.sort((a, b) => a[0] - b[0]);
    let at = uLines[0]!.ref;
    const gaps: [number, number][] = [];
    for (const [lo, hi] of covered) { if (lo > at + 1e-6) gaps.push([at, lo]); at = Math.max(at, hi); }
    if (uLines.at(-1)!.ref > at + 1e-6) gaps.push([at, uLines.at(-1)!.ref]);
    for (const [lo, hi] of gaps) {
      const cuts = uLines.filter(line => line.ref >= lo - 1e-6 && line.ref <= hi + 1e-6);
      for (let i = 0; i + 1 < cuts.length; i++)
        pieces.push({ lo: cuts[i]!.id, hi: cuts[i + 1]!.id, width: cuts[i + 1]!.ref - cuts[i]!.ref, behind: remainder.id, role: "services" });
    }
  }
  pieces.sort((a, b) => ref(a.lo) - ref(b.lo));
  // Runs of touching pieces (the entry room breaks a run); within a run a piece narrower than
  // a usable store joins its narrower neighbour, and neighbours before the same room join
  // while they stay a room's width.
  const runs: Piece[][] = [];
  for (const piece of pieces) {
    const run = runs.at(-1), last = run?.at(-1);
    if (run && last && last.hi === piece.lo) run.push(piece); else runs.push([piece]);
  }
  let k = 0;
  for (const run of runs) {
    const merged: Piece[][] = run.map(piece => [piece]);
    const width = (group: Piece[]) => group.reduce((sum, piece) => sum + piece.width, 0);
    for (let changed = true; changed && merged.length > 1;) {
      changed = false;
      for (let i = 0; i < merged.length && !changed; i++) {
        const here = merged[i]!, left = merged[i - 1], right = merged[i + 1];
        const same = (other?: Piece[]) => !!other && other[0]!.behind === here[0]!.behind && width(other) + width(here) <= BAND_ROOM_MAX;
        const small = width(here) < BAND_ROOM_MIN;
        if (!small && !same(left) && !same(right)) continue;
        const into = small ? (!left ? i + 1 : !right ? i - 1 : width(left) <= width(right!) ? i - 1 : i + 1)
          : same(left) ? i - 1 : i + 1;
        const [a, b] = into < i ? [into, i] : [i, into];
        merged.splice(a, 2, [...merged[a]!, ...merged[b]!]);
        changed = true;
      }
    }
    let previous: string | undefined;
    for (const group of merged) {
      if (width(group) < 1.2) continue;
      const main = [...group].sort((a, b) => b.width - a.width)[0]!;
      const id = `band-${++k}`, lo = group[0]!.lo, hi = group.at(-1)!.hi;
      rooms.push({ id, kind: "storage", role: main.role, u: [lo, hi], v: [v0, BAND_LINE],
        ceiling: BAND_CEILING, minClear: [1.2, Math.min(1.2, band * .8)] });
      doors.push({ id: `${id}-door`, ...bandDoor(t, id, [ref(lo), ref(hi)], main.behind, entryRange, previous, ref) });
      previous = id;
    }
  }

  const fixtures: TemplateFixture[] = t.fixtures.map(fixture => {
    const along = "line" in fixture.along && fixture.along.line === v0
      && (banded.has(fixture.room) || fixture.room === remainder?.id && !remainderEnters)
      ? { line: BAND_LINE, offset: fixture.along.offset } : fixture.along;
    // a free piece of the remainder is placed from the remainder's low corner, which is the
    // band line (the fit's bounds) unless the remainder is the entry that reaches the door:
    // then it moves with the rooms it stood among
    const at = fixture.room === remainder?.id && remainderEnters && fixture.at ? [fixture.at[0], fixture.at[1] + band] as [number, number] : fixture.at;
    return { ...fixture, along, ...(at ? { at } : {}) };
  });
  const [width, depth] = [t.envelope.width, t.envelope.depth + band];
  return { ...t, lines, spans, rooms, doors, fixtures,
    envelope: { width, depth, min: [t.envelope.min[0], t.envelope.min[1] + band], max: [t.envelope.max[0], t.envelope.max[1] + band] },
    band: { line: BAND_LINE, depth: band, remainderEnters } };
}

function bandRole(room: TemplateRoom): string {
  switch (room.kind) {
    case "bathroom": return "utility";
    case "kitchen": return "pantry";
    case "bedroom": return "dressing";
    default: return "services";
  }
}

/** A service room's door: into the entry room beside it (the band's own side wall, clear of
 *  every fixture), else into the room behind it at a stretch its wall pieces leave free, else
 *  into the service room before it in the band. */
function bandDoor(t: SpaceTemplate, id: string, [lo, hi]: [number, number], behind: string, entry: [number, number] | null,
  previous: string | undefined, ref: (line: string) => number): Omit<TemplateDoor, "id"> {
  const door = { width: .9, leaves: 1 as const, kind: "pocket" as const, owner: id, optional: true };
  if (entry && (Math.abs(entry[0] - hi) < 1e-6 || Math.abs(entry[1] - lo) < 1e-6) && t.entry)
    return { ...door, between: [id, t.entry.room], along: .5 };
  const spec = t.rooms.find(room => room.id === behind);
  const low = spec?.u ? ref(spec.u[0]) : 0, high = spec?.u ? ref(spec.u[1]) : Infinity;
  const taken: [number, number][] = [];
  for (const fixture of t.fixtures) {
    if (fixture.room !== behind || fixture.wall !== "v0") continue;
    if (fixture.stretch?.includes("u")) { taken.push([low, high]); continue; }
    const start = "line" in fixture.along ? ref(fixture.along.line) + fixture.along.offset : (low + high - fixture.size[0]) / 2;
    taken.push([start - .2, start + fixture.size[0] + .2]);
  }
  let best: [number, number] | null = null;
  let at = lo + .3;
  for (const [a, b] of [...taken, [hi - .3, Infinity] as [number, number]].sort((x, y) => x[0] - y[0])) {
    const end = Math.min(a, hi - .3);
    if (end - at > (best ? best[1] - best[0] : 1.4 - 1e-6)) best = [at, end];
    at = Math.max(at, b);
  }
  if (best) {
    const centre = (best[0] + best[1]) / 2, span = hi - lo - door.width - .18;
    return { ...door, between: [id, behind], along: span > 0 ? Math.min(1, Math.max(0, (centre - lo - door.width / 2 - .09) / span)) : .5 };
  }
  return previous ? { ...door, between: [id, previous], along: .5 } : { ...door, between: [id, behind], along: .1 };
}
