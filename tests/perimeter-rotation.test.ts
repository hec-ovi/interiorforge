import { expect, it } from 'vitest';
import { generate, type Blueprint } from '../src/index.js';
import { polygonArea } from '../src/core/geom.js';
import { RigidFrame2D } from '../src/core/rigid-frame.js';

// Exterior honours the explicit building grid; Interior's core still snaps in
// its rotated UV frame. At this translation that creates a 15.280524 m rear strip
// and a 300.586 m² complete private end home after subtracting the core.
it('fully regenerates complete luxury homes at a translated 37-degree facade/grid phase', async () => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const frame = new RigidFrame2D(37, [19, -11]);
  const shell = await exterior({ buildingId: 'rotation-proof', seed: 'duplex-1702', theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [60, 0], [60, 40], [0, 40]].map(point => frame.toWorld(point as [number, number])),
      accessPoint: frame.toWorld([30, 0]), maxHeight: 28,
      buildingGrid: { origin: [19, -11], angle: 37 * Math.PI / 180, spacing: .5 } },
    building: { type: 'residential', tier: 'high_rich', floors: 5 },
    options: { architecture: 'balcony-grid', glb: 'named', roofArtifacts: 'off', facadeServices: 'off' } },
  { textures: { mode: 'keys' } });
  const blueprint: Blueprint = shell.blueprint;
  // Single storeys: as a kind B building its derived crown loft would pair the top two.
  const assignments = blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' as const : 'apartment' as const }));
  const result = await generate({ seed: 'duplex-1702', building: { id: 'rotation-proof', type: 'residential', tier: 'high_rich' },
    blueprint, assignments, materialTheme: 'cyberpunk' });
  const area = (room: { polygon: [number, number][]; holes?: [number, number][][] }) => Math.abs(polygonArea(room.polygon))
    - (room.holes ?? []).reduce((sum, ring) => sum + Math.abs(polygonArea(ring)), 0);
  for (const name of ['middle', 'crown'] as const) {
    const floor = result.layouts[name]!.floor;
    const units = [...new Set(floor.rooms.flatMap(room => room.unit ? [room.unit] : []))];
    expect(units.length).toBeGreaterThanOrEqual(5);
    const plateArea = Math.abs(polygonArea(blueprint.floors.find(item => item.index === floor.floor)!.roomEnvelope!.corners));
    expect(floor.rooms.filter(room => room.unit).reduce((sum, room) => sum + area(room), 0) / plateArea).toBeGreaterThan(.75);
    for (const unit of units) {
      const rooms = floor.rooms.filter(room => room.unit === unit);
      expect(rooms.reduce((sum, room) => sum + area(room), 0)).toBeLessThan(310);
      expect(rooms.filter(room => room.kind === 'bathroom')).toHaveLength(2);
      for (const room of rooms.filter(room => room.kind === 'bathroom'))
        expect(floor.furniture.filter(piece => piece.room === room.id && ['sink', 'shower', 'toilet'].includes(piece.kind))).toHaveLength(3);
      for (const [kind, required] of [['living', ['counter', 'display_screen', 'sofa', 'low_table']],
        ['bedroom', ['bed_double']], ['kitchen', ['kitchen_block', 'fridge']]] as const) {
        const room = rooms.find(item => item.kind === kind)!;
        expect(room, `${unit}/${kind}`).toBeDefined();
        for (const piece of required) expect(floor.furniture.some(item => item.room === room.id && item.kind === piece), `${unit}/${piece}`).toBe(true);
      }
    }
    const entrances = result.building.floors.find(ref => ref.index === floor.floor)!.apartmentEntrances!;
    expect(entrances).toHaveLength(units.length);
    expect(entrances.every(entry => entry.width >= 1.6)).toBe(true);
  }
}, 180_000);
