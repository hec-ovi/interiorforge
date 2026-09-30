import { describe, expect, it } from 'vitest';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import type { UvFloorData } from '../src/layout/plan-floor.js';
import { FINISH } from '../src/modules/finishes.js';
import { TABLE_SIZES } from '../src/modules/recipes/furniture.js';
import { PlacementBuilder, placementRecipe } from '../src/placements/builder.js';
import { nearestSize, props } from '../src/placements/props.js';

/** Furniture with fixed-section legs, panels and frames is authored at a few sizes; a record
 *  stands the nearest one instead of stretching one canonical piece per axis. */
describe('authored size variants', () => {
  it('picks the authored size that needs the least scaling, and leaves other pieces alone', () => {
    expect(nearestSize({ module: 'fit-table', size: [.9, .9, .75] }, [.9, .9, .75]).module).toBe('fit-table');
    expect(nearestSize({ module: 'fit-table', size: [.9, .9, .75] }, [1.6, .75, .75]).module).toBe('fit-table-140');
    expect(nearestSize({ module: 'fit-table', size: [.9, .9, .75] }, [2.8, 1.2, .75]).module).toBe('fit-table-280');
    expect(nearestSize({ module: 'fit-low-table-luxury', size: [1.6, .9, .4] }, [.7, .7, .4]).module).toBe('fit-low-table-luxury-80');
    expect(nearestSize({ module: 'fit-bar-counter', size: [3, .65, 1.1] }, [2, .7, .9]).module).toBe('fit-bar-counter-200');
    expect(nearestSize({ module: 'wall-screen', size: [1.2, .08, .7] }, [2.15, .08, 1.08]).module).toBe('wall-screen-200');
    expect(nearestSize({ module: 'fit-sofa', size: [1.8, .85, .8] }, [2.6, .9, .8]).module).toBe('fit-sofa');
  });

  it('keeps every table leg 50 mm square, 85 mm in from its corners, whatever the table size', () => {
    for (const [id, w, d] of TABLE_SIZES) {
      const recipe = placementRecipe(id)!;
      expect(recipe.size[0]).toBeCloseTo(w, 3);
      expect(recipe.size[2]).toBeCloseTo(d, 3);
      const p = recipe.mesh.getGroup(FINISH.bronze)!.positions;
      let inner = Infinity, outer = 0;
      for (let i = 0; i < p.length; i += 3) if (p[i + 1]! < .6) {
        inner = Math.min(inner, Math.abs(p[i]!));
        outer = Math.max(outer, Math.abs(p[i]!));
      }
      expect(outer).toBeCloseTo(w / 2 - .06, 3);
      expect(outer - inner).toBeCloseTo(.05, 3);
    }
  });

  it('stands a long dining table and a small side table at nearly their authored scale', () => {
    const furniture: Furniture[] = [
      { id: 'dining', kind: 'dining_table', room: 'room', position: [0, 0], rotationDeg: 90, size: [2.8, 1.2, .75] },
      { id: 'side', kind: 'low_table', room: 'room', position: [3, 0], rotationDeg: 0, size: [.7, .7, .4] },
      { id: 'screen', kind: 'display_screen', room: 'room', position: [0, 3], rotationDeg: 0, size: [2.15, .08, 1.08], elevation: 1.2 },
    ];
    const floor = { kind: 'office', elevation: 0, ceilingElevation: 3, furniture: structuredClone(furniture), lights: [] } as unknown as FloorInterior;
    const uv = { outline: [], rooms: [{ id: 'room', kind: 'living', rect: { u: -5, v: -5, lu: 10, lv: 10 }, doors: [] }], sealed: [], carpets: [],
      furniture: furniture.map(f => ({ ...f, at: f.position })) } as UvFloorData;
    const builder = new PlacementBuilder();
    props(builder, floor, uv, 'luxury', { present: new Set(), missing: new Set() });
    const stood = new Map(builder.placements.map(p => [p.id, p]));
    expect(stood.get('dining')!.module).toBe('fit-table-280');
    expect(stood.get('side')!.module).toBe('fit-low-table-luxury-80');
    expect(stood.get('screen')!.module).toBe('wall-screen-200');
    for (const id of ['dining', 'side', 'screen']) {
      const scale = stood.get(id)!.scale;
      for (const axis of scale) expect(Math.abs(Math.log(axis))).toBeLessThan(Math.log(1.15));
    }
  });
});
