import { describe, expect, it } from 'vitest';
import { generate, type InteriorRequest } from '../src/index.js';
import { templateSwitch } from '../src/layout/templates/registry.js';
import { KIND_TEMPLATES } from '../src/styles/reference/kinds.js';

/** Kit plans straight from Exterior's assembly planner (tests/fixtures.ts pattern). */
async function kitRequest(family: string, type: InteriorRequest['building']['type'], tier: InteriorRequest['building']['tier'],
  width: number, depth: number, floors: number): Promise<InteriorRequest> {
  const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = planAssembly({ buildingId: `templates-${family}`, family, seed: 'interior-proof', lot: { width, depth }, floors });
  return { seed: 'interior-proof', building: { id: `templates-${family}`, type, tier }, blueprint, materialTheme: 'cyberpunk' };
}

// Exterior's kit planner has piece sets for the paired shells; a poor white-grid shell is kind C.
const cases = [
  { kind: 'A', family: 'mirror-frame', type: 'residential', tier: 'high_rich', width: 24, depth: 40 },
  { kind: 'B', family: 'balcony-grid', type: 'residential', tier: 'rich', width: 40, depth: 40 },
  { kind: 'C', family: 'white-grid', type: 'residential', tier: 'poor', width: 40, depth: 40 },
  { kind: 'R', family: 'corporate-sectors', type: 'offices', tier: 'rich', width: 40, depth: 40 },
] as const;

describe('space templates in generated buildings', () => {
  for (const item of cases) it(`fits ${item.kind} templates on a ${item.width}x${item.depth} ${item.family} building and styles every room`, async () => {
    const request = await kitRequest(item.family, item.type, item.tier, item.width, item.depth, 3);
    const result = await generate(request, { models: new Set() });
    const floors = Object.values(result.layouts).map(layout => layout.floor);
    const templated = floors.flatMap(floor => floor.rooms.filter(room => room.template));
    expect(templated.length, item.kind).toBeGreaterThan(0);
    for (const room of templated) {
      expect(KIND_TEMPLATES[item.kind] as readonly string[]).toContain(room.template!.split('/')[0]);
      expect(room.style).toBe(room.template!.slice(0, 2));
    }
    for (const floor of floors) for (const room of floor.rooms) {
      if (room.id.startsWith('stair-')) continue;
      expect(room.style, `${floor.floor} ${room.id} ${room.kind}`).toBeDefined();
    }
    expect(templated.some(room => room.unit || item.kind === 'R')).toBe(true);
    // every templated dwelling keeps exactly one public entrance and its whole program
    for (const floor of floors) {
      const units = new Set(floor.rooms.filter(room => room.unit && room.template).map(room => room.unit!));
      for (const unit of units) {
        const own = floor.rooms.filter(room => room.unit === unit);
        const common = new Set(floor.rooms.filter(room => !room.unit).map(room => room.id));
        expect(own.flatMap(room => room.doors.filter(door => common.has(door.to))), unit).toHaveLength(1);
        for (const bed of own.filter(room => room.kind === 'bedroom'))
          expect(floor.furniture.some(piece => piece.room === bed.id && ['bed_double', 'bed_single', 'sleeping_pod'].includes(piece.kind)), bed.id).toBe(true);
        // a luxury reference bath keeps vanity, shower and toilet
        if (item.kind === 'A' || item.kind === 'B') for (const bath of own.filter(room => room.kind === 'bathroom'))
          expect(floor.furniture.filter(piece => piece.room === bath.id).map(piece => piece.kind), bath.id)
            .toEqual(expect.arrayContaining(['shower', 'sink', 'toilet']));
      }
    }
    // a refined lobby keeps its street door on the reception, where the concierge meets the arrival
    if (item.kind === 'A' || item.kind === 'B') {
      const ground = result.layouts.ground!.floor;
      expect(ground.rooms.find(room => room.doors.some(door => door.to === 'outside'))?.kind).toBe('reception');
    }
    // scaled or dropped reference rooms are reported with the floor's program
    const changes = result.building.floors.flatMap(floor => floor.program?.changes ?? []);
    for (const change of changes) expect(change.requested).toHaveLength(2);
  }, 120_000);

  it('plans the same building without templates when they are switched off, and repeats middle floors identically', async () => {
    const request = await kitRequest('mirror-frame', 'residential', 'high_rich', 24, 40, 6);
    const first = await generate(request, { models: new Set() });
    const again = await generate(request, { models: new Set() });
    expect(JSON.stringify(again.layouts.middle!.floor.rooms)).toBe(JSON.stringify(first.layouts.middle!.floor.rooms));
    expect(first.building.floors.filter(floor => floor.layout === 'middle').length).toBeGreaterThan(1);
    templateSwitch.enabled = false;
    try {
      const plain = await generate(request, { models: new Set() });
      expect(Object.values(plain.layouts).flatMap(layout => layout.floor.rooms).some(room => room.template)).toBe(false);
    } finally {
      templateSwitch.enabled = true;
    }
  }, 120_000);
});
