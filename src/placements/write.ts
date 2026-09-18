import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlacementResult } from './types.js';
export async function writePlacements(result: PlacementResult, out: string): Promise<void> {
    await mkdir(join(out, 'layouts'), { recursive: true });
    await writeFile(join(out, 'building.json'), JSON.stringify(result.building) + '\n');
    for (const layout of Object.values(result.layouts))
        await writeFile(join(out, 'layouts', `${layout.id}.json`), JSON.stringify(layout) + '\n');
}
