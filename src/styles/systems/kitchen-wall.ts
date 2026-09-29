import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { itemFrame, lensRecord, moduleSize, type LocalFrame } from './built-ins.js';
import type { KitchenBayRole, KitchenWallSpec } from './types.js';

/** The embedded high-tech kitchen wall: the furniture record is a reservation, the geometry
 *  an assembly of fixed parts. In the item's frame (x across, +z front, back at -d/2):
 *  - a toe kick stretched along the run, set back under the carcass;
 *  - fixed carcass bays at the spec pitch (door, drawers, sink, hob, display), end panels,
 *    and one filler stretched over what the bays leave, next to the service column;
 *  - a worktop of stretched slabs between fixed sink and hob cut-outs above their bays;
 *  - backsplash panels at the spec's widths, phased from the run start and cut at its end;
 *  - tiered upper housings, one fixed module per bay and tier (grilles and screens baked);
 *  - a bulkhead from the uppers to the ceiling, stretched in x and y, so any storey height
 *    fits without scaling a housing; a low ceiling drops the top tier, then lowers the rest;
 *  - an optional stepped service column at the +x end, stacked to the ceiling, with its
 *    embedded screen at scale 1;
 *  - one under-cabinet lens per straight stretch, recorded for the item.
 *  Module conventions: every piece has its back at local z = 0 and faces +z, is centred in
 *  x and stands on y = 0; carcass bays, cut-outs and tiers are exactly one bay wide; the
 *  toe, filler, slab, splash, bulkhead and lens are one cell (0.5 m) wide and stretch. */

/** Worktop clearance kept under the uppers when a low ceiling lowers them. */
const MIN_SPLASH = .45;
/** Priority of bay roles when the run has fewer bays than the pattern. */
const KEEP: Record<KitchenBayRole, number> = { sink: 5, hob: 4, drawers: 3, display: 2, door: 1 };

/** The roles of `n` bays: the style's pattern, cut to its most important bays or extended
 *  with doors and drawers, turned so the sink lands on bay `anchor` when one is given. */
export function kitchenBayRoles(pattern: readonly KitchenBayRole[], n: number, anchor?: number): KitchenBayRole[] {
  if (n <= 0) return [];
  let roles = [...pattern];
  while (roles.length > n) {
    const drop = roles.reduce((w, r, i) => KEEP[r] < KEEP[roles[w]!] || (KEEP[r] === KEEP[roles[w]!] && i > w) ? i : w, 0);
    roles.splice(drop, 1);
  }
  for (let i = 0; roles.length < n; i++) roles.push(i % 2 ? 'drawers' : 'door');
  const sink = roles.indexOf('sink');
  if (anchor !== undefined && sink >= 0 && anchor !== sink) {
    const shift = ((anchor - sink) % n + n) % n;
    roles = roles.map((_, i) => roles[((i - shift) % n + n) % n]!);
  }
  return roles;
}

export interface KitchenLayout {
  /** carcass bays: centre x and role */
  bays: { x: number; role: KitchenBayRole }[];
  /** stretched filler span, if any */
  filler?: [number, number];
  /** end panels (centre x) */
  ends: number[];
  /** the column span at +x */
  column?: [number, number];
  /** worktop and uppers span (everything but the column) */
  run: [number, number];
}

/** Bay layout along a run of width `w`, given the window anchor (local x) if any. */
export function kitchenLayout(spec: KitchenWallSpec, w: number, anchorX?: number): KitchenLayout {
  const endW = spec.base.endWidth, colW = spec.column && w >= 2 * endW + spec.bay + spec.column.width ? spec.column.width : 0;
  const a = -w / 2 + endW, b = w / 2 - (colW || endW);
  const n = Math.max(0, Math.floor((b - a) / spec.bay + 1e-9)), rest = b - a - n * spec.bay;
  const anchor = anchorX === undefined ? undefined
    : Math.max(0, Math.min(n - 1, Math.floor((anchorX - a) / spec.bay)));
  const roles = kitchenBayRoles(spec.pattern, n, anchor);
  return {
    bays: roles.map((role, i) => ({ x: a + (i + .5) * spec.bay, role })),
    ...(rest > .005 ? { filler: [a + n * spec.bay, b] as [number, number] } : {}),
    ends: colW ? [-w / 2 + endW / 2] : [-w / 2 + endW / 2, w / 2 - endW / 2],
    ...(colW ? { column: [w / 2 - colW, w / 2] as [number, number] } : {}),
    run: [-w / 2, colW ? w / 2 - colW : w / 2],
  };
}

/** A window behind the run: the local x of the nearest facade window whose centre lies
 *  within a metre behind the item's back, inside its width. */
export function windowAnchor(floor: FloorInterior, item: Furniture, frame: LocalFrame): number | undefined {
  const back = -item.size[1] / 2;
  let best: number | undefined, distance = Infinity;
  for (const o of floor.openingReservations ?? []) {
    if (o.kind !== 'window') continue;
    const dx = o.position[0] - frame.origin[0], dz = o.position[1] - frame.origin[2];
    const x = dx * frame.cos - dz * frame.sin, z = dx * frame.sin + dz * frame.cos;
    if (Math.abs(x) > item.size[0] / 2 || z > back + .15 || z < back - 1) continue;
    if (Math.abs(x) < distance) { distance = Math.abs(x); best = x; }
  }
  return best;
}

export function placeKitchenWall(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: KitchenWallSpec,
  ceilingY: number): LightFixture[] {
  const frame = itemFrame(item), room = item.room, w = item.size[0], back = -item.size[1] / 2;
  const floorY = item.elevation ?? 0, ceiling = ceilingY - floorY;
  const layout = kitchenLayout(spec, w, windowAnchor(floor, item, frame));
  const put = (module: string, x: number, y: number, sx = 1, sy = 1, z = 0) =>
    frame.place(builder, module, room, x, y, back + z, [sx, sy, 1]);
  const cell = (module: string) => moduleSize(module)[0];
  const baseY = spec.toe.height, top = spec.worktop.top, slabY = top - spec.worktop.thickness;

  // Carcass: toe kick, end panels, bays, filler.
  const [r0, r1] = layout.run;
  put(spec.toe.module, (r0 + r1) / 2, 0, (r1 - r0) / cell(spec.toe.module));
  for (const x of layout.ends) put(spec.base.endPanel, x, 0);
  for (const bay of layout.bays) put(spec.base.bays[bay.role], bay.x, baseY);
  if (layout.filler) {
    const [f0, f1] = layout.filler;
    put(spec.base.filler, (f0 + f1) / 2, baseY, (f1 - f0) / cell(spec.base.filler));
  }

  // Worktop: fixed cut-outs over the sink and hob bays, stretched slabs between them.
  const cuts = layout.bays.filter(b => b.role === 'sink' || b.role === 'hob')
    .map(b => ({ x0: b.x - spec.bay / 2, x1: b.x + spec.bay / 2, module: b.role === 'sink' ? spec.worktop.sinkCut : spec.worktop.hobCut }));
  let cursor = r0;
  for (const cut of [...cuts, { x0: r1, x1: r1, module: '' }]) {
    if (cut.x0 - cursor > 1e-6) put(spec.worktop.slab, (cursor + cut.x0) / 2, slabY, (cut.x0 - cursor) / cell(spec.worktop.slab));
    if (cut.module) put(cut.module, (cut.x0 + cut.x1) / 2, slabY);
    cursor = cut.x1;
  }

  // Uppers: every tier at the spec height when it fits; else lowered by up to 0.15 m (never
  // closer than the splash minimum to the worktop); else without its top tier, and so on.
  const heights = spec.uppers.tiers.map(t => moduleSize(t.bays[0]!)[1]);
  const stack = (k: number) => heights.slice(0, k).reduce((s, h) => s + h, 0);
  let tiers = spec.uppers.tiers.length, bottom = spec.uppers.bottom;
  for (; tiers > 0; tiers--) {
    if (spec.uppers.bottom + stack(tiers) <= ceiling + 1e-6) break;
    const lowered = ceiling - stack(tiers);
    if (lowered >= Math.max(spec.uppers.bottom - .15, top + MIN_SPLASH) - 1e-6) { bottom = lowered; break; }
  }
  const uppersTop = bottom + stack(tiers);

  // Backsplash: the style's panel widths from the run start, the last one cut to fit.
  const splashTop = tiers ? bottom : Math.min(ceiling, top + spec.backsplash.height);
  if (splashTop - top > .05) {
    let x = r0, i = 0;
    const gap = .004, h = splashTop - top;
    while (r1 - x > .02) {
      const width = Math.min(spec.backsplash.panels[i % spec.backsplash.panels.length]!, r1 - x);
      put(spec.backsplash.module, x + width / 2, top, (width - gap) / cell(spec.backsplash.module), h / moduleSize(spec.backsplash.module)[1]);
      if (spec.backsplash.pull && width > .3) put(spec.backsplash.pull, x + width - .08, top + Math.min(.5, h / 2), 1, 1, moduleSize(spec.backsplash.module)[2]);
      x += width; i++;
    }
  }

  const lights: LightFixture[] = [];
  if (tiers) {
    let y = bottom;
    spec.uppers.tiers.slice(0, tiers).forEach((tier, t) => {
      layout.bays.forEach((bay, j) => put(tier.bays[j % tier.bays.length]!, bay.x, y));
      // The plain first module of a tier carries a constant section: it fills and ends.
      const plain = tier.bays[0]!, fillers: [number, number][] = [];
      if (layout.filler) fillers.push(layout.filler);
      for (const x of layout.ends) fillers.push([x - spec.base.endWidth / 2, x + spec.base.endWidth / 2]);
      for (const [f0, f1] of fillers) put(plain, (f0 + f1) / 2, y, (f1 - f0) / cell(plain));
      y += heights[t]!;
    });
    // One lens under the lowest tier for the whole straight stretch.
    const length = r1 - r0 - .04, lensY = bottom - (spec.uppers.bottom - spec.lens.y);
    put(spec.uppers.underLens, (r0 + r1) / 2, lensY, length / cell(spec.uppers.underLens), 1, spec.lens.z);
    lights.push(lensRecord(frame, room, `${item.id}-lens-0`, (r0 + r1) / 2, lensY, back + spec.lens.z, length, floor.elevation,
      { lumensPerMetre: spec.lens.lumensPerMetre, color: spec.lens.color, kelvin: 4000, facing: 'down', beamDeg: 120, range: 1.6 },
      { furniture: item.id }));
  }
  // Bulkhead from the uppers (or the splash) to the ceiling.
  const bulkheadFrom = tiers ? uppersTop : splashTop;
  if (ceiling - bulkheadFrom > .01) {
    const module = spec.bulkhead.module;
    put(module, (r0 + r1) / 2, bulkheadFrom, (r1 - r0) / cell(module), (ceiling - bulkheadFrom) / moduleSize(module)[1]);
  }

  // Stepped service column at +x: its stack to the ceiling, the screen at scale 1.
  if (layout.column && spec.column) {
    const [c0, c1] = layout.column, cx = (c0 + c1) / 2;
    const pieces = spec.column.modules.stack, last = pieces[pieces.length - 1]!;
    let y = 0;
    for (const module of pieces.slice(0, -1)) {
      const h = moduleSize(module)[1];
      if (y + h > ceiling - .05) break;
      put(module, cx, y);
      y += h;
    }
    if (ceiling - y > .01) put(last, cx, y, 1, (ceiling - y) / moduleSize(last)[1]);
    put(spec.column.modules.screen, cx, top + .3, 1, 1, moduleSize(pieces[Math.min(1, pieces.length - 1)]!)[2]);
  }
  return lights;
}
