import { describe, expect, it } from 'vitest';
import { Kit } from '../src/modules/kit.js';
import type { Point } from '../src/core/geom.js';

type V = [number, number, number];
const SLOT = 'test/shape/mid#plain';

function geometry(kit: Kit) {
  const g = kit.mesh.getGroup(SLOT)!;
  const p = Array.from(g.positions), n = Array.from(g.normals), idx = Array.from(g.indices);
  const at = (i: number): V => [p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!];
  const normal = (i: number): V => [n[3 * i]!, n[3 * i + 1]!, n[3 * i + 2]!];
  const min = [0, 1, 2].map(a => Math.min(...p.filter((_, i) => i % 3 === a)));
  const max = [0, 1, 2].map(a => Math.max(...p.filter((_, i) => i % 3 === a)));
  return { triangles: idx.length / 3, idx, at, normal, min, max, vertices: p.length / 3 };
}

/** Every triangle faces the way its vertex normals say (no inside-out faces). */
function outward(kit: Kit): void {
  const g = geometry(kit);
  for (let t = 0; t < g.idx.length; t += 3) {
    const [a, b, c] = [g.idx[t]!, g.idx[t + 1]!, g.idx[t + 2]!].map(g.at);
    const e1 = b!.map((v, i) => v - a![i]!), e2 = c!.map((v, i) => v - a![i]!);
    const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (Math.hypot(...face) < 1e-12) continue;
    const sum = [g.idx[t]!, g.idx[t + 1]!, g.idx[t + 2]!].map(g.normal).reduce<number[]>((s, v) => s.map((x, i) => x + v[i]!), [0, 0, 0]);
    expect(face[0]! * sum[0]! + face[1]! * sum[1]! + face[2]! * sum[2]!, `triangle ${t / 3}`).toBeGreaterThan(0);
  }
}

describe('kit shapes', () => {
  it('draws a smooth cylinder: radial side normals, sixteen sides by default, flat caps', () => {
    const kit = new Kit(() => [1, 1]);
    kit.cylinder(SLOT, [0, 0, 0], .1, .3);
    const g = geometry(kit);
    expect(g.triangles).toBe(16 * 2 + 14 * 2);
    for (let i = 0; i < 34; i++) {
      const [x, , z] = g.at(i), [nx, ny, nz] = g.normal(i);
      expect(ny).toBeCloseTo(0, 9);
      expect(nx * x + nz * z).toBeGreaterThan(0);
    }
    expect(g.max[0]! - g.min[0]!).toBeCloseTo(.2, 9);
    expect(g.max[1]).toBeCloseTo(.3, 9);
    outward(kit);
  });

  it('keeps a bevelled box inside its bounds with rounded edges and outward faces', () => {
    const kit = new Kit(() => [1, 1]);
    kit.bevelBox(SLOT, [-.3, 0, 0], [.6, .7, .02], .004);
    const g = geometry(kit);
    expect(g.triangles).toBe(108);
    expect(g.min).toEqual([-.3, 0, 0].map(v => expect.closeTo(v, 9)));
    expect(g.max).toEqual([.3, .7, .02].map(v => expect.closeTo(v, 9)));
    // Corner vertices stand on the round, not on the sharp corner.
    for (let i = 0; i < g.vertices; i++) {
      const [x, y, z] = g.at(i);
      expect(Math.abs(x) > .3 - 1e-6 && (y < 1e-6 || z < 1e-6)).toBe(false);
    }
    outward(kit);
  });

  it('sweeps a rounded nose with shared normals and crisp corners', () => {
    const kit = new Kit(() => [1, 1]);
    const nose: Point[] = [[0, 0], [0, .63]];
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI / 2; nose.push([.078 + .022 * Math.sin(a) + .022, .63 + .022 * Math.cos(a) - .002]); }
    nose.push([.1, 0]);
    kit.sweep(SLOT, [[0, 0], [0, .628], [.078, .65], [.1, .628], [.1, 0]], -.25, .25);
    kit.sweep(SLOT, nose, -.25, .25);
    outward(kit);
    const g = geometry(kit);
    expect(g.min[0]).toBeCloseTo(-.25, 9);
    expect(g.max[0]).toBeCloseTo(.25, 9);
    expect(g.max[1]).toBeCloseTo(.1, 3);
  });

  it('sweeps an (x, y) section along z for an end nose', () => {
    const kit = new Kit(() => [1, 1]);
    kit.sweep(SLOT, [[0, 0], [.02, 0], [.03, .01], [.03, .07], [.014, .08], [0, .08]], -.25, .25, { axis: 'z' });
    outward(kit);
    const g = geometry(kit);
    expect(g.min).toEqual([0, 0, -.25].map(v => expect.closeTo(v, 9)));
    expect(g.max).toEqual([.03, .08, .25].map(v => expect.closeTo(v, 9)));
  });

  it('stands a D-shaped slab with a rounded top edge inside its plan', () => {
    const kit = new Kit(() => [1, 1]);
    const plan: [number, number][] = [[-.25, 0], [.25, 0], [.25, .17]];
    for (let i = 1; i < 16; i++) { const a = i / 16 * Math.PI; plan.push([.25 * Math.cos(a), .17 + .25 * Math.sin(a)]); }
    plan.push([-.25, .17]);
    kit.slab(SLOT, plan, .42, .5, .012, .004);
    outward(kit);
    const g = geometry(kit);
    expect(g.min).toEqual([-.25, .42, 0].map(v => expect.closeTo(v, 6)));
    expect(g.max).toEqual([.25, .5, .42].map(v => expect.closeTo(v, 6)));
  });

  it('draws a round rod on request', () => {
    const kit = new Kit(() => [1, 1]);
    kit.rod(SLOT, [0, 0, 0], [0, .5, 0], .02, true);
    const g = geometry(kit);
    expect(g.max[0]! - g.min[0]!).toBeCloseTo(.02, 6);
    outward(kit);
  });
});
