import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { generate, expandBuilding, findPath, coreFeasibility } from '../src/index.js';
import type { PlacementResult, InteriorRequest } from '../src/index.js';
import { assembly } from './fixtures.js';
const exec = promisify(execFile);
let dir: string, request: InteriorRequest, result: PlacementResult;
let modules: any;
let moduleSeconds: number;
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const cli = async (script: string, args: string[]) => exec(process.execPath, ['--import', 'tsx', script, ...args], { timeout: 30000 });
const bytes = async (path: string): Promise<number> => {
    const info = await stat(path);
    if (info.isFile())
        return info.size;
    let size = 0;
    for (const name of await readdir(path))
        size += await bytes(join(path, name));
    return size;
};
beforeAll(async () => {
    dir = await mkdtemp('out/test-placement-');
    request = await assembly();
    result = await generate(request);
    const start = performance.now();
    await cli('src/modules/cli.ts', ['--out', join(dir, 'modules')]);
    moduleSeconds = (performance.now() - start) / 1000;
    modules = await json(join(dir, 'modules/modules.json'));
}, 30000);
afterAll(async () => { if (dir)
    await rm(dir, { recursive: true, force: true }); });
it('publishes schema valid tables, catalog references, NPC anchors and complete routes', async () => {
    const ajv = new Ajv2020({ strict: false });
    for (const name of ['floor', 'npc', 'blueprint', 'modules', 'floor-placement', 'building'])
        ajv.addSchema(await json(`schemas/${name}.schema.json`), `https://urbe.dev/interior/${name}.schema.json`);
    for (const [name, value] of [['modules', modules], ['building', result.building], ...Object.values(result.layouts).map(l => ['floor-placement', l])]) {
        const check = ajv.getSchema(`https://urbe.dev/interior/${name}.schema.json`)!;
        expect(check(value), JSON.stringify(check.errors)).toBe(true);
    }
    const catalog = await json('src/assets/catalog.json'), ids = new Set(catalog.assets.map((a: any) => a.id));
    for (const l of Object.values(result.layouts)) {
        expect(l.placements.some(p => p.prop)).toBe(true);
        expect(l.floor.lights.length).toBeGreaterThan(0);
        for (const p of l.placements) {
            expect(p.module ? modules.modules.some((m: any) => m.id === p.module) : ids.has(p.prop)).toBe(true);
            expect(l.floor.rooms.some(room => room.id === p.room)).toBe(true);
        }
    }
    const expanded = expandBuilding(result), entrance = expanded.npc.anchors.find(a => a.kind === 'entrance')!;
    const upper = expanded.npc.anchors.find(a => a.floor === 4 && a.kind === 'stair_entry')!;
    expect(entrance).toBeDefined();
    expect(upper).toBeDefined();
    expect(findPath(expanded.npc, entrance, upper)?.some(leg => leg.kind === 'ride')).toBe(true);
    expect(findPath(expanded.npc, entrance, { floor: 999, position: [0, 0] })).toBeNull();
});
it('publishes indexed quantized meshopt module GLBs with accurate geometry and byte counts', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const entry of modules.modules) {
        const data = await readFile(join(dir, 'modules', entry.file));
        expect(data.length).toBe(entry.bytes);
        const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
        expect(gltf.extensionsRequired).toEqual(expect.arrayContaining(['KHR_mesh_quantization', 'EXT_meshopt_compression']));
        expect(gltf.images ?? []).toHaveLength(0);
        expect(gltf.meshes.flatMap((m: any) => m.primitives).every((p: any) => p.indices !== undefined && gltf.accessors[p.attributes.POSITION].componentType !== 5126)).toBe(true);
        const doc = await io.readBinary(data);
        const bounds = getBounds(doc.getRoot().listScenes()[0]!);
        for (let i = 0; i < 3; i++) {
            expect(Math.abs(bounds.max[i]! - bounds.min[i]! - entry.size[i])).toBeLessThan(.0001);
            expect(Math.abs(-bounds.min[i]! - entry.origin[i])).toBeLessThan(.0001);
        }
        expect(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + p.getIndices()!.getCount() / 3, 0)).toBe(entry.triangles);
        expect(doc.getRoot().listMaterials().map(m => m.getName())).toEqual(entry.materialSlots);
    }
});
it('generates byte identical tables and module files for identical inputs', async () => {
    const before = JSON.stringify(request);
    expect(JSON.stringify(await generate(request))).toBe(JSON.stringify(result));
    expect(JSON.stringify(request)).toBe(before);
    await cli('src/modules/cli.ts', ['--out', join(dir, 'again')]);
    for (const name of await readdir(join(dir, 'modules')))
        expect(await readFile(join(dir, 'again', name))).toEqual(await readFile(join(dir, 'modules', name)));
    const path = join(dir, 'request.json');
    await writeFile(path, JSON.stringify(request));
    await cli('src/cli.ts', ['--request', path, '--out', join(dir, 'first')]);
    await cli('src/cli.ts', ['--request', path, '--out', join(dir, 'second')]);
    for (const name of ['building.json', 'layouts/ground.json', 'layouts/middle.json', 'layouts/crown.json'])
        expect(await readFile(join(dir, 'first', name))).toEqual(await readFile(join(dir, 'second', name)));
}, 30000);
it('reuses exactly one middle layout and maps every opening and door to the assembled blueprint', () => {
    expect(Object.keys(result.layouts)).toEqual(['ground', 'middle', 'crown']);
    expect(result.building.floors.map(f => f.layout)).toEqual(['ground', 'middle', 'middle', 'middle', 'middle', 'crown']);
    for (const ref of result.building.floors) {
        const original = request.blueprint.floors[ref.index]!;
        expect(Object.values(ref.openings)).toEqual(original.openings.map(o => o.id));
        for (const opening of original.openings.filter(o => o.kind === 'door')) {
            expect(result.layouts[ref.layout].placements.find(p => ref.openings[p.id] === opening.id)?.module).toBe('door-frame');
            expect(result.layouts[ref.layout].placements.some(p => p.module === 'floor-tile' && ref.openings[p.opening ?? ''] === opening.id)).toBe(true);
            expect(result.layouts[ref.layout].floor.rooms.flatMap(r => r.doors).some(d => ref.openings[d.id] === opening.id)).toBe(true);
        }
    }
});
it('accepts vertically separate windows and rejects a true rectangular overlap', async () => {
    const modified = structuredClone(request);
    for (const f of modified.blueprint.floors.slice(1, -1)) {
        const first = f.openings[0]!, lower = { ...first, id: first.id + '/low', sill: .5, height: .75 }, upper = { ...first, id: first.id + '/high', sill: 2, height: .75 };
        delete lower.glazing;
        delete upper.glazing;
        f.openings.splice(0, 1, lower, upper);
    }
    const accepted = await generate(modified);
    expect(accepted.layouts.middle.openings.slice(0, 2).map(o => o.sill)).toEqual([.5, 2]);
    modified.blueprint.floors[1]!.openings[1]!.sill = .75;
    await expect(generate(modified)).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
});
it('rejects a stair roof exit below the promised standing clearance', async () => {
    const modified = structuredClone(request), shaft = coreFeasibility(modified.blueprint).placement!.stairA;
    const top = modified.blueprint.floors.at(-1)!;
    modified.blueprint.roof = { elevation: top.elevation + top.height, outline: top.outline, bulkhead: { ...shaft, housingHeight: 3, doorNormal: [-shaft.axis[1], shaft.axis[0]], doorWidth: 1, doorHeight: 2 } };
    await expect(generate(modified)).rejects.toMatchObject({ code: 'E_UNREACHABLE_SPACE' });
    modified.blueprint.roof.bulkhead!.doorHeight = 2.5;
    const accepted = await generate(modified);
    expect(accepted.layouts.crown.npc.nav.roofAccess?.floor).toBe(6);
    expect(accepted.layouts.crown.placements.some(p => p.connector === 'stair-a' && p.position[1] > 5)).toBe(true);
});
it('rejects module geometry that crosses the shell boundary', async () => {
    const modified = structuredClone(request);
    // A zero sill window reaches the slab; its return must not descend into shell material.
    const opening = modified.blueprint.floors.at(-1)!.openings[0]!;
    opening.sill = 0;
    delete opening.glazing;
    opening.offset = 0;
    opening.width = .5;
    await expect(generate(modified)).rejects.toMatchObject({ code: 'E_SHELL_BREACH' });
});
it('rejects invalid inputs, incompatible middle floors and incomplete assignments', async () => {
    await expect(generate({ seed: -1 })).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    const changed = structuredClone(request);
    changed.blueprint.floors[2]!.openings[0]!.width -= .1;
    delete changed.blueprint.floors[2]!.openings[0]!.glazing;
    await expect(generate(changed)).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    await expect(generate({ ...request, assignments: [{ floor: 0, kind: 'lobby' }] })).rejects.toMatchObject({ code: 'E_ASSIGNMENT_INVALID' });
});
it('keeps both furnished buildings including the shared module kit below 2 MB and 30 seconds', async () => {
    const proof = [];
    for (const family of ['mirror-frame', 'corporate-sectors'] as const) {
        const input = family === 'mirror-frame' ? request : await assembly(family), file = join(dir, `${family}.json`), out = join(dir, family);
        await writeFile(file, JSON.stringify(input));
        const start = performance.now();
        await cli('src/cli.ts', ['--request', file, '--out', out]);
        const seconds = (performance.now() - start) / 1000 + moduleSeconds, size = await bytes(out) + await bytes(join(dir, 'modules'));
        expect(size).toBeLessThan(2000000);
        expect(seconds).toBeLessThan(30);
        expect(await readdir(out)).toEqual(['building.json', 'layouts']);
        const counts = [];
        for (const id of ['ground', 'middle', 'crown']) {
            const layout = await json(join(out, 'layouts', `${id}.json`));
            counts.push({ layout: id, modules: layout.placements.filter((p: any) => p.module).length, props: layout.placements.filter((p: any) => p.prop).length });
        }
        proof.push({ family, bytes: size, seconds: Number(seconds.toFixed(3)), counts });
    }
    await writeFile('out/proof/budget.json', JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify(proof));
}, 30000);
