import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { generate } from '../src/index.js';
import type { Blueprint, FloorPlacement, Room } from '../src/index.js';
import { polygonArea } from '../src/core/geom.js';

const area = (room: Room) => Math.abs(polygonArea(room.polygon))
  - (room.holes ?? []).reduce((sum, ring) => sum + Math.abs(polygonArea(ring)), 0);

/** One storey per home floor: a high rich home on balcony-grid is a kind B building, whose
 *  derived crown loft would pair its top storeys; these plates certify the perimeter homes. */
const storeys = (blueprint: Blueprint) => blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' as const : 'apartment' as const }));

function certify(layout: FloorPlacement, blueprint: Blueprint): number[] {
  const floor = layout.floor, shell = blueprint.floors.find(item => item.index === floor.floor)!;
  const plateArea = Math.abs(polygonArea(shell.roomEnvelope!.corners));
  const ids = [...new Set(floor.rooms.map(room => room.unit).filter((unit): unit is string => !!unit))];
  const areas = ids.map(unit => floor.rooms.filter(room => room.unit === unit).reduce((sum, room) => sum + area(room), 0));
  expect(areas.reduce((sum, n) => sum + n, 0) / plateArea).toBeGreaterThanOrEqual(.75);
  expect(floor.rooms.filter(room => !room.unit).reduce((sum, room) => sum + area(room), 0) / plateArea).toBeLessThan(.25);
  expect(floor.rooms.filter(room => room.kind === 'lounge')).toHaveLength(0);
  for (const unit of ids) {
    const members = floor.rooms.filter(room => room.unit === unit), main = members.find(room => room.kind === 'living')!;
    expect(main, unit).toBeDefined();
    const livingPieces = floor.furniture.filter(piece => piece.room === main.id);
    const mealRooms = new Set(members.filter(room => ['living', 'kitchen'].includes(room.kind)).map(room => room.id));
    const mealPieces = floor.furniture.filter(piece => mealRooms.has(piece.room));
    const meal = mealPieces.find(piece => piece.kind === 'dining_table');
    expect(meal, `${unit} needs a seated eating place`).toBeDefined();
    expect(meal!.size[0]).toBeGreaterThanOrEqual(1.4);
    const seats = mealPieces.filter(piece => piece.room === meal!.room && piece.kind === 'chair'
      && Math.hypot(piece.position[0] - meal!.position[0], piece.position[1] - meal!.position[1]) < 1.9);
    expect(seats.length, `${unit} needs full chairs at its table`).toBeGreaterThanOrEqual(2);
    expect(seats.every(piece => piece.size[0] >= .65 && piece.size[1] >= .75)).toBe(true);
    for (const kind of ['counter', 'display_screen', 'sofa', 'low_table'])
      expect(livingPieces.some(piece => piece.kind === kind), `${unit} complete salon: ${kind}`).toBe(true);
    const entries = members.flatMap(room => room.doors.filter(door => {
      const target = floor.rooms.find(other => other.id === door.to);
      return target && !target.unit && ['corridor', 'elevator_lobby', 'concourse', 'lounge'].includes(target.kind);
    }));
    expect(entries, `${unit} needs one real public entrance`).toHaveLength(1);
    expect(entries[0]!.width).toBeGreaterThanOrEqual(1.6);
    const entrance = entries[0]!;
    if (entrance.kind === 'openFront') throw new Error(`${unit} needs a fitted private entrance`);
    expect(entrance.leaves).toBe(2);
    expect(entries[0]!.clearDepth).toBe(0);
    for (const room of members.filter(room => room !== main)) {
      expect(room.doors.length, `${unit}/${room.kind} has direct living access`).toBeGreaterThan(0);
      expect(room.doors.every(door => door.to === main.id), `${unit}/${room.kind} is not a through-route`).toBe(true);
      const allConnections = floor.rooms.flatMap(owner => owner.doors.filter(door => owner.id === room.id || door.to === room.id));
      expect(allConnections, `${unit}/${room.kind} must not gain a repair through-route`).toHaveLength(1);
      expect(allConnections[0]!.width).toBeGreaterThanOrEqual(1.2);
    }
    const bedrooms = members.filter(room => room.kind === 'bedroom');
    expect(bedrooms.length, unit).toBeGreaterThan(0);
    for (const room of bedrooms) {
      expect(area(room)).toBeGreaterThanOrEqual(25);
      const beds = floor.furniture.filter(piece => piece.room === room.id && piece.kind === 'bed_double');
      expect(beds, `${unit} full bed`).toHaveLength(1);
      expect(beds[0]!.size.slice(0, 2)).toEqual([2, 2.3]);
    }
    const bathrooms = members.filter(room => room.kind === 'bathroom');
    expect(bathrooms, unit).toHaveLength(2);
    for (const room of bathrooms) expect(floor.furniture.filter(piece => piece.room === room.id
      && ['shower', 'sink', 'toilet'].includes(piece.kind)).map(piece => piece.kind).sort())
      .toEqual(['shower', 'sink', 'toilet']);
    const kitchen = members.find(room => room.kind === 'kitchen')!;
    expect(kitchen).toBeDefined();
    const kitchenPieces = floor.furniture.filter(piece => piece.room === kitchen.id).map(piece => piece.kind);
    expect(kitchenPieces).toContain('kitchen_block'); expect(kitchenPieces).toContain('fridge');
    for (const room of members.filter(room => room.kind === 'storage')) {
      expect(floor.furniture.some(piece => piece.room === room.id && piece.kind === 'shelf'), `${unit} usable storage`).toBe(true);
    }
    for (const room of members.filter(room => room.kind === 'office_private')) {
      const pieces = floor.furniture.filter(piece => piece.room === room.id).map(piece => piece.kind);
      expect(pieces, `${unit} study`).toContain('desk'); expect(pieces, `${unit} study chair`).toContain('office_chair');
    }
  }
  for (const value of areas) { expect(value).toBeGreaterThanOrEqual(135); expect(value).toBeLessThanOrEqual(300); }
  return areas;
}

it('fills the EXACT published review05 upper plate with four complete homes instead of a 689m² shared lounge', async () => {
  const blueprint: Blueprint = JSON.parse(readFileSync(new URL('./kit-plans/balcony-grid-review-05.blueprint.json', import.meta.url), 'utf8'));
  const result = await generate({ seed: 'luxury-reference-review', building: { id: 'p0', type: 'residential', tier: 'high_rich' },
    blueprint, assignments: storeys(blueprint), materialTheme: 'cyberpunk' });
  for (const name of ['middle', 'crown'] as const) {
    const areas = certify(result.layouts[name]!, blueprint);
    expect(areas).toHaveLength(4);
    areas.forEach((value, index) => expect(value).toBeCloseTo([195, 221, 208.25, 182.85][index]!, 2));
  }
  for (const ref of result.building.floors.filter(ref => ref.index > 0 && ref.index < 6)) {
    expect(ref.apartmentEntrances).toHaveLength(4);
    expect(ref.apartmentEntrances!.map(entry => entry.number)).toEqual([1, 2, 3, 4].map(slot => `${ref.index}0${slot}`));
  }
}, 120_000);

it('splits additional legal bays on a 60m set while preserving coverage and complete apartment programs', async () => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await exterior({ buildingId: 'wide', seed: 'luxury-reference-review',
    parcel: { footprint: [[81.5, 34], [141.5, 34], [141.5, 74], [81.5, 74]], accessPoint: [111.5, 34], maxHeight: 31.5,
      buildingGrid: { origin: [81.5, 34], angle: 0, spacing: .5 } },
    building: { type: 'residential', tier: 'high_rich', floors: 6 }, theme: 'cyberpunk',
    options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
  const result = await generate({ seed: 'luxury-reference-review', building: { id: 'wide', type: 'residential', tier: 'high_rich' },
    blueprint, assignments: storeys(blueprint), materialTheme: 'cyberpunk' });
  for (const name of ['middle', 'crown'] as const) {
    const areas = certify(result.layouts[name]!, blueprint);
    expect(areas).toHaveLength(5);
    areas.forEach((value, index) => expect(value).toBeCloseTo([202.5, 229.5, 229.5, 253, 287.85][index]!, 2));
    expect(areas.reduce((sum, value) => sum + value, 0) / areas.length).toBeLessThan(270);
    expect(result.building.floors.find(ref => ref.index === result.layouts[name]!.sourceFloor)!.apartmentEntrances).toHaveLength(areas.length);
  }
}, 120_000);
