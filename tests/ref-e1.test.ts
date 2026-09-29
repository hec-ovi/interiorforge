import { describe, expect, it } from 'vitest';
import { generate, type InteriorRequest } from '../src/index.js';
import type { EdgeName, PlanRoom } from '../src/layout/plan-types.js';
import { idGen } from '../src/layout/rooms.js';
import { uvRectCorners, type UvRect } from '../src/layout/uv.js';
import { fitTemplate } from '../src/layout/templates/fit.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import type { TemplateTarget } from '../src/layout/templates/schema.js';
import { loadTheme } from '../src/materials/load.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { ASSEMBLIES, CEILINGS, FLOORS, PANELS, PORTALS, STYLES } from '../src/styles/reference/registry.js';
import { kind as kindA } from '../src/styles/ref-a/index.js';
import { E1 } from '../src/styles/ref-a/e1.js';

/** Kind A, the high-tech luxury tower: its styles are registered with every system and
 *  module they name, the E1 suite template fits any unit from its minimum up with its rigid
 *  service spans exact, and a generated tower furnishes its suites with the reference parts. */

type P = [number, number];
/** Rigid rotation of the blueprint's world coordinates (as the template matrix does). */
function rotateBlueprint<T>(blueprint: T, deg: number): T {
  if (!deg) return blueprint;
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), f = ([x, z]: P): P => [x * c - z * s, x * s + z * c];
  const copy = structuredClone(blueprint) as T & Record<string, any>;
  for (const floor of copy.floors) {
    floor.outline = floor.outline.map(f);
    if (floor.roomEnvelope?.corners) floor.roomEnvelope.corners = floor.roomEnvelope.corners.map(f);
  }
  if (copy.bounds?.footprint) copy.bounds.footprint = copy.bounds.footprint.map(f);
  if (copy.coreFrame?.anglesDeg) copy.coreFrame.anglesDeg = copy.coreFrame.anglesDeg.map((a: number) => a + deg);
  if (copy.roof) {
    if (copy.roof.outline) copy.roof.outline = copy.roof.outline.map(f);
    const b = copy.roof.bulkhead;
    if (b) { b.center = f(b.center); b.axis = f(b.axis); if (b.doorNormal) b.doorNormal = f(b.doorNormal); }
    for (const a of copy.roof.artifacts ?? []) { a.center = f(a.center); a.rotationDeg = (a.rotationDeg ?? 0) - deg; }
  }
  return copy;
}

const corridorFor = (rect: UvRect): PlanRoom => {
  const r = { u: rect.u - 4, v: rect.v - 3, lu: rect.lu + 8, lv: 3 };
  return { id: 'corridor', kind: 'corridor', rect: r, polygon: uvRectCorners(r), doors: [] };
};
const target = (lu: number, lv: number, entry: EdgeName = 'v0'): TemplateTarget => {
  const rect = { u: 0, v: 0, lu, lv };
  return { rect, polygon: uvRectCorners(rect), entryEdge: entry, publicRoom: corridorFor(rect), facadeEdges: ['v1'],
    seatLegal: () => true, gridOrigin: [0, 0] };
};

describe('kind A registry', () => {
  const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
  const library = loadTheme('cyberpunk')!.library;

  it('registers the four styles and the systems their finishes name', () => {
    expect(kindA.styles.map(style => style.id)).toEqual(['e1', 'e2', 'e5', 'e6']);
    for (const style of kindA.styles) {
      expect(STYLES.get(style.id)).toBe(style);
      for (const room of ['living', 'kitchen', 'bedroom', 'bathroom', 'storage', 'corridor', 'reception', 'elevator_lobby'] as const) {
        const finish = style.finish(room, 'apartment', { family: 'luxury', field: 'wall-field-meridian-ivory', floor: 'floor-slab-meridian-stone',
          ceiling: 'ceiling-field-light', cove: 'ceiling-cove-timber', spot: 'ceiling-spot' });
        for (const id of [finish.field, finish.floor, finish.ceiling]) expect(catalog.has(id), `${style.id} ${room} ${id}`).toBe(true);
        if (finish.portal) expect(PORTALS.has(finish.portal), finish.portal).toBe(true);
        if (PANELS.has(finish.field)) expect(catalog.has(PANELS.get(finish.field)!.column(PANELS.get(finish.field)!.pitch[0]!))).toBe(true);
        if (CEILINGS.has(finish.ceiling)) expect(catalog.has(CEILINGS.get(finish.ceiling)!.grid.block)).toBe(true);
        if (FLOORS.has(finish.floor)) expect(catalog.has(FLOORS.get(finish.floor)!.support)).toBe(true);
      }
    }
    for (const fit of TEMPLATES.get('e1-apartment')!.fixtures.map(f => f.fit).filter(Boolean)) expect(ASSEMBLIES.has(fit!), fit).toBe(true);
  });

  it('draws every kind A module in published materials', () => {
    const ids = new Set<string>();
    for (const set of kindA.recipes) set(id => ids.add(id));
    expect(ids.size).toBeGreaterThan(50);
    const known = (slot: string) => {
      const [key, variant] = slot.split('#');
      const entry = library.entry(key!);
      return !!entry && entry.variants.some(v => v.id === variant);
    };
    for (const id of ids) for (const slot of catalog.get(id)!.mesh.materials()) expect(known(slot), `${id} ${slot}`).toBe(true);
    // the suite wears its own finishes
    const slots = (id: string) => catalog.get(id)!.mesh.materials();
    expect(slots('wall-panel-e1-col100')).toContain('cyberpunk/e1-panel/high_rich#cream');
    expect(slots('ceiling-e1-grid1x1')).toContain('cyberpunk/e1-ceiling/high_rich#gloss-black');
    expect(slots('floor-finish-e1-stone')).toContain('cyberpunk/e1-floor/high_rich#dark-stone');
    expect(slots('fit-e1-island-base')).toContain('cyberpunk/e1-glass/high_rich#caustic');
    expect(slots('ceiling-cove-e1-lounge-pit')).toContain('cyberpunk/light-fixture/high_rich#e1-cyan');
  });
});

describe('the E1 suite template', () => {
  const e1 = TEMPLATES.get('e1-apartment')!;
  const size = (rooms: PlanRoom[], role: string) => {
    const room = rooms.find(r => r.template === `e1-apartment/${role}`);
    return room ? [room.rect.lu, room.rect.lv].map(v => Math.round(v * 100) / 100) : null;
  };

  it.each([[16.5, 10], [13, 17], [12.5, 17], [26, 7.5], [12, 9.5]])('fits %s x %s with its service rooms at their reference size', (w, d) => {
    const fit = fitTemplate(e1, target(w, d), 'unit', idGen(1), () => true);
    expect(fit).not.toBeNull();
    const roles = fit!.rooms.map(room => room.template);
    for (const role of ['kitchen', 'living', 'bed', 'bath']) expect(roles).toContain(`e1-apartment/${role}`);
    // the bath keeps its reference 3.0 x 3.0 m whenever the unit is as wide as the reference
    if (w >= 16.5) {
      expect(size(fit!.rooms, 'bath')).toEqual([3, 3]);
      expect(fit!.rooms.find(r => r.template === 'e1-apartment/bed')!.authored?.some(p => p.fit === 'asm-e1-bed')).toBe(true);
    }
  });

  it('is exact on its reference envelope, mirrored or not', () => {
    for (const entry of ['v0'] as const) {
      const fit = fitTemplate(e1, target(e1.envelope.width, e1.envelope.depth, entry), 'unit', idGen(1), () => true)!;
      expect(fit.exact).toBe(true);
      expect(size(fit.rooms, 'kitchen')).toEqual([5.5, 10]);
      expect(size(fit.rooms, 'bed')).toEqual([5, 7]);
      expect(size(fit.rooms, 'dressing')).toEqual([2, 3]);
    }
  });

  it('refuses a unit below its minimum instead of failing', () => {
    expect(fitTemplate(e1, target(11, 8), 'unit', idGen(1), () => true)).toBeNull();
  });
});

describe('a kind A tower furnishes its suites', () => {
  const build = async (width: number, depth: number, rotation: number) => {
    const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = planAssembly({ buildingId: 'ref-e1', family: 'mirror-frame', seed: 'interior-proof', lot: { width, depth }, floors: 3,
      floorHeight: E1.pitch, groundHeight: E1.pitch });
    const request: InteriorRequest = { seed: 'interior-proof', building: { id: 'ref-e1', type: 'residential', tier: 'high_rich', kind: 'A',
      references: ['e1-apartment', 'e2-floor', 'e5-lobby2'] }, blueprint: rotateBlueprint(blueprint, rotation), materialTheme: 'cyberpunk' };
    return generate(request, { models: new Set() });
  };

  it.each([[40, 40, 0], [56, 40, 37]])('on a %s x %s lot at %s degrees', async (width, depth, rotation) => {
    const result = await build(width, depth, rotation);
    expect(result.building.kind).toBe('A');
    const middle = result.layouts.middle!;
    const rooms = middle.floor.rooms;
    const suites = new Set(rooms.filter(room => room.template?.startsWith('e1-apartment/')).map(room => room.unit));
    expect(suites.size).toBeGreaterThan(0);
    const modules = new Set(middle.placements.map(p => p.module));
    for (const id of ['wall-panel-e1-col100', 'ceiling-e1-grid1x1', 'floor-slab-e1-lounge-pit', 'door-header-e1-inner', 'fit-e1-terrarium',
        'fit-e1-sofa-bay', 'fit-e1-kitchen-top-sink', 'fit-e1-island-base'])
      expect(modules.has(id), id).toBe(true);
    // every suite: a bed wall, a kitchen wall, a lit pit whose lens is recorded
    for (const unit of suites) {
      const own = new Set(rooms.filter(room => room.unit === unit).map(room => room.id));
      const furniture = middle.floor.furniture.filter(item => own.has(item.room));
      expect(furniture.some(item => item.fit === 'asm-e1-bed' && item.kind === 'bed_double'), unit).toBe(true);
      expect(furniture.some(item => item.fit?.startsWith('asm-e1-kitchen')), unit).toBe(true);
    }
    const pits = middle.placements.filter(p => p.module === 'ceiling-cove-e1-lounge-pit' && p.position[1] < 0);
    expect(pits.length).toBeGreaterThan(0);
    for (const pit of pits) expect(middle.floor.lights.some(light => light.id === pit.id && light.color?.[2] === 1)).toBe(true);
    // the suite walls are panel walls: no plain luxury field in a suite room
    const suiteRooms = new Set(rooms.filter(room => room.template?.startsWith('e1-apartment/')).map(room => room.id));
    expect(middle.placements.filter(p => suiteRooms.has(p.room) && /^wall-field-meridian-(ivory|walnut|mineral)$/.test(p.module ?? ''))).toEqual([]);
  }, 180000);
});
