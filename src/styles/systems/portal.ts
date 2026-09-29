import type { Point } from '../../core/geom.js';
import type { LightFixture, RoomKind } from '../../core/types.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Frame } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import { CELL, LocalFrame, arc, lensRecord, round, xyPrism, type V3 } from './built-ins.js';
import type { PortalSpec } from './types.js';

/** Rounded portals and their casings (the E1 constant-radius surrounds, the R1 layered
 *  doorway, the Biotechnica public portal). A portal is a band profile swept along a
 *  jamb, a quarter corner and a header, each its own module:
 *  - only straight parts stretch: jambs in y, the header in x; corners, slots and fillers
 *    are authored at their radius and placed at scale 1, so the radius is the same at any
 *    width;
 *  - every piece is solid to its own box and none spans the passage below the arc: the
 *    engine collides a module as its bounding box;
 *  - layers are further specs placed concentrically around the inner one, each band
 *    starting where the previous one ends.
 *  Module ids: `wall-portal-<stem>-{left,right}-{jamb,slot,corner,fill}`, the header
 *  `door-header-<pid>` (thresholds find it; each layer places its own over the one inside),
 *  lenses `ceiling-cove-<stem>-{reveal,slot}` (uncollided, one record each). The fill (the
 *  square corner of the wall cut) exists only for specs without layers, which may stand
 *  outermost. */

/** Wall datum: plain fields and panel skins end 95 mm off the partition line. */
export const PORTAL_WALL_DEPTH = .095;
/** A jamb light slot's piece reaches this far below and above the recess itself (the
 *  published public portal keeps its 0.12 m). */
export const slotMargin = (spec: PortalSpec): number => spec.id === 'luxury-public' ? .12 : .04;
/** The recess of a jamb slot: its floor sits this far behind the face. */
export const SLOT_RECESS = .03;
/** Arc segments of a rounded corner (a quarter). */
export const CORNER_SEGMENTS = 12;
/** Quarter-sine steps of the rounded nose between the lining and the face. */
export const NOSE_STEPS = 2;
const DEFAULT_LENS = 'cyberpunk/light-fixture/mid#strip';
const REVEAL_LUMENS_PER_METRE = 45;

export type PortalLookup = (id: string) => PortalSpec | undefined;

/** A wall opening as the portal systems see it: centre along the line, width, sill, head. */
export interface PortalHole { at: number; width: number; y0: number; y1: number }
/** A room face beside the opening. */
export interface PortalPeer { room: string; kind: RoomKind }

/** One profile band: from offset a to b outward of the aperture edge, half-depth da to db
 *  from the partition line (the module is symmetric through the wall). */
export interface PortalBand { a: number; b: number; da: number; db: number; slot: string; smooth?: boolean }

/** The stem of a spec's module ids. The Biotechnica public portal keeps its published ids. */
export function portalStem(spec: PortalSpec): string {
  return spec.id === 'luxury-public' ? 'luxury' : spec.id;
}

export function portalModules(spec: PortalSpec) {
  const stem = portalStem(spec);
  return {
    jamb: (side: 'left' | 'right') => `wall-portal-${stem}-${side}-jamb`,
    slot: (side: 'left' | 'right') => `wall-portal-${stem}-${side}-slot`,
    corner: (side: 'left' | 'right') => `wall-portal-${stem}-${side}-corner`,
    fill: (side: 'left' | 'right') => `wall-portal-${stem}-${side}-fill`,
    header: `door-header-${spec.id}`,
    reveal: `ceiling-cove-${stem}-reveal`,
    slotLens: `ceiling-cove-${stem}-slot`,
  };
}

/** The legacy public portal bakes its filler into the corner, as published worlds expect. */
const bakedFiller = (spec: PortalSpec) => spec.id === 'luxury-public';
const lensSlot = (spec: PortalSpec) => (spec.skin as PortalSpec['skin'] & { lens?: string }).lens ?? DEFAULT_LENS;

/** The band profile of a spec: a return lining the aperture, a rounded nose (three
 *  quarter-sine steps), the flat face (it carries the light slot), a dark recessed reveal,
 *  an outer lip and a chamfer back to the wall datum. */
export function portalProfile(spec: PortalSpec): PortalBand[] {
  const [d0, d1] = spec.depth, B = spec.band, { face, reveal, ret } = spec.skin;
  if (B < .08 - 1e-9) throw new Error(`portal ${spec.id}: band ${B} is narrower than 0.08`);
  const lining = Math.min(.022, B * .1), nose = Math.min(.048, B * .2);
  const lip = Math.min(.052, B * .18), gap = .008, chamfer = round(lip * .35, 1e4);
  const faceEnd = B - lip - gap, lipDepth = d0 + (d1 - d0) * .625;
  const bands: PortalBand[] = [{ a: 0, b: lining, da: d0, db: d0, slot: ret }];
  for (let i = 0; i < NOSE_STEPS; i++) {
    const depth = (j: number) => d0 + (d1 - d0) * Math.sin(j / NOSE_STEPS * Math.PI / 2);
    bands.push({ a: lining + nose * i / NOSE_STEPS, b: lining + nose * (i + 1) / NOSE_STEPS, da: depth(i), db: depth(i + 1), slot: face, smooth: true });
  }
  bands.push({ a: lining + nose, b: faceEnd, da: d1, db: d1, slot: face });
  bands.push({ a: faceEnd, b: faceEnd + gap, da: d0 + .002, db: d0 + .002, slot: reveal });
  bands.push({ a: faceEnd + gap, b: B - chamfer, da: lipDepth, db: lipDepth, slot: face });
  bands.push({ a: B - chamfer, b: B, da: lipDepth, db: PORTAL_WALL_DEPTH, slot: face });
  return bands.map(b => ({ ...b, a: round(b.a, 1e6), b: round(b.b, 1e6) }));
}

/** The flat face band (the one a slot is cut into): after the lining and the nose steps. */
const faceBand = (bands: PortalBand[]): PortalBand => bands[1 + NOSE_STEPS]!;

// A rail is where the profile is swept: stations with a point function of the profile
// offset r and the unit direction in which r grows there (for normals).
interface Station { pt: (r: number) => Point; n: Point }

function slope(bands: PortalBand[], i: number, at: 'a' | 'b'): number {
  const own = (bands[i]!.db - bands[i]!.da) / (bands[i]!.b - bands[i]!.a);
  const j = at === 'a' ? i - 1 : i + 1, other = bands[j];
  if (!bands[i]!.smooth || !other || !(other.smooth || Math.abs(other.db - other.da) < 1e-9)) return own;
  const touching = at === 'a' ? Math.abs(other.db - bands[i]!.da) < 1e-9 : Math.abs(other.da - bands[i]!.db) < 1e-9;
  return touching ? (own + (other.db - other.da) / (other.b - other.a)) / 2 : own;
}

/** A quad with per-vertex normals, wound to face the normals it carries. */
function patch(k: Kit, slot: string, v: V3[], n: V3[]): void {
  const e1 = v[1]!.map((x, i) => x - v[0]![i]!), e2 = v[2]!.map((x, i) => x - v[0]![i]!);
  const g = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  if (Math.hypot(g[0]!, g[1]!, g[2]!) < 1e-12) return;
  const avg = [0, 1, 2].map(i => n.reduce((s, x) => s + x[i]!, 0));
  const order = g[0]! * avg[0]! + g[1]! * avg[1]! + g[2]! * avg[2]! >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
  const unit = (x: V3) => { const l = Math.hypot(...x) || 1; return x.map(t => t / l); };
  k.mesh.addSurface(slot, {
    positions: order.flatMap(i => v[i]!), normals: order.flatMap(i => unit(n[i]!)),
    uvs: order.flatMap(i => [v[i]![0] + v[i]![2] * .3, v[i]![1]]), indices: [0, 1, 2, 0, 2, 3],
  });
}

/** Sweeps the profile between consecutive stations: both skins, the steps where the depth
 *  jumps, the lining at the aperture and the outer edge. */
function sweep(k: Kit, bands: PortalBand[], rail: Station[][], edges = { inner: true, outer: true }, skip?: PortalBand): void {
  for (const segment of rail) {
    for (let s = 0; s + 1 < segment.length; s++) {
      const A = segment[s]!, C = segment[s + 1]!;
      bands.forEach((band, i) => {
        const ga = slope(bands, i, 'a'), gb = slope(bands, i, 'b');
        for (const side of band === skip ? [] : [1, -1]) {
          const p = (st: Station, r: number, d: number): V3 => [...st.pt(r), side * d] as V3;
          const nm = (st: Station, g: number): V3 => [-g * st.n[0], -g * st.n[1], side];
          patch(k, band.slot, [p(A, band.a, band.da), p(A, band.b, band.db), p(C, band.b, band.db), p(C, band.a, band.da)],
            [nm(A, ga), nm(A, gb), nm(C, gb), nm(C, ga)]);
        }
        const step = (r: number, z0: number, z1: number, outward: number, slot: string) => {
          if (Math.abs(z1 - z0) < 1e-9) return;
          const n = (st: Station): V3 => [outward * st.n[0], outward * st.n[1], 0];
          patch(k, slot, [[...A.pt(r), z0] as V3, [...C.pt(r), z0] as V3, [...C.pt(r), z1] as V3, [...A.pt(r), z1] as V3], [n(A), n(C), n(C), n(A)]);
        };
        if (i === 0 && edges.inner) step(band.a, -band.da, band.da, -1, band.slot);
        const next = bands[i + 1];
        if (next && Math.abs(next.da - band.db) > 1e-9) {
          const proud = next.da > band.db ? next : band;
          for (const sign of [1, -1]) step(band.b, sign * Math.min(band.db, next.da), sign * Math.max(band.db, next.da), next.da > band.db ? -1 : 1, proud.slot);
        }
        if (!next && edges.outer) step(band.b, -band.db, band.db, 1, band.slot);
      });
    }
  }
}

function straightRail(axis: 'x' | 'y', sign: number, length: number): Station[][] {
  return axis === 'y'
    ? [[{ pt: r => [sign * r, 0], n: [sign, 0] }, { pt: r => [sign * r, length], n: [sign, 0] }]]
    : [[{ pt: r => [-length / 2, r], n: [0, 1] }, { pt: r => [length / 2, r], n: [0, 1] }]];
}

/** A quarter corner about the arc centre: a true arc for a rounded spec, a mitre for a
 *  square one (radius 0). */
function cornerRail(sign: number, radius: number): Station[][] {
  if (radius <= 1e-9) {
    const mitre = (r: number): Point => [sign * r, r];
    return [
      [{ pt: r => [sign * r, 0], n: [sign, 0] }, { pt: mitre, n: [sign, 0] }],
      [{ pt: mitre, n: [0, 1] }, { pt: r => [0, r], n: [0, 1] }],
    ];
  }
  return [Array.from({ length: CORNER_SEGMENTS + 1 }, (_, i) => {
    const a = i / CORNER_SEGMENTS * Math.PI / 2, u: Point = [sign * Math.cos(a), Math.sin(a)];
    return { pt: (r: number): Point => [u[0] * (radius + r), u[1] * (radius + r)], n: u };
  })];
}

/** The filler between the outermost arc and the square wall cut. */
function filler(k: Kit, spec: PortalSpec, sign: number): void {
  const outer = spec.radius + spec.band;
  const polygon: Point[] = [[sign * outer, outer], ...arc(0, 0, outer, Math.PI / 2, 0, CORNER_SEGMENTS).map(([x, y]) => [sign * x, y] as Point)];
  xyPrism(k, spec.skin.face, polygon, -PORTAL_WALL_DEPTH, PORTAL_WALL_DEPTH, false);
}

/** The slot piece: every band straight except the face, which is cut by a rounded recess
 *  with a dark floor. */
function slotPiece(k: Kit, spec: PortalSpec, bands: PortalBand[], sign: number): void {
  const slot = spec.slot!, face = faceBand(bands), margin = slotMargin(spec), height = slot.height + 2 * margin;
  // Every band but the face sweeps straight; the face is drawn as a recessed skin.
  sweep(k, bands, straightRail('y', sign, height), { inner: true, outer: true }, face);
  const x0 = face.a, x1 = face.b, cx = (x0 + x1) / 2, r = Math.min(slot.width, x1 - x0 - .02) / 2;
  const lo = margin, hi = margin + slot.height, core = face.da - SLOT_RECESS;
  const t = (p: Point[]) => p.map(([x, y]) => [sign * x, y] as Point);
  xyPrism(k, spec.skin.reveal, t([[x0, 0], [x1, 0], [x1, height], [x0, height]]), -core, core);
  const strips: Point[][] = [[[x0, 0], [cx - r, 0], [cx - r, height], [x0, height]], [[cx + r, 0], [x1, 0], [x1, height], [cx + r, height]]];
  strips.push([[cx - r, 0], [cx + r, 0], ...arc(cx, lo + r, r, 0, -Math.PI, 6)]);
  strips.push([[cx + r, height], [cx - r, height], ...arc(cx, hi - r, r, Math.PI, 0, 6)]);
  for (const p of strips) for (const side of [1, -1]) xyPrism(k, face.slot, t(p), side > 0 ? core : -face.da, side > 0 ? face.da : -core);
}

/** Specs whose modules the catalog draws, by passage header id and by spec id: the dress
 *  passes (housings over portals) find a portal from the header placement they meet. */
const DRAWN = new Map<string, PortalSpec>();

/** The spec of a portal header module drawn by `portalRecipes`, and its resolved layers. */
export function portalOfHeaderModule(module: string): { spec: PortalSpec; layers: PortalSpec[] } | undefined {
  const spec = DRAWN.get(module);
  if (!spec) return undefined;
  return { spec, layers: (spec.layers ?? []).map(id => DRAWN.get(`id:${id}`)).filter((l): l is PortalSpec => !!l) };
}

/** Every module of one spec. Corners, slots and fillers are drawn at their size and must
 *  never be scaled; jambs and headers are one cell along their stretch axis. */
export function portalRecipes(spec: PortalSpec): RecipeSet {
  const bands = portalProfile(spec), ids = portalModules(spec);
  DRAWN.set(ids.header, spec);
  DRAWN.set(`id:${spec.id}`, spec);
  return add => {
    for (const [name, sign] of [['left', -1], ['right', 1]] as const) {
      add(ids.jamb(name), k => sweep(k, bands, straightRail('y', sign, CELL)));
      if (spec.slot) add(ids.slot(name), k => slotPiece(k, spec, bands, sign));
      add(ids.corner(name), k => {
        sweep(k, bands, cornerRail(sign, spec.radius), { inner: true, outer: !bakedFiller(spec) });
        if (bakedFiller(spec)) filler(k, spec, sign);
      });
      // Only a spec that can stand outermost (it has no layers of its own) closes the square cut.
      if (spec.radius > 0 && !bakedFiller(spec) && !spec.layers?.length) add(ids.fill(name), k => filler(k, spec, sign));
    }
    add(ids.header, k => sweep(k, bands, straightRail('x', 1, CELL)));
    if (spec.reveal?.lit) {
      const g = Math.min(.03, spec.depth[0] * .35);
      add(ids.reveal, k => k.cbox(lensSlot(spec), [0, -.004, 0], [CELL, .004, 2 * g]));
    }
    if (spec.slot?.lit) {
      const face = faceBand(bands), w = Math.min(spec.slot.width, face.b - face.a - .02) - .004;
      add(ids.slotLens, k => k.box(lensSlot(spec), [-w / 2, 0, face.da - SLOT_RECESS], [w, CELL, .003]));
    }
  };
}

/** The spec and its outer layers, innermost first. */
export function portalChain(spec: PortalSpec, lookup: PortalLookup): PortalSpec[] {
  return [spec, ...(spec.layers ?? []).map(id => {
    const layer = lookup(id);
    if (!layer) throw new Error(`portal ${spec.id}: unknown layer ${id}`);
    return layer;
  })];
}

/** Throws unless every layer continues the previous band: a rounded layer's radius is the
 *  previous layer's outer radius (concentric arcs); a square layer may follow anything. */
export function validatePortal(spec: PortalSpec, lookup: PortalLookup): void {
  const chain = portalChain(spec, lookup);
  let edge = spec.radius + spec.band;
  for (const layer of chain.slice(1)) {
    const previous = chain[chain.indexOf(layer) - 1]!;
    if (layer.radius > 0 && (previous.radius === 0 || Math.abs(layer.radius - edge) > 1e-3))
      throw new Error(`portal ${spec.id}: layer ${layer.id} radius ${layer.radius} does not continue ${previous.id} (outer radius ${round(edge)})`);
    if (layer.radius === 0 && previous.radius > 0)
      throw new Error(`portal ${spec.id}: square layer ${layer.id} cannot follow the rounded ${previous.id} (its corner would need a filler)`);
    edge = layer.radius > 0 ? layer.radius + layer.band : edge + layer.band;
  }
  for (const layer of chain) {
    const face = faceBand(portalProfile(layer));
    if (layer.slot && layer.slot.width > face.b - face.a - .02 + 1e-9)
      throw new Error(`portal ${layer.id}: slot wider than its face band`);
  }
}

/** How far the whole surround reaches beyond the aperture: sideways from each jamb, and
 *  upwards from the aperture's straight height. `layers` are the spec's outer layers, resolved. */
export function portalReach(spec: PortalSpec, layers: readonly PortalSpec[] = []): { band: number; rise: number } {
  const band = spec.band + layers.reduce((sum, layer) => sum + layer.band, 0);
  return { band, rise: spec.radius + band };
}

/** The wall cut a portal needs around its opening: widened by both bands of every layer and
 *  raised by the radius and bands. */
export function portalCut(spec: PortalSpec, layers: readonly PortalSpec[], hole: PortalHole): PortalHole {
  const { band, rise } = portalReach(spec, layers);
  return { ...hole, width: hole.width + 2 * band, y1: hole.y1 + rise };
}

/** Whether this spec may frame the opening: a full-height hole wide and tall enough, every
 *  room beside it of a kind the spec serves, and the whole surround (with its layers) 1 cm
 *  under the face height. One style on both sides is the caller's rule (it knows the styles). */
export function portalEligible(spec: PortalSpec, peers: readonly PortalPeer[], hole: PortalHole, height: number,
  layers: readonly PortalSpec[] = []): boolean {
  if (hole.y0 > 1e-6 || hole.width < spec.minWidth - 1e-6 || hole.y1 < spec.minHeight - 1e-6) return false;
  if (peers.some(peer => !spec.rooms.includes(peer.kind) || peer.room.startsWith('stair-'))) return false;
  return hole.y1 + portalReach(spec, layers).rise + .01 <= height + 1e-9;
}

/** Clear width under a portal header placed at `scaleX`: its straight length plus both arcs. */
export function portalClearWidth(spec: PortalSpec, scaleX: number): number {
  return scaleX * CELL + 2 * spec.radius;
}

export interface PortalPlacement {
  /** floor elevation: light records are building-local */
  elevation?: number;
  /** the spec's outer layers, resolved (else resolved with `lookup`) */
  layers?: readonly PortalSpec[];
  /** resolves layer ids, e.g. `id => PORTALS.get(id)` */
  lookup?: PortalLookup;
}

/** Places a portal on the wall line (`axis`, `c`) centred at `at`, around a clear aperture
 *  `width` wide whose straight jambs rise to `height`; the arcs rise above it. Returns the
 *  records of its lit lenses. */
export function placePortal(builder: PlacementBuilder, spec: PortalSpec, room: string, axis: 'H' | 'V', c: number,
  at: number, width: number, height: number, frame: Frame, options: PortalPlacement = {}): LightFixture[] {
  const elevation = options.elevation ?? 0;
  const rotation = -frame.angleDeg * Math.PI / 180 + (axis === 'V' ? -Math.PI / 2 : 0);
  const [x, z] = uvToWorld(axis === 'H' ? [at, c] : [c, at], frame);
  const local = new LocalFrame([x, 0, z], rotation), lights: LightFixture[] = [];
  // Without resolved layers (or a lookup) the spec stands alone: its layers are not placed.
  const chain = options.layers ? [spec, ...options.layers] : options.lookup ? portalChain(spec, options.lookup) : [spec];
  let reach = 0;
  chain.forEach((layer, k) => {
    const ids = portalModules(layer), W = width + 2 * reach, r = layer.radius;
    const H = height + spec.radius + reach - r, next = chain[k + 1];
    const fill = !bakedFiller(layer) && r > 0 && !layer.layers?.length && (!next || next.radius === 0);
    const margin = slotMargin(layer);
    const slot = layer.slot && layer.slot.base - margin >= 0 && layer.slot.base + layer.slot.height + margin <= H - .01
      ? layer.slot : undefined;
    for (const [name, sign] of [['left', -1], ['right', 1]] as const) {
      const t = sign * W / 2;
      const jamb = (y0: number, y1: number) => { if (y1 - y0 > 1e-6) local.place(builder, ids.jamb(name), room, t, y0, 0, [1, (y1 - y0) / CELL, 1]); };
      if (slot) {
        const y0 = slot.base - margin, y1 = slot.base + slot.height + margin;
        jamb(0, y0);
        local.place(builder, ids.slot(name), room, t, y0, 0);
        jamb(y1, H);
        if (slot.lit) {
          const face = faceBand(portalProfile(layer)), cx = t + sign * (face.a + face.b) / 2;
          for (const back of [false, true]) {
            const f = back ? local.reversed : local, fx = back ? -cx : cx;
            const lens = f.place(builder, ids.slotLens, room, fx, slot.base, 0, [1, slot.height / CELL, 1]);
            lights.push(lensRecord(f, room, lens.id, fx, slot.base + slot.height / 2, face.da - SLOT_RECESS, slot.height, elevation,
              { lumensPerMetre: slot.lit.lumensPerMetre, kelvin: slot.lit.kelvin, color: slot.lit.color, facing: slot.lit.facing },
              undefined, f.front, [0, 1, 0]));
          }
        }
      } else jamb(0, H);
      local.place(builder, ids.corner(name), room, sign * (W / 2 - r), H, 0);
      if (fill) local.place(builder, ids.fill(name), room, sign * (W / 2 - r), H, 0);
    }
    const straight = W - 2 * r;
    if (straight > 1e-6) {
      local.place(builder, ids.header, room, 0, H + r, 0, [straight / CELL, 1, 1]);
      if (k === 0 && layer.reveal?.lit) {
        const lens = local.place(builder, ids.reveal, room, 0, H + r, 0, [straight / CELL, 1, 1]);
        lights.push(lensRecord(local, room, lens.id, 0, H + r - .004, 0, straight, elevation,
          { lumensPerMetre: REVEAL_LUMENS_PER_METRE, kelvin: 6500, color: layer.reveal.color, facing: 'down' }));
      }
    }
    reach += layer.band;
  });
  return lights;
}

// ---- casings -------------------------------------------------------------------------

/** Materials of a style casing: the dark body behind, the face strips and the inlaid edge. */
export interface CasingLook { body: string; face: string; edge: string }

/** `door-jamb-<sid>` and `door-header-<sid>` inside the shared casing envelope (80 mm
 *  members, 200 mm deep, both faces finished): a dark body, face strips with fine recessed
 *  joints and an inlaid edge line, the construction `doorRecipes` uses. */
export function casingRecipes(sid: string, look: CasingLook): RecipeSet {
  return add => {
    add(`door-jamb-${sid}`, k => casingMember(k, look, [-.04, 0, -.1], [.08, .5, .2], false));
    add(`door-header-${sid}`, k => casingMember(k, look, [-.25, 0, -.1], [.5, .08, .2], true));
  };
}

function casingMember(k: Kit, look: CasingLook, [x, y, z]: V3, [w, h, d]: V3, horizontal: boolean): void {
  k.box(look.body, [x, y, z + .01], [w, h, d - .02]);
  for (const side of [0, 1]) {
    const front = z + side * (d - .01);
    k.box(look.body, [x, y, front + (side ? 0 : .004)], [w, h, .006]);
    const strip = (offset: number, thickness: number, material: string) => {
      const faceZ = front + (side ? .006 : 0);
      k.box(material, horizontal ? [x, y + offset, faceZ] : [x + offset, y, faceZ], horizontal ? [w, thickness, .004] : [thickness, h, .004]);
    };
    strip(0, .016, look.face);
    strip(.02, .04, look.face);
    strip(.064, .007, look.face);
    strip(.071, .005, look.edge);
    strip(.076, .004, look.face);
  }
}
