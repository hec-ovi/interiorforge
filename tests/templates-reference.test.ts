import { beforeAll, describe, expect, it } from 'vitest';
import { generate, type InteriorRequest } from '../src/index.js';
import type { GeneratedInterior } from '../src/placements/types.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { idGen } from '../src/layout/rooms.js';
import { uvRectCorners } from '../src/layout/uv.js';
import { fitTemplate } from '../src/layout/templates/fit.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import type { TemplateTarget } from '../src/layout/templates/schema.js';
import { referenceFrontage } from '../src/layout/facade-plan.js';
import type { UnitSizing } from '../src/layout/templates/registry.js';

/** The reference homes as their references separate them: each keeps its own rooms, its
 *  level changes and its reference size in a fitted target and in a generated tower, a
 *  deeper unit turns its extra depth into service rooms instead of stretching, and a
 *  templated home holds the pieces its template authored, not a generic salon. */

const target = (lu: number, lv: number): TemplateTarget => {
  const rect = { u: 0, v: 0, lu, lv }, corridor = { u: -4, v: -3, lu: lu + 8, lv: 3 };
  return { rect, polygon: uvRectCorners(rect), entryEdge: 'v0', facadeEdges: ['v1'], seatLegal: () => true, gridOrigin: [0, 0],
    publicRoom: { id: 'corridor', kind: 'corridor', rect: corridor, polygon: uvRectCorners(corridor), doors: [] } };
};
const role = (rooms: PlanRoom[], key: string, id: string) => rooms.find(room => room.template === `${key}/${id}`);

/** reference level changes: [template, room, delta] */
const LEVELS: [string, string, number][] = [
  ['e6-apartment2', 'living', -.4], ['e1-apartment', 'great', -.18], ['b3-apartment', 'living', -.54],
  ['b3-apartment', 'living', .15], ['b3-apartment', 'bed', .12], ['c1-capsule', 'studio', -.36], ['c7-room', 'kitchen', .1],
];

describe('reference homes fitted', () => {
  it('keep every reference level zone at its reference and at a deeper target', () => {
    for (const [key, room, delta] of LEVELS) {
      const t = TEMPLATES.get(key as never)!;
      for (const [w, d] of [[t.envelope.width, t.envelope.depth], [t.envelope.width, t.envelope.max[1] + 2.5]]) {
        const fit = fitTemplate(t, target(w!, d!), 'unit', idGen(1), () => true);
        expect(fit, `${key} ${w}x${d}`).not.toBeNull();
        expect(role(fit!.rooms, key, room)?.levels?.map(zone => zone.delta), `${key}/${room} ${w}x${d}`).toContain(delta);
      }
    }
  });

  it('keep the e6 kitchen its own room off the walkway, the bath off the genkan and the unit entered through the genkan', () => {
    const t = TEMPLATES.get('e6-apartment2')!;
    const fit = fitTemplate(t, target(14.5, 10.5), 'unit', idGen(1), () => true)!;
    const [kitchen, entry, bath, living] = ['kitchen', 'entry', 'bath', 'living'].map(id => role(fit.rooms, 'e6-apartment2', id)!) as [PlanRoom, PlanRoom, PlanRoom, PlanRoom];
    expect(kitchen.kind).toBe('kitchen');
    expect([kitchen.rect.lu, kitchen.rect.lv].map(v => +v.toFixed(2))).toEqual([4.65, 3.5]);
    expect(kitchen.doors.map(door => [door.to, door.width])).toEqual([[living.id, 4.1]]);
    expect(entry.role).toBe('foyer');
    expect(entry.doors.some(door => door.to === 'corridor')).toBe(true);
    expect(bath.doors.map(door => door.to)).toEqual([entry.id]);
    // reference ceilings: kitchen 2.85 under a 3.7 genkan and hall
    expect(t.rooms.find(room => room.id === 'kitchen')!.ceiling).toBe(2.85);
  });

  it('raise the c7 kitchen alcove one tiled riser and open it to the living at that lip', () => {
    const fit = fitTemplate(TEMPLATES.get('c7-room')!, target(19.15, 8.85), 'unit', idGen(1), () => true)!;
    const [kitchen, living] = ['kitchen', 'living'].map(id => role(fit.rooms, 'c7-room', id)!) as [PlanRoom, PlanRoom];
    expect(kitchen.levels?.map(zone => [zone.delta, zone.edge])).toEqual([[.1, 'step']]);
    const mouth = kitchen.doors.find(door => door.to === living.id)!;
    expect(mouth.width).toBeCloseTo(4.1);
    // the whole alcove is the platform, so the mouth's approach stands on it
    expect(kitchen.authored?.find(piece => piece.id === 'kitchen-run')?.elevation).toBeCloseTo(.1);
  });

  it('turn the depth a unit has beyond its envelope into service rooms along the entry wall', () => {
    const t = TEMPLATES.get('e6-apartment2')!;
    const plain = fitTemplate(t, target(15, t.envelope.max[1]), 'unit', idGen(1), () => true)!;
    const deep = fitTemplate(t, target(15, t.envelope.max[1] + 4), 'unit', idGen(1), () => true)!;
    expect(deep).not.toBeNull();
    const band = deep.rooms.filter(room => /\/band-\d+$/.test(room.template ?? ''));
    expect(band.length).toBeGreaterThan(0);
    for (const room of band) {
      expect(room.kind).toBe('storage');
      expect(room.rect.lv).toBeCloseTo(4, 6);
      expect(room.doors.length, room.template).toBe(1);
    }
    // the rooms behind the band keep the sizes they have in the unbanded fit
    for (const id of ['kitchen', 'bath', 'bed']) {
      const a = role(plain.rooms, 'e6-apartment2', id)!, b = role(deep.rooms, 'e6-apartment2', id)!;
      expect([b.rect.lu, b.rect.lv].map(v => +v.toFixed(2)), id).toEqual([a.rect.lu, a.rect.lv].map(v => +v.toFixed(2)));
    }
    // the pit sofa still stands in the pit
    const living = role(deep.rooms, 'e6-apartment2', 'living')!;
    expect(living.authored?.find(piece => piece.id === 'pit-west')?.elevation).toBe(-.4);
  });

  it('cut a strip for the reference home whose depth it has, not the first one listed', () => {
    const sizing = { area: [0, 0], width: [0, 0], depth: [0, 0], preferred: [26.45, 11.55], references: [
      { key: 'e1-apartment', width: [22, 26.45, 30], depth: [10, 11.55, 13] },
      { key: 'e6-apartment2', width: [13, 14.5, 17], depth: [9.4, 10.5, 12.5] },
    ] } as UnitSizing;
    expect(referenceFrontage(sizing, 10)).toBe(14.5);
    expect(referenceFrontage(sizing, 11.8)).toBe(26.45);
    // a strip shallower than every reference aims at the shallowest one
    expect(referenceFrontage(sizing, 7.5)).toBe(14.5);
  });

  it('refuse a unit its envelope cannot hold instead of stretching it', () => {
    expect(fitTemplate(TEMPLATES.get('e6-apartment2')!, target(20, 12), 'unit', idGen(1), () => true)).toBeNull();
    expect(fitTemplate(TEMPLATES.get('e1-apartment')!, target(17, 15), 'unit', idGen(1), () => true)).toBeNull();
    expect(fitTemplate(TEMPLATES.get('c7-room')!, target(9, 8.5), 'unit', idGen(1), () => true)).toBeNull();
  });
});

async function kitRequest(family: string, tier: InteriorRequest['building']['tier']): Promise<InteriorRequest> {
  const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = planAssembly({ buildingId: `reference-${family}`, family, seed: 'interior-proof', lot: { width: 40, depth: 40 }, floors: 5 });
  return { seed: 'interior-proof', building: { id: `reference-${family}`, type: 'residential', tier }, blueprint, materialTheme: 'cyberpunk' };
}

const towers = new Map<string, GeneratedInterior>();
beforeAll(async () => {
  towers.set('A', await generate(await kitRequest('mirror-frame', 'high_rich'), { models: new Set() }));
  towers.set('B', await generate(await kitRequest('balcony-grid', 'rich'), { models: new Set() }));
}, 300_000);

describe('reference homes in a generated tower', () => {
  const units = (result: GeneratedInterior) => Object.values(result.layouts).flatMap(layout => {
    const rooms = layout.floor.rooms;
    return [...new Set(rooms.filter(room => room.unit && room.template).map(room => room.unit!))]
      .map(unit => ({ layout, unit, rooms: rooms.filter(room => room.unit === unit), key: rooms.find(room => room.unit === unit)!.template!.split('/')[0]! }));
  });

  it('shows every kind A apartment style in the tower, each at its reference frontage', () => {
    const all = units(towers.get('A')!);
    const keys = new Set(all.map(item => item.key));
    expect(keys).toEqual(new Set(['e1-apartment', 'e6-apartment2']));
    for (const { rooms, key, unit } of all) {
      const t = TEMPLATES.get(key as never)!;
      const xs = rooms.flatMap(room => room.polygon.map(p => p[0])), zs = rooms.flatMap(room => room.polygon.map(p => p[1]));
      const frontage = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      const wide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      // the unit is cut to its reference: its frontage within the template's envelope
      expect([frontage, wide].some(side => side >= t.envelope.min[0] - .5 && side <= t.envelope.max[0] + .5), `${unit} ${key}`).toBe(true);
    }
    // a kitchen of its own in every e6, the kitchen zone of the great room in every e1
    for (const { rooms, key, unit } of all) {
      if (key === 'e6-apartment2') expect(rooms.some(room => room.template === 'e6-apartment2/kitchen' && room.kind === 'kitchen'), unit).toBe(true);
      if (key === 'e1-apartment') expect(rooms.some(room => room.kind === 'kitchen'), unit).toBe(false);
    }
  });

  it('builds the reference level changes, the b3 pit at its three risers over a bulkhead below', () => {
    const levels = (key: string) => [...towers.values()].flatMap(result => Object.values(result.layouts))
      .flatMap(layout => layout.floor.rooms.filter(room => room.template?.startsWith(`${key}/`)).flatMap(room => room.levels ?? []));
    expect(levels('e6-apartment2').some(zone => zone.delta < -.2)).toBe(true);
    expect(levels('e1-apartment').map(zone => zone.delta)).toContain(-.18);
    expect(levels('b3-apartment').map(zone => zone.delta)).toEqual(expect.arrayContaining([-.54, .15]));
    // the storey under a b3 pit hangs a bulkhead with its fascia
    const b = towers.get('B')!;
    expect(Object.values(b.layouts).some(layout => layout.placements.some(p => p.module?.startsWith('trim-') && p.scale[1] > 10))).toBe(true);
  });

  it('furnishes a templated home with its authored pieces, never a generic dining set, divider or office desk', () => {
    for (const result of towers.values()) for (const { layout, rooms, key, unit } of units(result)) {
      const t = TEMPLATES.get(key as never)!;
      const authored = new Set(t.fixtures.map(fixture => fixture.kind));
      const own = new Set(rooms.filter(room => room.template).map(room => room.id));
      const pieces = layout.floor.furniture.filter(piece => own.has(piece.room));
      for (const kind of ['dining_table', 'room_divider', 'office_chair'] as const)
        if (!authored.has(kind)) expect(pieces.filter(piece => piece.kind === kind).map(piece => piece.room), `${unit} ${kind}`).toEqual([]);
      // a foyer holds nothing but what its template put there
      for (const room of rooms.filter(room => room.role === 'foyer'))
        for (const piece of pieces.filter(piece => piece.room === room.id)) expect(authored.has(piece.kind), `${room.template} ${piece.kind}`).toBe(true);
    }
  });

  it('turns frontage no reference home takes into a residents lounge on the corridor', () => {
    const lounges = Object.values(towers.get('A')!.layouts).flatMap(layout => layout.floor.rooms.filter(room => /-amenity-\d+$/.test(room.id)));
    expect(lounges.length).toBeGreaterThan(0);
    for (const lounge of lounges) {
      expect(lounge.kind).toBe('lounge');
      expect(lounge.doors.length).toBeGreaterThan(0);
    }
  });
});
