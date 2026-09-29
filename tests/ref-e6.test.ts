import { describe, expect, it } from 'vitest';
import type { Furniture, Room } from '../src/core/types.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { idGen } from '../src/layout/rooms.js';
import { uvRectCorners } from '../src/layout/uv.js';
import { fitTemplate } from '../src/layout/templates/fit.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import type { TemplateTarget } from '../src/layout/templates/schema.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { CEILINGS, FLOORS, PANELS, STYLES } from '../src/styles/reference/registry.js';

/** The tower's other three styles: the second suite (e6) furnishes as the Sandra joinery
 *  family on tatami under timber-membered ceilings, the public floor (e2) and the ground
 *  lobby (e5) finish their common rooms and lift surrounds in their own systems. */

const base = { family: 'luxury' as const, field: 'wall-field-meridian-ivory', floor: 'floor-slab-meridian-stone', ceiling: 'ceiling-field-light',
  cove: 'ceiling-cove-timber', spot: 'ceiling-spot' };
const target = (lu: number, lv: number): TemplateTarget => {
  const rect = { u: 0, v: 0, lu, lv }, r = { u: -4, v: -3, lu: lu + 8, lv: 3 };
  const corridor: PlanRoom = { id: 'corridor', kind: 'corridor', rect: r, polygon: uvRectCorners(r), doors: [] };
  return { rect, polygon: uvRectCorners(rect), entryEdge: 'v0', publicRoom: corridor, facadeEdges: ['v1'], seatLegal: () => true, gridOrigin: [0, 0] };
};

describe('the E6 suite', () => {
  const e6 = STYLES.get('e6')!;
  const catalog = new Set(moduleRecipes().map(recipe => recipe.id));

  it('lays tatami under timber members, timber bays on the walls, plaster in the bedroom and marble in the bath', () => {
    const living = e6.finish('living', 'apartment', base), bedroom = e6.finish('bedroom', 'apartment', base), bath = e6.finish('bathroom', 'apartment', base);
    expect(FLOORS.get(living.floor)?.tile.size).toEqual([1.8, .9]);
    expect(CEILINGS.get(living.ceiling)?.grid.joint).toBeCloseTo(.12, 3);
    expect(PANELS.has(living.field)).toBe(true);
    expect(bedroom.field).toBe('wall-field-sandra-plaster');
    expect(bath.floor).toBe('floor-slab-marble');
    for (const id of [living.field, living.floor, living.ceiling, bedroom.field, bath.field, bath.floor]) expect(catalog.has(id), id).toBe(true);
  });

  it('stands its beds, sofas, desks, screens and cases as the Sandra joinery', () => {
    const room = { id: 'r', kind: 'bedroom' } as Room;
    const fit = (kind: Furniture['kind']) => e6.fit!({ id: 'f', kind, room: 'r', position: [0, 0], rotationDeg: 0, size: [1, 1, 1] } as Furniture, room);
    expect(fit('bed_double')).toBe('fit-sandra-bed');
    expect(fit('sofa')).toBe('fit-sandra-sofa');
    expect(fit('room_divider')).toBe('fit-sandra-lattice-screen');
    expect(fit('toilet')).toBeNull();
    for (const kind of ['bed_double', 'sofa', 'desk', 'shelf', 'room_divider'] as const) expect(catalog.has(fit(kind)!), kind).toBe(true);
  });

  it('fits its template exactly on its reference envelope with the bed it needs', () => {
    const t = TEMPLATES.get('e6-apartment2')!;
    const fit = fitTemplate(t, target(t.envelope.width, t.envelope.depth), 'unit', idGen(1), () => true)!;
    expect(fit).not.toBeNull();
    expect(fit.exact).toBe(true);
    const bed = fit.rooms.find(room => room.template === 'e6-apartment2/bed')!;
    expect(bed.authored?.some(piece => piece.kind === 'bed_double' && piece.required)).toBe(true);
  });
});

describe('the E2 floor and the E5 lobby', () => {
  const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));

  it('finish the lift lobby, corridors and lobby rooms in their systems with bronze lift surrounds', () => {
    for (const sid of ['e2', 'e5'] as const) {
      const style = STYLES.get(sid)!;
      for (const room of ['corridor', 'elevator_lobby', 'reception'] as const) {
        const finish = style.finish(room, sid === 'e2' ? 'apartment' : 'lobby', base);
        expect(FLOORS.has(finish.floor), `${sid} ${room}`).toBe(true);
        expect(CEILINGS.has(finish.ceiling), `${sid} ${room}`).toBe(true);
        expect(catalog.has(finish.field)).toBe(true);
      }
      expect(style.lift).toEqual({ jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' });
    }
    // the surround keeps the bounds of the plain lift landing members
    for (const member of ['jamb', 'header']) {
      const plain = catalog.get(`lift-landing-${member}`)!, e2 = catalog.get(`lift-landing-${member}-e2`)!;
      expect(e2.size).toEqual(plain.size);
      expect(e2.origin).toEqual(plain.origin);
    }
    // a private room of the public styles keeps its family finish
    expect(STYLES.get('e2')!.finish('bedroom', 'apartment', base).field).toBe(base.field);
    // the lobby floor shows bronze in its joints
    expect(catalog.get(FLOORS.get('floor-slab-e5')!.support)!.mesh.materials()).toContain('cyberpunk/interior-bronze/rich#plain');
  });
});
