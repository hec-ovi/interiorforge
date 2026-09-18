import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { generate, expandBuilding, findPath, coreFeasibility, makePlacementFixture } from '../src/index.js';
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
    expect(accepted.layouts.crown.placements.some(p => p.connector === 'stair-a' && p.module === 'floor-tile'
        && Math.abs(p.position[1] - top.height) < .0001)).toBe(true);
});
it('keeps module geometry and prop bounds inside the published or default backing inset', async () => {
    const catalog = await json('src/assets/catalog.json');
    for (const published of [undefined, 3.6]) {
        const modified = structuredClone(request), depth = published ?? .12;
        modified.assignments = modified.blueprint.floors.map(f => ({ floor: f.index, kind: 'retail' }));
        if (published === undefined) delete modified.blueprint.facade!.wallDepth;
        else modified.blueprint.facade!.wallDepth = published;
        const opening = modified.blueprint.floors.at(-1)!.openings[0]!;
        opening.sill = 0;
        delete opening.glazing;
        opening.offset = 0;
        opening.width = 4;
        const fitted = await generate(modified);
        expect(fitted.layouts.crown.placements.some(p => p.opening === opening.id)).toBe(true);
        for (const layout of Object.values(fitted.layouts)) {
            const outline = modified.blueprint.floors[layout.sourceFloor]!.outline;
            for (const p of layout.placements) {
                // Door thresholds join the inset floor to the published exterior passage.
                if (p.module === 'floor-tile' && p.opening) continue;
                const module = p.module && modules.modules.find((m: any) => m.id === p.module);
                const asset = p.prop && catalog.assets.find((a: any) => a.id === p.prop);
                const size = module ? module.size : [asset.dimensionsMeters[0], asset.dimensionsMeters[2], asset.dimensionsMeters[1]];
                const origin = module ? module.origin : [size[0] / 2, 0, size[2] / 2];
                for (const x of [-origin[0], size[0] - origin[0]]) for (const z of [-origin[2], size[2] - origin[2]]) {
                    const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
                    const world = [p.position[0] + x * p.scale[0] * c + z * p.scale[2] * s,
                        p.position[2] + z * p.scale[2] * c - x * p.scale[0] * s];
                    for (let i = 0; i < outline.length; i++) {
                        const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
                        const distance = ((b[0] - a[0]) * (world[1]! - a[1]) - (b[1] - a[1]) * (world[0]! - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
                        expect(distance, p.id).toBeGreaterThanOrEqual(depth - .0001);
                    }
                }
            }
        }
    }
});
it('degrades service programs and rejects invalid inputs or floors without room space', async () => {
    await expect(generate({ seed: -1 })).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    const changed = structuredClone(request);
    changed.blueprint.floors[2]!.openings[0]!.width -= .1;
    delete changed.blueprint.floors[2]!.openings[0]!.glazing;
    await expect(generate(changed)).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    await expect(generate({ ...request, assignments: [{ floor: 0, kind: 'lobby' }] })).rejects.toMatchObject({ code: 'E_ASSIGNMENT_INVALID' });
    const narrow = await assembly('corporate-sectors', { width: 16, depth: 32, floors: 5 });
    for (const floor of narrow.blueprint.floors) floor.outline = floor.outline.map(([x, z]) => [x + 727.7, z + 792.9]);
    narrow.blueprint.roof!.outline = narrow.blueprint.floors[0]!.outline;
    narrow.assignments = narrow.blueprint.floors.map(f => ({ floor: f.index, kind: 'retail' }));
    const before = JSON.stringify(narrow), reduced = await generate(narrow);
    expect(JSON.stringify(narrow)).toBe(before);
    expect(await generate(narrow)).toEqual(reduced);
    const changes = [{ kind: 'storage', requested: [3, 3], fitted: null }, { kind: 'toilets', requested: [3, 3], fitted: [2, 2] }];
    for (const floor of reduced.building.floors) {
        expect(floor.program).toEqual({ kind: 'retail', changes });
        const rooms = reduced.layouts[floor.layout].floor.rooms;
        expect(rooms.some(room => room.kind === 'sales_floor')).toBe(true);
        expect(rooms.some(room => room.kind === 'storage')).toBe(false);
        const toilets = rooms.find(room => room.kind === 'toilets')!;
        expect(Math.max(...toilets.polygon.map(p => p[0])) - Math.min(...toilets.polygon.map(p => p[0]))).toBeCloseTo(2);
        expect(Math.max(...toilets.polygon.map(p => p[1])) - Math.min(...toilets.polygon.map(p => p[1]))).toBeCloseTo(2);
    }
    const ajv = new Ajv2020({ strict: false });
    for (const name of ['floor', 'npc', 'building']) ajv.addSchema(await json(`schemas/${name}.schema.json`), `https://urbe.dev/interior/${name}.schema.json`);
    const check = ajv.getSchema('https://urbe.dev/interior/building.schema.json')!;
    expect(check(reduced.building), JSON.stringify(check.errors)).toBe(true);
    await expect(generate(makePlacementFixture({ width: 6, depth: 6, floors: 3 }))).rejects.toMatchObject({ code: 'E_FLOOR_TOO_SMALL' });
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
