import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildModules } from './index.js';
try {
    const { values } = parseArgs({ options: { out: { type: 'string', default: 'out/modules' } } });
    const { catalog, files } = await buildModules();
    await mkdir(values.out!, { recursive: true });
    for (const [file, bytes] of files)
        await writeFile(join(values.out!, file), bytes);
    await writeFile(join(values.out!, 'modules.json'), JSON.stringify(catalog) + '\n');
    console.log(`wrote ${files.size} shared modules to ${values.out}`);
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
