import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { generate, writePlacements } from '../../../index.js';
import type { InteriorRequest } from '../../../core/types.js';

/** Paired proofs go only under Interior/out. Nothing here publishes an Engine city. */
const { generate: exterior } = await import(new URL('../../../../../exterior/src/index.ts', import.meta.url).href);
const root = process.env.DAMAGED_PAIRED_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/paired/', import.meta.url));
await mkdir(root, { recursive: true });
const results = [];
for (const family of ['residential-courtyard', 'residential-megablock']) for (const size of [40, 60]) {
  const id = `${family}-poor-${size}`, floors = size === 40 ? 6 : 8;
  const out = join(root, id); await mkdir(out, { recursive: true });
  const request = {
    seed: `worn-homes-${family}-${size}-v2`, buildingId: id, theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [size, 0], [size, size], [0, size]], accessPoint: [size / 2, -1], maxHeight: 42 },
    building: { type: 'residential', tier: 'poor', floors, floorKinds: Array.from({ length: floors }, (_, i) => i === 0 ? 'lobby' : 'apartment') },
    options: { architecture: family, minimumClearHeight: 3, preferredFloorHeight: 3.5, glb: 'named', balconies: 'off',
      doorMotion: process.env.DAMAGED_DIAGNOSTIC_SWING === '1' ? 'swing' : 'pocket',
      facadeServices: 'off', roofArtifacts: 'off', adScreens: 'off', signage: null },
  };
  await writeFile(join(out, 'exterior.request.json'), JSON.stringify(request, null, 2) + '\n');
  try {
    const reuse = process.env.DAMAGED_REUSE_FROM;
    if (reuse && JSON.stringify(JSON.parse(await readFile(join(reuse, id, 'exterior.request.json'), 'utf8'))) !== JSON.stringify(request))
      throw new Error('Cached shell request differs from this exact variant');
    const shell = reuse ? { glb: await readFile(join(reuse, id, 'shell.glb')),
      blueprint: JSON.parse(await readFile(join(reuse, id, 'blueprint.json'), 'utf8')) }
      : await exterior(request, { textures: { mode: 'keys' } });
    const actualArchitecture = (shell.blueprint.assembly as { architecture?: string } | undefined)?.architecture;
    if (actualArchitecture !== family) throw new Error(`Requested ${family}, generated ${actualArchitecture ?? 'unreported architecture'}`);
    await writeFile(join(out, 'shell.glb'), shell.glb);
    await writeFile(join(out, 'blueprint.json'), JSON.stringify(shell.blueprint, null, 2) + '\n');
    const interior: InteriorRequest = { seed: request.seed, building: { id, type: 'residential', tier: 'poor' },
      materialTheme: 'cyberpunk', shellGlb: 'shell.glb', blueprint: shell.blueprint };
    await writeFile(join(out, 'interior.request.json'), JSON.stringify(interior, null, 2) + '\n');
    const built = await generate(interior, { models: new Set() });
    await writePlacements(built, join(out, 'interior'));
    const layouts = Object.values(built.layouts);
    const report = { id, family, actualArchitecture, parcel: size, floors: built.building.floors.length,
      layouts: layouts.map(layout => ({ id: layout.id, rooms: layout.floor.rooms.length,
        units: new Set(layout.floor.rooms.map(room => room.unit).filter(Boolean)).size,
        furniture: layout.floor.furniture.length, kitchen: layout.floor.furniture.filter(item => item.kind === 'kitchen_block').length,
        bed: layout.floor.furniture.filter(item => item.kind.startsWith('bed_')).length,
        shower: layout.floor.furniture.filter(item => item.kind === 'shower').length })),
      connectors: built.building.connectors.map(connector => ({ kind: connector.kind, floors: connector.floors })),
      entrances: built.building.floors.map(floor => ({ floor: floor.index, count: floor.apartmentEntrances?.length ?? 0 })),
      roof: !!built.layouts.crown?.npc.nav.roofAccess, shellBytes: shell.glb.byteLength };
    results.push(report); console.log(JSON.stringify(report));
  } catch (error) {
    const failure = { id, error: error instanceof Error ? error.message : String(error) };
    results.push(failure); console.log(JSON.stringify(failure));
  }
}
await writeFile(join(root, 'report.json'), JSON.stringify(results, null, 2) + '\n');
if (results.some(result => 'error' in result)) process.exitCode = 1;
