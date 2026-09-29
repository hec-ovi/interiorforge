import { expect, it } from 'vitest';
import { validateRequest, resolveAssignments } from '../src/blueprint/validate.js';
import { makePlacementFixture } from '../src/index.js';
import { pointInPolygon } from '../src/core/geom.js';
import { segmentDistance } from '../src/core/segment-sweep.js';
import { planBuilding, type BuildingPlan } from '../src/layout/index.js';
import { templateSwitch } from '../src/layout/templates/registry.js';
import { commonTransit } from '../src/layout/architecture-access.js';
import { uvRectCorners, worldToUv } from '../src/layout/uv.js';
import { CORPO_VANITY_FIT } from '../src/styles/luxury/corpo-bathroom.js';

/** Measure continuous segment-to-furniture separation independently of the box
 * reservations the furnishing implementation uses. This is wider than NPC reachability. */
function expectPublicFurnitureClearance(plan: BuildingPlan): void {
  let measured = 0;
  for (const [floor, circulation] of plan.circulation) {
    const uv = plan.uvFloors.get(floor)!;
    const publicRooms = uv.rooms.filter(commonTransit);
    const publicIds = new Set(publicRooms.map(room => room.id));
    const selected = new Set(circulation.endpoints.filter(endpoint =>
      ['stair', 'elevator', 'entrance'].includes(endpoint.kind)
      || endpoint.kind === 'room' && publicIds.has(endpoint.source)
      || endpoint.kind === 'door' && publicRooms.some(room => endpoint.id.endsWith(`:${room.id}`)))
      .map(endpoint => endpoint.id));
    const routes = circulation.routes.filter(route => selected.has(route.to));
    for (const piece of uv.furniture.filter(piece => publicIds.has(piece.room) && !piece.elevation)) {
      const [width, depth] = piece.rotationDeg % 180 ? [piece.size[1], piece.size[0]] : piece.size;
      const polygon = uvRectCorners({ u: piece.at[0] - width! / 2, v: piece.at[1] - depth! / 2,
        lu: width!, lv: depth! });
      for (const route of routes) for (let index = 0; index < route.points.length; index++) {
        const a = worldToUv(route.points[index]!, plan.core.frame);
        const b = worldToUv(route.points[Math.min(index + 1, route.points.length - 1)]!, plan.core.frame);
        const distance = pointInPolygon(a, polygon) || pointInPolygon(b, polygon) ? 0
          : Math.min(...polygon.map((point, edge) => segmentDistance(a, b, point, polygon[(edge + 1) % 4]!)));
        expect(distance, `floor ${floor} ${piece.kind}/${piece.id} crowds ${route.to}`).toBeGreaterThanOrEqual(1.7 - 1e-6);
        measured++;
      }
    }
  }
  expect(measured).toBeGreaterThan(100);
}

it.each(['mirror-frame', 'balcony-grid'])('leaves generous public furniture routes in the translated %s review geometry and retains full beds', async architecture => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await exterior({ buildingId: 'p0', seed: 'luxury-reference-review',
    parcel: { footprint: [[81.5, 34], [121.5, 34], [121.5, 74], [81.5, 74]],
      accessPoint: [101.5, 34], maxHeight: 31.5,
      buildingGrid: { origin: [81.5, 34], angle: 0, spacing: 0.5 } },
    building: { type: 'residential', tier: 'high_rich', floors: 6 }, theme: 'cyberpunk',
    options: { architecture, glb: 'merged' } }, { textures: { mode: 'keys' } });
  const request = validateRequest({ seed: 'luxury-reference-review',
    building: { id: 'p0', type: 'residential', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' });
  // Kind A and B homes now take the reference apartments with their own beds; these full beds and vanities are the generic program they fall back to.
  templateSwitch.enabled = false;
  let plan: BuildingPlan;
  try {
    plan = planBuilding(request, resolveAssignments(request), new Set([0, 1]));
  } finally {
    templateSwitch.enabled = true;
  }
  expectPublicFurnitureClearance(plan);
  const ground = plan.floors.find(floor => floor.floor === 0)!;
  const sofas = ground.furniture.filter(piece => piece.kind === 'sofa');
  expect(sofas.length).toBeLessThanOrEqual(4);
  const entrance = ground.rooms.flatMap(room => room.doors).find(door => door.to === 'outside')!;
  expect(sofas.some(piece => piece.position[0] < entrance.position[0] - 2)).toBe(true);
  expect(sofas.some(piece => piece.position[0] > entrance.position[0] + 2)).toBe(true);
  for (const sofa of sofas) {
    const halfWidth = (sofa.rotationDeg % 180 ? sofa.size[1] : sofa.size[0]) / 2;
    expect(Math.abs(sofa.position[0] - entrance.position[0]) - halfWidth).toBeGreaterThanOrEqual(2);
    const owner = ground.rooms.find(room => room.id === sofa.room)!;
    if (owner.kind === 'lounge') {
      expect(owner.doors.some(door => ground.rooms.find(room => room.id === door.to)?.kind === 'reception')).toBe(true);
    } else expect(sofa.position[1]).toBeLessThan(entrance.position[1] + 9);
  }
  expect(ground.furniture.some(piece => piece.kind === 'reception_desk')).toBe(true);
  const upper = plan.floors.find(floor => floor.floor === 1)!;
  for (const room of upper.rooms.filter(room => room.kind === 'bathroom')) {
    const fixtures = upper.furniture.filter(piece => piece.room === room.id);
    expect(fixtures.map(piece => piece.kind).sort(), room.id).toEqual(['shower', 'sink', 'toilet']);
    // A private residential bathroom stands the fitted Corpo Plaza vanity.
    expect(fixtures.find(piece => piece.kind === 'sink')!.size.slice(0, 2)).toEqual(CORPO_VANITY_FIT.size.slice(0, 2));
    expect(fixtures.find(piece => piece.kind === 'shower')!.size.slice(0, 2)).toEqual([1.3, 1.1]);
  }
  for (const room of upper.rooms.filter(room => room.kind === 'bedroom')) {
    const bed = upper.furniture.filter(piece => piece.kind === 'bed_double' && piece.room === room.id);
    expect(bed, room.id).toHaveLength(1);
    expect(bed[0]!.size.slice(0, 2)).toEqual([2, 2.3]);
  }
}, 180_000);

it('keeps the same public clearance on a dynamically sized 60m plate', () => {
  const request = validateRequest(makePlacementFixture({ width: 60, depth: 40, floors: 3,
    type: 'residential', tier: 'high_rich', seed: 'public-sixty' }));
  const plan = planBuilding(request, resolveAssignments(request), new Set([0, 1]));
  expectPublicFurnitureClearance(plan);
  for (const floor of plan.floors) for (const room of floor.rooms.filter(room => room.kind === 'bathroom')) {
    expect(floor.furniture.filter(piece => piece.room === room.id).map(piece => piece.kind).sort(), room.id)
      .toEqual(['shower', 'sink', 'toilet']);
  }
}, 180_000);
