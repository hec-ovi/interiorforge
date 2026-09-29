import { expect, it } from 'vitest';
import { generate, type InteriorRequest } from '../src/index.js';

/** A room whose reference ceiling hangs below the storey's takes its lights under that
 *  ceiling, once: the ceiling system seats the planned records under its own lowered
 *  ceiling and nothing lowers them again. */
it('hangs the planned lights of a dropped ceiling just under it, never a second drop lower', { timeout: 300000 }, async () => {
  const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = planAssembly({ buildingId: 'drop-lights', family: 'balcony-grid', seed: 'interior-proof', lot: { width: 40, depth: 40 }, floors: 3 });
  const request: InteriorRequest = { seed: 'interior-proof', building: { id: 'drop-lights', type: 'residential', tier: 'rich' }, blueprint, materialTheme: 'cyberpunk' };
  const result = await generate(request, { models: new Set() });
  let checked = 0;
  for (const layout of Object.values(result.layouts)) {
    const ceiling = layout.floor.ceilingElevation;
    for (const room of layout.floor.rooms.filter(item => (item.ceilingDrop ?? 0) > .3)) {
      for (const light of layout.floor.lights.filter(item => item.room === room.id && !item.furniture)) {
        expect(light.position[1], `${layout.id} ${room.id} ${light.id}`).toBeGreaterThan(ceiling - room.ceilingDrop! - .35);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
});
