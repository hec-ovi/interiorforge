import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Blueprint, BlueprintFloor, InteriorRequest } from '../src/core/types.js';
import { boundaryDistance, polygonArea, polygonBounds, type Point } from '../src/core/geom.js';
import { roomFootprintContains } from '../src/core/room-footprint.js';
import { SHELL_SEAM, facadeDepth, shellFace, shellWallDepth } from '../src/layout/shell.js';
import { makeFrame } from '../src/layout/uv.js';
import { generate, type PlacementResult } from '../src/index.js';
import { coverRectangles } from '../src/placements/surfaces.js';
import type { FloorPlacement } from '../src/placements/types.js';

/** Exterior fits a floor's rooms into the largest grid rectangle clear of its shell and
 *  notches, which can stand a metre or more behind the shell's inner face. The rooms reach
 *  the face once the building is planned, so no band is left between them and the facade
 *  to join the homes of a floor behind their closed doors. */

const blueprint: Blueprint = JSON.parse(readFileSync(new URL('./kit-plans/balcony-grid-review-05.blueprint.json', import.meta.url), 'utf8'));

describe('the shell face rooms reach', () => {
  const floor = blueprint.floors[1]!, depth = shellWallDepth(blueprint.facade) + SHELL_SEAM;

  it('steps a curved facade on the construction axes, never into the wall, ending each partition line on the face', () => {
    const breaks = { u: [116.3, 118.9], v: [70.2] };
    const face = shellFace(floor, makeFrame(0), depth, breaks);
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!;
      expect(Math.min(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeLessThan(1e-9);
    });
    for (const point of face) expect(boundaryDistance(point, floor.outline)).toBeGreaterThanOrEqual(depth - 1e-6);
    // The rectangle the rooms were planned in stands inside the face.
    for (const point of floor.roomEnvelope!.corners) expect(boundaryDistance(point, face)).toBeGreaterThanOrEqual(-1e-6);
    const onFace = (point: Point) => Math.abs(boundaryDistance(point, floor.outline) - depth) < 1e-6;
    for (const u of breaks.u) expect(face.some(point => Math.abs(point[0] - u) < 1e-9 && onFace(point)), `u ${u}`).toBe(true);
    for (const v of breaks.v) expect(face.some(point => Math.abs(point[1] - v) < 1e-9 && onFace(point)), `v ${v}`).toBe(true);
  });

  it('cuts a stepped footprint largest rectangle first, covering it exactly', () => {
    const polygon: Point[] = [[0, 0], [6, 0], [6, 3], [5.8, 3], [5.8, 3.2], [5.5, 3.2], [5.5, 3.5], [0, 3.5]];
    const rects = coverRectangles(polygon);
    expect(rects[0]).toEqual({ u: 0, v: 0, lu: 5.5, lv: 3.5 });
    expect(rects.reduce((sum, rect) => sum + rect.lu * rect.lv, 0)).toBeCloseTo(Math.abs(polygonArea(polygon)), 9);
    expect(rects).toHaveLength(3);
  });
});

/** Points inside the shell's face that no published room, shaft or loft void stands on. */
function band(result: PlacementResult, plan: Blueprint, layoutId: string, face: number): number {
  const layout = (result.layouts as Record<string, FloorPlacement>)[layoutId]!, bp = plan.floors.find(item => item.index === layout.sourceFloor)!;
  const rooms = layout.floor.rooms, shafts = layout.floor.core.shafts ?? [];
  const voids = (layout.floor.duplexes ?? []).flatMap(slice => [...slice.loungeVoids, slice.stairOpening]);
  const b = polygonBounds(bp.outline), step = .25;
  let open = 0;
  for (let x = b.x + step / 2; x < b.x + b.w; x += step) for (let z = b.z + step / 2; z < b.z + b.d; z += step) {
    const point: Point = [x, z];
    // Leave the face's own steps along a curve out: they stand within a step of it.
    if (boundaryDistance(point, bp.outline) < face + .25) continue;
    if (rooms.some(room => roomFootprintContains(room, point))) continue;
    if (voids.some(ring => roomFootprintContains({ polygon: ring }, point))) continue;
    if (shafts.some(rect => inShaft(rect, point, layout.floor.coreAngleDeg ?? 0))) continue;
    open++;
  }
  return open * step * step;
}

/** A core rect publishes its world centre as `x + w / 2, z + d / 2` and its sides on the
 *  core's frame axes. */
function inShaft(rect: { x: number; z: number; w: number; d: number }, [x, z]: Point, angleDeg: number): boolean {
  const a = angleDeg * Math.PI / 180, dx = x - rect.x - rect.w / 2, dz = z - rect.z - rect.d / 2;
  const u = Math.cos(a) * dx + Math.sin(a) * dz, v = -Math.sin(a) * dx + Math.cos(a) * dz;
  return Math.abs(u) <= rect.w / 2 + 1e-6 && Math.abs(v) <= rect.d / 2 + 1e-6;
}

function build(plan: Blueprint, tier: InteriorRequest['building']['tier']): Promise<PlacementResult> {
  return generate({ seed: 'shell-reach', building: { id: 'shell-reach', type: 'residential', tier }, blueprint: plan, materialTheme: 'cyberpunk' },
    { models: new Set() });
}

describe('a furnished building reaches its shell', () => {
  it('leaves no band between the rooms and a notched, curved glass facade, and closes each window a partition meets', { timeout: 300000 }, async () => {
    const result = await build(blueprint, 'rich');
    const face = shellWallDepth(blueprint.facade) + SHELL_SEAM;
    for (const layout of Object.values(result.layouts)) {
      if (layout.floor.kind === 'roof') continue;
      // The planned rectangle left some 200 m² of band on each floor of this plan.
      expect(band(result, blueprint, layout.id, face), layout.id).toBeLessThan(1);
    }
    // A street door moves out to the face with its wall.
    const ground = result.layouts.ground!;
    const entrance = ground.floor.rooms.flatMap(room => room.doors).find(door => door.to === 'outside' && door.kind !== 'openFront');
    if (entrance) expect(boundaryDistance(entrance.position, blueprint.floors[0]!.outline)).toBeCloseTo(face, 2);
    // Where a partition meets glass, a cap closes the window's reveal behind its end.
    const caps = result.building.floors.flatMap(ref => (ref.treatments ?? []).filter(item => item.id?.startsWith('partition-cap:')));
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      const bp = blueprint.floors.find(item => cap.id!.startsWith(`partition-cap:${item.index}:`))!;
      const depth = boundaryDistance([cap.position[0], cap.position[2]], bp.outline);
      expect(depth).toBeLessThan(face);
      expect(depth).toBeGreaterThan(0);
    }
  });

  it('lines an interior-lined facade at the shell and leaves no band behind the lining', { timeout: 300000 }, async () => {
    // A plain poor block: Interior lines its facade, a metre behind which its rooms were planned.
    const plan: Blueprint = JSON.parse(readFileSync(new URL('./kit-plans/plain-residential-poor-3x4x4f.blueprint.json', import.meta.url), 'utf8'));
    const result = await build(plan, 'poor');
    const face = facadeDepth(plan.facade);
    expect(plan.floors.every((item: BlueprintFloor) => !!item.roomEnvelope)).toBe(true);
    for (const layout of Object.values(result.layouts)) {
      if (layout.floor.kind === 'roof') continue;
      expect(band(result, plan, layout.id, face), layout.id).toBeLessThan(1);
    }
  });
});
