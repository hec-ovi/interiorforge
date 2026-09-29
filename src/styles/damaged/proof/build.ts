import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { moduleRecipes } from '../../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../../modules/index.js';
import { loadTheme } from '../../../materials/load.js';
import { textureDocument } from '../../../materials/index.js';
import { createDocument, writeGlb } from '../../../glb/io.js';

const out = fileURLToPath(new URL('../../../../out/proof/damaged-02/', import.meta.url));
await mkdir(out, { recursive: true });
const theme = loadTheme('cyberpunk')!.library.themeIndex;
const wanted = new Set(['fit-damaged-sofa', 'fit-damaged-chair', 'fit-damaged-office-chair', 'fit-damaged-bed',
  'fit-damaged-bed-single', 'fit-damaged-wardrobe', 'fit-damaged-caretaker-desk', 'fit-damaged-mail-bank', 'fit-damaged-storage-wall', 'fit-damaged-kitchen', 'fit-damaged-fridge', 'fit-shower-damaged',
  'fit-basin-damaged', 'fit-toilet', 'apartment-leaf-damaged', 'apartment-numberplate-damaged']);
const report = [];
for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme)).filter(recipe => wanted.has(recipe.id))) {
  const doc = createDocument(recipe.mesh);
  await textureDocument(doc, 'cyberpunk', { mode: 'embed' });
  const glb = await writeGlb(doc);
  await writeFile(join(out, `${recipe.id}.glb`), glb);
  report.push({ id: recipe.id, size: recipe.size, origin: recipe.origin,
    triangles: recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0),
    materials: recipe.mesh.materials(), bytes: glb.byteLength });
}
await writeFile(join(out, 'models.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, models: report.map(({ id, triangles, bytes }) => ({ id, triangles, bytes })) }));
