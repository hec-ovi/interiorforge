import { expect, it } from 'vitest';
import { validateRequest, resolveAssignments } from '../src/blueprint/validate.js';
import { planBuilding } from '../src/layout/index.js';
import { partitionConflicts } from '../src/layout/openings.js';
import { roomArea } from '../src/layout/room-shape.js';
import { damagedGroundSummary } from '../src/styles/damaged/ground-program.js';
import { toWorldPolygon } from '../src/layout/uv.js';

const cases = ['residential-courtyard', 'residential-megablock'].flatMap(architecture => [40, 60].map(size => ({ architecture, size })));
it.each(cases)('gives $architecture $size a bounded, furnished public ground programme', async ({ architecture, size }) => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const floors = size === 40 ? 6 : 8;
  const { blueprint } = await exterior({ seed: `worn-homes-${architecture}-${size}-v2`, buildingId: 'ground-proof', theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [size, 0], [size, size], [0, size]], accessPoint: [size / 2, -1], maxHeight: 42 },
    building: { type: 'residential', tier: 'poor', floors, floorKinds: Array.from({ length: floors }, (_, i) => i === 0 ? 'lobby' : 'apartment') },
    options: { architecture, minimumClearHeight: 3, preferredFloorHeight: 3.5, glb: 'named', balconies: 'off', doorMotion: 'pocket',
      facadeServices: 'off', roofArtifacts: 'off', adScreens: 'off', signage: null } }, { textures: { mode: 'keys' } });
  const request = validateRequest({ seed: `worn-homes-${architecture}-${size}-v2`, building: { id: 'ground-proof', type: 'residential', tier: 'poor' },
    blueprint, materialTheme: 'cyberpunk' });
  const plan = planBuilding(request, resolveAssignments(request), new Set([0]));
  const uv = plan.uvFloors.get(0)!, floor = plan.floors[0]!;
  const summary = damagedGroundSummary(uv.rooms);
  expect(summary.length).toBeGreaterThanOrEqual(7);
  const expected = { 'entry-mail-hall': 'reception_desk', 'resident-waiting': 'sofa', 'caretaker-office': 'desk',
    'public-washroom': 'toilet', 'parcel-store': 'shelf', 'shared-kitchen': 'kitchen_block' };
  for (const [role, furnishing] of Object.entries(expected)) {
    const room = summary.find(row => row.role === role);
    expect(room, role).toBeDefined();
    expect(uv.furniture.some(piece => piece.room === room!.room && piece.kind === furnishing), `${role} needs ${furnishing}`).toBe(true);
  }
  const entranceRoom=summary.find(row=>row.role==='entry-mail-hall')!;
  expect(uv.furniture.some(piece=>piece.room===entranceRoom.room&&piece.kind==='ornament_wall'),'actual communal mail bank').toBe(true);
  for(const room of summary.filter(row=>row.role.startsWith('resident-workroom')||row.role.startsWith('residents-room'))) {
    const essential=room.kind==='meeting'?'meeting_table':'desk';
    expect(uv.furniture.some(piece=>piece.room===room.room&&piece.kind===essential),`${room.role} needs useful furniture`).toBe(true);
  }
  expect(summary.find(row => row.role === 'entry-mail-hall')!.area).toBeLessThanOrEqual(120);
  expect(summary.filter(row => row.kind !== 'corridor').every(row => row.area <= 120)).toBe(true);
  expect(uv.rooms.every(room => room.unit === undefined)).toBe(true);
  expect(uv.rooms.filter(room => room.kind === 'reception')).toHaveLength(1);
  expect(roomArea(uv.rooms.find(room => room.kind === 'reception')!)).toBeLessThan(150);
  const spine = uv.rooms.find(room => room.id.endsWith('-damaged-arrival-spine'))!;
  expect(spine.rect.lu).toBeGreaterThanOrEqual(4);
  expect(spine.doors.filter(door => door.width >= 3.2)).toHaveLength(2);
  expect(uv.rooms.flatMap(room => room.doors).filter(door => door.to !== 'outside').every(door => !door.openFront)).toBe(true);
  expect(floor.rooms.flatMap(room => room.doors).some(door => door.to === 'outside')).toBe(true);
  expect(partitionConflicts({ rooms: uv.rooms.map(room => ({ id: room.id, kind: room.kind,
    polygon: toWorldPolygon(room.polygon!, plan.core.frame), holes: room.holes?.map(hole => toWorldPolygon(hole, plan.core.frame)), doors: [] })) },
  blueprint.floors[0], blueprint.facade, toWorldPolygon(uv.outline, plan.core.frame))).toHaveLength(0);
}, 120_000);
