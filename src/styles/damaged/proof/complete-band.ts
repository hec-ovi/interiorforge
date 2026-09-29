import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generate, writePlacements } from '../../../index.js';
import type { InteriorRequest } from '../../../core/types.js';
const { generate: exterior } = await import(new URL('../../../../../exterior/src/index.ts', import.meta.url).href);
const root = process.env.DAMAGED_PAIRED_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/paired/', import.meta.url));
const request = JSON.parse(await readFile(join(root, 'residential-megablock-poor-40/exterior.request.json'), 'utf8'));
request.buildingId = 'residential-megablock-poor-40-full-band';
request.building.floors = 5;
request.building.floorKinds = ['lobby', 'apartment', 'apartment', 'apartment', 'apartment'];
const out = join(root, request.buildingId); await mkdir(out, { recursive: true });
const shell = await exterior(request, { textures: { mode: 'keys' } });
const input: InteriorRequest = { seed: request.seed, building: { id: request.buildingId, type: 'residential', tier: 'poor' },
  shellGlb: 'shell.glb', blueprint: shell.blueprint, materialTheme: 'cyberpunk' };
const built = await generate(input, { models: new Set() });
await writeFile(join(out, 'exterior.request.json'), JSON.stringify(request, null, 2) + '\n');
await writeFile(join(out, 'blueprint.json'), JSON.stringify(shell.blueprint, null, 2) + '\n');
await writeFile(join(out, 'interior.request.json'), JSON.stringify(input, null, 2) + '\n');
await writeFile(join(out, 'shell.glb'), shell.glb);
await writePlacements(built, join(out, 'interior'));
const report = Object.values(built.layouts).map(layout => ({ layout: layout.id,
  units: [...new Set(layout.floor.rooms.map(room => room.unit).filter(Boolean))].map(unit => {
    const rooms = new Set(layout.floor.rooms.filter(room => room.unit === unit).map(room => room.id));
    const furniture = layout.floor.furniture.filter(item => rooms.has(item.room));
    return { unit, furniture: furniture.map(item => item.kind), missing: ['bed_double', 'kitchen_block', 'sink', 'toilet', 'shower']
      .filter(kind => !furniture.some(item => item.kind === kind || kind === 'bed_double' && item.kind === 'bed_single')) };
  }) }));
await writeFile(join(out, 'completeness.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.map(layout => ({ layout: layout.layout, units: layout.units.length, missing: layout.units.filter(unit => unit.missing.length) }))));
