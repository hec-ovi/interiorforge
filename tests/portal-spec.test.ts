import { describe, expect, it } from 'vitest';
import { makeFrame, worldToUv } from '../src/layout/uv.js';
import { LUXURY_PUBLIC_PORTAL } from '../src/styles/luxury/portals.js';
import {
  casingRecipes, placePortal, portalChain, portalCut, portalEligible, portalModules, portalReach, portalRecipes, validatePortal,
} from '../src/styles/systems/portal.js';
import { REFERENCE_CASINGS, REFERENCE_PORTALS, portalsWithLayers, referenceCasingRecipes, referencePortal } from '../src/styles/systems/reference-portals.js';
import type { PortalSpec } from '../src/styles/systems/types.js';
import { FreeBuilder, buildSet, triangles, vertices, worldBox, type V3 } from './built-ins-harness.js';

const meshes = buildSet(...REFERENCE_PORTALS.map(portalRecipes), portalRecipes(LUXURY_PUBLIC_PORTAL), referenceCasingRecipes);
const lookup = (id: string) => referencePortal(id);
const INNER = REFERENCE_PORTALS.filter(spec => !REFERENCE_PORTALS.some(other => other.layers?.includes(spec.id)));

/** The tallest straight head a spec takes under `ceiling`, capped at 2.4 m. */
const layersOf = (spec: PortalSpec) => portalChain(spec, lookup).slice(1);
const rise = (spec: PortalSpec) => portalReach(spec, layersOf(spec)).rise;
const headFor = (spec: PortalSpec, ceiling: number) => Math.min(2.4, ceiling - rise(spec) - .011);
const ceilingFor = (spec: PortalSpec) => spec.minHeight + rise(spec) + .011 > 3.1 ? 3.6 : 3.1;

function place(spec: PortalSpec, width: number, head: number, axis: 'H' | 'V' = 'H', angle = 0, elevation = 0) {
  const builder = new FreeBuilder(), frame = makeFrame(angle);
  const lights = placePortal(builder, spec, 'room', axis, 0, 0, width, head, frame, { lookup, elevation });
  // Wall-local coordinates: along the line, up, across it.
  const local = (v: V3): V3 => { const [u, w] = worldToUv([v[0], v[2]], frame); return axis === 'H' ? [u, v[1], w] : [w, v[1], -u]; };
  return { builder, lights, local };
}

const cases = INNER.flatMap(spec => [1.2, 2.7, 3.6].filter(w => w >= spec.minWidth).map(width => [spec.id, width] as const));

describe('portal specs', () => {
  it('validates every reference spec and refuses a layer that does not continue its band', () => {
    for (const spec of REFERENCE_PORTALS) expect(() => validatePortal(spec, lookup)).not.toThrow();
    const broken: PortalSpec = { ...referencePortal('e1-inner')!, layers: ['e1-block'] };
    expect(() => validatePortal(broken, lookup)).toThrow(/does not continue/);
  });

  it.each(cases)('%s keeps a %s m aperture clear with constant radii and no box across the passage', (id, width) => {
    const spec = referencePortal(id)!, head = headFor(spec, ceilingFor(spec)), { builder, local } = place(spec, width, head);
    const r = spec.radius, half = width / 2;
    for (const { p, v } of vertices(builder.placements, meshes)) {
      const [x, y] = local(v);
      expect(Math.abs(x) >= half - 1e-5 || y >= head - 1e-5, `${p.module} vertex ${x},${y}`).toBe(true);
      // Inside the corner zones every vertex keeps at least the radius from the arc centre.
      if (r > 0 && Math.abs(x) > half - r + 1e-6 && Math.abs(x) < half && y > head) expect(Math.hypot(Math.abs(x) - (half - r), y - head)).toBeGreaterThanOrEqual(r - 1e-4);
    }
    for (const p of builder.placements) {
      const box = worldBox(p, meshes), a = local(box.min), b = local(box.max);
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]);
      expect(x1 <= -half + .01 || x0 >= half - .01 || y0 >= head - .01, `${p.module} collides across the passage`).toBe(true);
      if (/-(corner|slot|fill)$/.test(p.module!)) expect(p.scale).toEqual([1, 1, 1]);
      if (/-jamb$/.test(p.module!)) expect([p.scale[0], p.scale[2]]).toEqual([1, 1]);
      if (/header/.test(p.module!)) expect([p.scale[1], p.scale[2]]).toEqual([1, 1]);
    }
  });

  it.each(cases)('%s closes the whole %s m wall cut around the aperture', (id, width) => {
    const spec = referencePortal(id)!, head = headFor(spec, ceilingFor(spec)), { builder, local } = place(spec, width, head);
    const cut = portalCut(spec, layersOf(spec), { at: 0, width, y0: 0, y1: head }), r = spec.radius;
    // Front-facing triangles in wall-local xy, binned per 0.1 m.
    const bins = new Map<string, [number, number][][]>();
    let reach = 0, top = 0;
    for (const { t } of triangles(builder.placements, meshes)) {
      const q = t.map(local);
      reach = Math.max(reach, ...q.map(v => Math.abs(v[0]))); top = Math.max(top, ...q.map(v => v[1]));
      const n = (q[1]![0] - q[0]![0]) * (q[2]![1] - q[0]![1]) - (q[1]![1] - q[0]![1]) * (q[2]![0] - q[0]![0]);
      if (Math.abs(n) < 1e-10) continue;
      const tri = q.map(v => [v[0], v[1]] as [number, number]);
      const xs = tri.map(v => v[0]), ys = tri.map(v => v[1]);
      for (let i = Math.floor(Math.min(...xs) * 10); i <= Math.floor(Math.max(...xs) * 10); i++)
        for (let j = Math.floor(Math.min(...ys) * 10); j <= Math.floor(Math.max(...ys) * 10); j++) {
          const key = `${i}:${j}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key)!.push(tri);
        }
    }
    expect(reach).toBeCloseTo(cut.width / 2, 4);
    expect(top).toBeCloseTo(cut.y1, 4);
    const inside = ([px, py]: [number, number], [a, b, c]: [number, number][]) => {
      const s = (p: [number, number], q: [number, number]) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
      const d1 = s(a!, b!), d2 = s(b!, c!), d3 = s(c!, a!);
      return !((d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12) && (d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12));
    };
    let probes = 0;
    for (let y = .043; y < cut.y1 - .005; y += .071) for (let x = -cut.width / 2 + .013; x < cut.width / 2 - .005; x += .067) {
      const d = y - head, open = d <= 0 ? half(width) : d < r ? width / 2 - r + Math.sqrt(r * r - d * d) : r === 0 && d < 1e-9 ? width / 2 : -1;
      const hit = (bins.get(`${Math.floor(x * 10)}:${Math.floor(y * 10)}`) ?? []).some(t => inside([x, y], t));
      expect(hit, `${id} ${width} at ${x.toFixed(3)},${y.toFixed(3)}`).toBe(Math.abs(x) > open);
      probes++;
    }
    expect(probes).toBeGreaterThan(300);
  });

  it('refuses a portal whose surround would reach the ceiling, or rooms and widths it does not serve', () => {
    const spec = referencePortal('e1-inner')!, layers = layersOf(spec), ceiling = 2.3 + rise(spec) + .01;
    const hole = { at: 0, width: 2.7, y0: 0, y1: 2.3 };
    const peers = [{ room: 'a', kind: 'living' as const }, { room: 'b', kind: 'bedroom' as const }];
    expect(portalEligible(spec, peers, hole, ceiling, layers)).toBe(true);
    expect(portalEligible(spec, peers, hole, ceiling - .02, layers)).toBe(false);
    // Without its layers the inner surround alone would fit under a lower ceiling.
    expect(portalEligible(spec, peers, hole, ceiling - .1, [])).toBe(true);
    expect(portalEligible(spec, [...peers, { room: 'c', kind: 'toilets' }], hole, ceiling, layers)).toBe(false);
    expect(portalEligible(spec, [...peers, { room: 'stair-a', kind: 'corridor' }], hole, ceiling, layers)).toBe(false);
    expect(portalEligible(spec, peers, { ...hole, width: 1.1 }, ceiling, layers)).toBe(false);
    expect(portalEligible(spec, peers, { ...hole, y1: 2 }, ceiling, layers)).toBe(false);
    expect(portalEligible(spec, peers, { ...hole, y0: .9 }, ceiling, layers)).toBe(false);
  });

  it('places the E1 layers concentrically with a lit cyan reveal whose lens carries its record', () => {
    const spec = referencePortal('e1-inner')!, width = 2.8, head = 2.3, elevation = 7.2;
    const { builder, lights } = place(spec, width, head, 'H', 0, elevation);
    const ids = portalModules(spec), outer = portalModules(referencePortal('e1-outer')!);
    const corners = builder.placements.filter(p => p.module === ids.corner('right') || p.module === outer.corner('right'));
    // Both arcs share one centre: concentric bands, radii 0.26 and 0.5.
    expect(new Set(corners.map(p => `${p.position[0].toFixed(6)}:${p.position[1].toFixed(6)}`)).size).toBe(1);
    expect(builder.placements.filter(p => p.module === ids.header)).toHaveLength(1);
    expect(builder.placements.filter(p => p.module === outer.layerHeader)).toHaveLength(1);
    expect(builder.placements.some(p => p.module === outer.header)).toBe(false);
    // Only the outermost layer closes the square cut.
    expect(builder.placements.some(p => p.module === ids.fill('left'))).toBe(false);
    expect(builder.placements.filter(p => p.module === outer.fill('left'))).toHaveLength(1);
    expect(builder.placements.filter(p => p.module === ids.slot('left'))).toHaveLength(1);
    const lens = builder.placements.filter(p => p.module === ids.reveal);
    expect(lens).toHaveLength(1);
    expect(lights).toHaveLength(1);
    expect(lights[0]!.id).toBe(lens[0]!.id);
    expect(lights[0]!.color).toEqual([.08, .78, 1]);
    expect(lights[0]!.position[1]).toBeCloseTo(elevation + head + spec.radius - .004, 3);
    expect(lights[0]!.length).toBeCloseTo(width - 2 * spec.radius, 3);
    expect(ids.reveal).toMatch(/^ceiling-cove-/);
  });

  it('builds the R1 layered doorway square, bronze-lined inside an outer frame', () => {
    const spec = referencePortal('r1-layered')!, { builder, local } = place(spec, .9, 2.2);
    const outer = portalModules(referencePortal('r1-layered-outer')!);
    const jambs = builder.placements.filter(p => p.module === outer.jamb('right'));
    expect(jambs).toHaveLength(1);
    expect(local(jambs[0]!.position)[0]).toBeCloseTo(.45 + .1, 6);
    const cut = portalCut(spec, layersOf(spec), { at: 0, width: .9, y0: 0, y1: 2.2 });
    expect(cut.width).toBeCloseTo(.9 + 2 * .26, 9);
    expect(cut.y1).toBeCloseTo(2.2 + .26, 9);
    expect(builder.placements.some(p => p.module?.endsWith('-fill'))).toBe(false);
  });

  it('keeps the aperture after a rotated V-axis placement', () => {
    const spec = referencePortal('e1-inner')!, width = 2.7, head = 2.3, { builder, local } = place(spec, width, head, 'V', 37);
    for (const { v } of vertices(builder.placements, meshes)) {
      const [x, y] = local(v);
      expect(Math.abs(x) >= width / 2 - 1e-5 || y >= head - 1e-5).toBe(true);
    }
  });

  it('stays inside the triangle budget: corners about 1.1 k, no portal module above 10 k', () => {
    for (const spec of [...REFERENCE_PORTALS, LUXURY_PUBLIC_PORTAL]) {
      const ids = portalModules(spec);
      for (const side of ['left', 'right'] as const) expect(meshes.get(ids.corner(side))!.triangles).toBeLessThanOrEqual(1200);
    }
    for (const built of meshes.values()) expect(built.triangles, built.id).toBeLessThanOrEqual(10000);
    expect(meshes.get('wall-portal-luxury-left-corner')!.triangles).toBeLessThan(4552 / 3);
  });

  it('keeps every reference casing inside the shared casing envelope', () => {
    const casings = buildSet(...Object.entries(REFERENCE_CASINGS).map(([sid, look]) => casingRecipes(`${sid}-probe`, look)));
    for (const sid of Object.keys(REFERENCE_CASINGS)) {
      const jamb = casings.get(`door-jamb-${sid}-probe`)!, header = casings.get(`door-header-${sid}-probe`)!;
      expect(jamb.min.map(n => n || 0)).toEqual([-.04, 0, -.1]);
      expect(jamb.max).toEqual([.04, .5, .1]);
      expect(header.min.map(n => n || 0)).toEqual([-.25, 0, -.1]);
      expect(header.max).toEqual([.25, .08, .1]);
      expect(jamb.kit.mesh.materials().length).toBeGreaterThan(1);
    }
  });

  it('lists every layer it places and resolves them through the lookup', () => {
    expect(portalsWithLayers('e1-inner', 'r1-layered').map(s => s.id)).toEqual(['e1-inner', 'e1-outer', 'r1-layered', 'r1-layered-outer']);
    expect(portalChain(referencePortal('e1-grand')!, lookup).map(s => s.id)).toEqual(['e1-grand', 'e1-outer', 'e1-block']);
    expect(() => portalChain({ ...referencePortal('e1-inner')!, layers: ['missing'] }, lookup)).toThrow(/unknown layer/);
  });
});

function half(width: number): number { return width / 2; }
