import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { generate, makePlacementFixture, writePlacements } from './index.js';
import type { BuildingType, Tier } from './core/types.js';
try {
    const { values } = parseArgs({
        options: {
            out: { type: 'string', default: 'out' }, request: { type: 'string' }, seed: { type: 'string' },
            floors: { type: 'string', default: '6' }, width: { type: 'string', default: '40' }, depth: { type: 'string', default: '40' },
            type: { type: 'string', default: 'offices' }, tier: { type: 'string', default: 'mid' }, theme: { type: 'string', default: 'cyberpunk' }
        }
    });
    const seed = values.seed ?? randomBytes(8).toString('hex'), width = Number(values.width), depth = Number(values.depth);
    const request = values.request ? JSON.parse(await readFile(values.request, 'utf8')) : makePlacementFixture({
        seed, floors: Number(values.floors),
        outline: [[0, 0], [width, 0], [width, depth], [0, depth]], type: values.type as BuildingType, tier: values.tier as Tier, theme: values.theme
    });
    const start = performance.now(), result = await generate(request);
    await writePlacements(result, values.out!);
    if (result.missingModels.length)
        console.warn(`warning: furniture models missing here, their furniture wore another model or left the layout: ${result.missingModels.join(', ')}`);
    console.log(`seed ${request.seed}; wrote ${Object.keys(result.layouts).length} layouts for ${result.building.floors.length} floors in ${((performance.now() - start) / 1000).toFixed(3)} s`);
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
