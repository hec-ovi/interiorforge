import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { moduleRecipes } from '../../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../../modules/index.js';
import { loadTheme } from '../../../materials/load.js';
import { textureDocument } from '../../../materials/index.js';
import { createDocument, writeGlb } from '../../../glb/io.js';
import { PlacementBuilder } from '../../../placements/builder.js';
import { dressDamagedRooms } from '../dressing.js';
import type { FloorInterior } from '../../../core/types.js';

const out = fileURLToPath(new URL('../../../../out/proof/damaged-03/', import.meta.url));
await mkdir(out, { recursive: true });
const theme = loadTheme('cyberpunk')!.library.themeIndex;
const scenes: Record<string, PlacementBuilder> = {};
for (const profile of ['public', 'lodging']) {
  const b = new PlacementBuilder(), depth = profile === 'public' ? 3 : 4;
  b.module(profile === 'public' ? 'wall-field-damaged-public' : 'wall-field-damaged-lodging', 'room', [0, 0, -depth / 2], [12, 6, 1]);
  b.module('floor-slab-damaged', 'room', [0, 0, 0], [12, 1, depth * 2]);
  b.module('ceiling-field-damaged', 'room', [0, 3, 0], [12, 1, depth * 2]);
  const floor = { rooms: [{ id: 'room', kind: profile === 'public' ? 'corridor' : 'bedroom' }], furniture: [] } as unknown as FloorInterior;
  dressDamagedRooms(b, floor);
  if (profile === 'lodging') {
    b.module('fit-damaged-bed', 'room', [-.8, 0, -.8]);
    b.module('fit-damaged-wardrobe', 'room', [1.8, 0, -1.53]);
  }
  scenes[profile] = b;
  await writeFile(join(out, `${profile}.json`), JSON.stringify(b.placements, null, 2) + '\n');
}
const wanted = new Set(Object.values(scenes).flatMap(scene => scene.placements.map(p => p.module)));
const report = [];
for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme)).filter(recipe => wanted.has(recipe.id))) {
  const doc = createDocument(recipe.mesh);
  await textureDocument(doc, 'cyberpunk', { mode: 'embed' });
  const glb = await writeGlb(doc);
  await writeFile(join(out, `${recipe.id}.glb`), glb);
  report.push({ id: recipe.id, bytes: glb.byteLength, triangles: recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0) });
}
await writeFile(join(out, 'services-models.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, models: report.length, placements: Object.fromEntries(Object.entries(scenes).map(([id, b]) => [id, b.placements.length])) }));
