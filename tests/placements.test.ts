import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { generate, expandBuilding, findPath, coreFeasibility, makePlacementFixture } from '../src/index.js';
import type { PlacementResult, InteriorRequest, BuildingType, Tier, FloorKind, FloorPlacement, Placement } from '../src/index.js';
import { loadTheme } from '../src/materials/load.js';
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
        // The GLB names each material by its key and carries the variant in extras, as the engine reads it.
        expect(doc.getRoot().listMaterials().map(m => { const variant = (m.getExtras() as { materialVariant?: string }).materialVariant; return variant ? `${m.getName()}#${variant}` : m.getName(); })).toEqual(entry.materialSlots);
    }
    // Published keys must name entries or aliases the materials theme carries, with a variant it publishes.
    const theme = loadTheme('cyberpunk');
    const slots: string[] = modules.modules.flatMap((entry: any) => entry.materialSlots);
    expect(theme ? slots.filter(slot => { const [key, variant] = slot.split('#'); const entry = theme.library.entry(key!); return !entry || (variant && !entry.variants.some(v => v.id === variant)); }) : []).toEqual([]);
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
        const windows = original.openings.filter(o => o.kind === 'window');
        expect(Object.values(ref.openings)).toEqual(original.openings.filter(o => o.kind !== 'window').map(o => o.id));
        // Windows vary per floor, so their returns ride with the floor instead of the layout.
        expect(ref.treatments?.every(t => windows.some(o => o.id === t.opening)) ?? false).toBe(windows.length > 0);
        for (const opening of original.openings.filter(o => o.kind === 'door')) {
            expect(result.layouts[ref.layout]!.placements.find(p => ref.openings[p.id] === opening.id)?.module).toBe('door-frame');
            expect(result.layouts[ref.layout]!.placements.some(p => p.module?.startsWith('floor-slab') && ref.openings[p.opening ?? ''] === opening.id)).toBe(true);
            expect(result.layouts[ref.layout]!.floor.rooms.flatMap(r => r.doors).some(d => ref.openings[d.id] === opening.id)).toBe(true);
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
    expect(accepted.layouts.middle!.openings.slice(0, 2).map(o => o.sill)).toEqual([.5, 2]);
    modified.blueprint.floors[1]!.openings[1]!.sill = .75;
    await expect(generate(modified)).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
});
/** The left facade reshaped like a kit family's: two balcony notches and a rounded recess. */
function balconyEdge(size: number): [number, number][] {
    const curve: [number, number][] = [];
    for (let step = 1; step < 8; step++)
        curve.push([.8 * Math.sin((step * Math.PI) / 8), 26 - (12 * step) / 8]);
    return [[0, 30], [2, 30], [2, 26], [0, 26], ...curve, [0, 14], [2, 14], [2, 10], [0, 10]];
}
it('builds inside the published room envelope, core included, on a notched, curved outline', async () => {
    const shaped = structuredClone(request), corners: [number, number][] = [[3, 3], [37, 3], [37, 37], [3, 37]];
    for (const floor of shaped.blueprint.floors) {
        floor.outline = [[0, 0], [40, 0], [40, 40], [0, 40], ...balconyEdge(40)];
        floor.openings = floor.openings.filter(o => o.edge < 3);
        floor.roomEnvelope = { ...floor.roomEnvelope!, corners, origin: [3, 3], width: 34, depth: 34 };
    }
    const generated = await generate(shaped);
    for (const [name, layout] of Object.entries(generated.layouts))
        for (const p of layout.placements) {
            // Openings keep their own treatment on the shell outline; everything built, core included, stays on the plate.
            if (p.opening) continue;
            for (const [axis, world] of [[0, 0], [1, 2]] as const) {
                const span = corners.map(c => c[axis]!);
                expect(p.position[world], `${name}/${p.id}`).toBeGreaterThanOrEqual(Math.min(...span) - 1e-6);
                expect(p.position[world], `${name}/${p.id}`).toBeLessThanOrEqual(Math.max(...span) + 1e-6);
            }
        }
});
/** One published index, or a directory of them: every kit.json under it is swept. Without
 *  `URBE_KIT_INDEX` the suite takes a small sample of the newest index on disk. */
const kitRoot = '../engine/out/shared/kit';
const newestIndex = (): string | undefined => !existsSync(kitRoot) ? undefined
    : readdirSync(kitRoot).map(name => join(kitRoot, name, 'kit.json')).filter(file => existsSync(file))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const kitIndex = process.env.URBE_KIT_INDEX ?? newestIndex() ?? '';
const kitSample = process.env.URBE_KIT_INDEX ? Infinity : 6;
const kitFiles = (path: string): string[] => !path || !existsSync(path) ? []
    : statSync(path).isDirectory()
        ? readdirSync(path).map(name => join(path, name, 'kit.json')).filter(file => existsSync(file))
        : [path];
/** The generated shells of one assembled city: `URBE_CITY_DIR`, else the newest under the
 *  engine's cities, where the suite takes the short ones (the venues a story opens) unless
 *  a city is named. Each stands beside the request the engine wrapped it in. */
const citiesRoot = '../engine/out/cities';
const cityDir = process.env.URBE_CITY_DIR ?? (existsSync(citiesRoot)
    ? readdirSync(citiesRoot).map(name => join(citiesRoot, name)).filter(dir => statSync(dir).isDirectory())
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] : undefined);
const shellFloors = process.env.URBE_CITY_DIR ? Infinity : 3;
const shellBlueprints = (dir: string | undefined): [string, string][] => !dir || !existsSync(dir) ? []
    : readdirSync(dir).flatMap(parcel => {
        const blueprint = join(dir, parcel, `${parcel}.blueprint.json`);
        if (!existsSync(blueprint) || !existsSync(join(dir, parcel, `${parcel}.request.json`))) return [];
        return JSON.parse(readFileSync(blueprint, 'utf8')).floors.length <= shellFloors ? [[blueprint, parcel] as [string, string]] : [];
    });
it.skipIf(!kitFiles(kitIndex).length && !shellBlueprints(cityDir).length)('opens or degrades every published kit plan and generated shell', { timeout: 3600000 }, async () => {
    const plans = new Map<string, { id: string; type: BuildingType; tier: Tier }>();
    for (const file of kitFiles(kitIndex)) {
        const kit = JSON.parse(await readFile(file, 'utf8'));
        for (const plan of kit.plans.slice(0, kitSample)) {
            // An index can outlive the artifacts it names; a plan that is gone is not a refusal.
            const path = resolve(dirname(realpathSync(file)), '../..', plan.blueprint);
            if (existsSync(path)) plans.set(path, { id: plan.id, type: 'residential', tier: 'mid' });
        }
    }
    for (const [path, id] of shellBlueprints(cityDir)) {
        const request = JSON.parse(await readFile(path.replace('.blueprint.json', '.request.json'), 'utf8'));
        plans.set(path, { id, type: request.building.type, tier: request.building.tier });
    }
    const refused: string[] = [];
    for (const [path, building] of plans) {
        const blueprint = JSON.parse(await readFile(path, 'utf8'));
        const built = await generate({ seed: building.id, building, blueprint, materialTheme: 'cyberpunk' })
            .catch((error: { code?: string; message?: string }) => {
                refused.push(`${building.id}: ${error.code ?? ''} ${error.message ?? ''}`);
                return null;
            });
        if (built) expect(built.building.floors.length).toBeGreaterThan(0);
    }
    // A generated shell whose connection floor carries a bridge aperture has no reusable
    // middle layout: that refusal is the contract's own and is listed in docs/ISSUES.md.
    expect(refused.filter(reason => !reason.includes('differs from the reusable middle layout'))).toEqual([]);
});
/** The fixture's entrance as Exterior 0.58.12 publishes it: two leaves retracting into a cassette. */
function pocketDoor(opening: any, wallDepth: number): void {
    const leaves = 2, leafWidth = opening.width / leaves, travel = leafWidth + .05, chamber = leafWidth + .08, backDepth = Math.min(.22, wallDepth);
    opening.leaves = leaves;
    opening.door = {
        ...opening.door,
        motion: { kind: 'pocket', maxTravel: travel, clearDepth: 0, leaves: [0, 1].map(leaf => ({ leaf, travelU: leaf ? travel : -travel,
            pocket: { offset: leaf ? opening.offset + opening.width : opening.offset - chamber, sill: 0, width: chamber, height: opening.height + .02, frontDepth: .09, backDepth: backDepth - .03 } })) },
        clearance: { offset: opening.offset, sill: 0, width: opening.width, height: opening.height, backDepth },
        cassette: { offset: opening.offset - chamber - .03, sill: 0, width: opening.width + 2 * chamber + .06, height: opening.height + .08, backDepth }
    };
}
it('opens a pocket door on its published clearance and joins the threshold behind its cassette', async () => {
    const pocketed = structuredClone(request), ground = pocketed.blueprint.floors[0]!, wallDepth = pocketed.blueprint.facade!.wallDepth!;
    const door = ground.openings.find(o => o.kind === 'door')!;
    pocketDoor(door, wallDepth);
    const cassette = door.door!.cassette!;
    ground.openings = ground.openings.filter(o => o === door || o.edge !== door.edge
        || o.offset + o.width <= cassette.offset || o.offset >= cassette.offset + cassette.width);
    const built = await generate(pocketed);
    const layout = built.layouts.ground!, frame = layout.placements.find(p => p.id === door.id)!;
    const threshold = layout.placements.find(p => p.module?.startsWith('floor-slab') && p.opening === door.id)!;
    expect(frame.module).toBe('door-frame');
    expect(frame.scale[0]).toBeCloseTo(door.door!.clearance!.width);
    const a = ground.outline[door.edge]!, b = ground.outline[(door.edge + 1) % ground.outline.length]!;
    const inward = ((b[0] - a[0]) * (threshold.position[2] - a[1]) - (b[1] - a[1]) * (threshold.position[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The tile spans from the cassette back plane to the plate, so its centre sits behind both.
    expect(inward - threshold.scale[2] * .25).toBeGreaterThanOrEqual(cassette.backDepth - 1e-6);
    expect(inward + threshold.scale[2] * .25).toBeLessThanOrEqual(wallDepth + 1e-6);
});
it('publishes ground and crown alone for a two floor building', async () => {
    const pair = structuredClone(request), ground = pair.blueprint.floors[0]!, crown = pair.blueprint.floors.at(-1)!;
    crown.index = 1;
    crown.elevation = ground.height;
    pair.blueprint.floors = [ground, crown];
    if (pair.blueprint.roof) pair.blueprint.roof.elevation = crown.elevation + crown.height;
    const built = await generate(pair);
    expect(Object.keys(built.layouts)).toEqual(['ground', 'crown']);
    expect(built.building.layouts.middle).toBeUndefined();
    expect(built.building.floors.map(f => f.layout)).toEqual(['ground', 'crown']);
    expect(expandBuilding(built).npc.anchors.some(a => a.kind === 'entrance')).toBe(true);
});
it('opens a stack with a basement on its lowest above-ground floor', async () => {
    const stacked = structuredClone(request), ground = stacked.blueprint.floors[0]!;
    stacked.blueprint.floors.unshift({ ...structuredClone(ground), index: -1, kind: 'basement', elevation: -ground.height, openings: [] });
    if (stacked.assignments) stacked.assignments.unshift({ floor: -1, kind: 'parking' });
    const built = await generate(stacked);
    // The basement stays closed and the published indices are kept as they are.
    expect(built.building.floors.map(f => f.index)).toEqual(request.blueprint.floors.map(f => f.index));
    expect(built.building.floors[0]!.layout).toBe('ground');
});
it('places the core where its published feasibility says it will', () => {
    const fit = coreFeasibility(request.blueprint, request.building.type);
    expect(fit.fits).toBe(true);
    expect(fit.placement).toEqual(result.building.corePlacement);
});
it('leaves no room space beside the core thinner than a body', () => {
    const body = .6, inside = (room: any, point: number[]) => {
        const ring: number[][] = room.polygon ?? [[room.rect.x, room.rect.z], [room.rect.x + room.rect.w, room.rect.z],
            [room.rect.x + room.rect.w, room.rect.z + room.rect.d], [room.rect.x, room.rect.z + room.rect.d]];
        let hit = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i]!, b = ring[j]!;
            if ((a[1]! > point[1]!) !== (b[1]! > point[1]!)
                && point[0]! < a[0]! + (b[0]! - a[0]!) * (point[1]! - a[1]!) / (b[1]! - a[1]!)) hit = !hit;
        }
        return hit;
    };
    for (const layout of Object.values(result.layouts))
        for (const shaft of [...layout.floor.core.stairs, ...layout.floor.core.elevators])
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                const face = [shaft.rect.x + shaft.rect.w * (1 + dx) / 2, shaft.rect.z + shaft.rect.d * (1 + dz) / 2];
                const near = [face[0]! + dx * body / 2, face[1]! + dz * body / 2];
                const far = [face[0]! + dx * body, face[1]! + dz * body];
                for (const room of layout.floor.rooms)
                    if (inside(room, near))
                        expect(inside(room, far), `${layout.id}/${room.id} beside ${shaft.id}`).toBe(true);
            }
});
it('reuses one middle layout when floors differ only in exterior dressing', async () => {
    const dressed = structuredClone(request), middles = dressed.blueprint.floors.slice(1, -1);
    for (const floor of middles)
        for (const opening of floor.openings) {
            opening.material = floor.index % 2 ? 'cyberpunk/paired-window-glass/mid' : 'cyberpunk/paired-window-black/mid';
            opening.sectionId = `bg:${floor.index}`;
            opening.scenery = { nodeId: `scenery:${floor.index}`, lightLayout: floor.index % 2 ? 'strips' : 'spots',
                lights: [{ position: [0, floor.elevation + 1, 0], lumens: 1200 * (floor.index % 2 + 1) }] };
        }
    const generated = await generate(dressed);
    expect(generated.building.floors.filter(f => f.layout === 'middle').map(f => f.index)).toEqual(middles.map(f => f.index));
});
it('rejects a stair roof exit below the promised standing clearance', { timeout: 20000 }, async () => {
    const modified = structuredClone(request), shaft = coreFeasibility(modified.blueprint).placement!.stairA;
    const top = modified.blueprint.floors.at(-1)!;
    modified.blueprint.roof = { elevation: top.elevation + top.height, outline: top.outline, bulkhead: { ...shaft, housingHeight: 3, doorNormal: [-shaft.axis[1], shaft.axis[0]], doorWidth: 1, doorHeight: 2 } };
    await expect(generate(modified)).rejects.toMatchObject({ code: 'E_UNREACHABLE_SPACE' });
    modified.blueprint.roof.bulkhead!.doorHeight = 2.5;
    const accepted = await generate(modified);
    expect(accepted.layouts.crown!.npc.nav.roofAccess?.floor).toBe(6);
    expect(accepted.layouts.crown!.placements.some(p => p.connector === 'stair-a' && p.module?.startsWith('floor-slab')
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
        const crown = fitted.building.floors.at(-1)!;
        expect(crown.treatments?.some(p => p.opening === opening.id)).toBe(true);
        for (const [source, placements] of [...Object.values(fitted.layouts).map(l => [l.sourceFloor, l.placements] as const),
            ...fitted.building.floors.map(f => [f.index, f.treatments ?? []] as const)]) {
            const outline = modified.blueprint.floors[source]!.outline;
            for (const p of placements) {
                // Door thresholds join the inset floor to the published exterior passage.
                if (p.module?.startsWith('floor-slab') && p.opening) continue;
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
it('degrades service programs and rejects invalid inputs or floors without room space', { timeout: 30000 }, async () => {
    await expect(generate({ seed: -1 })).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    const changed = structuredClone(request);
    changed.blueprint.floors[2]!.height -= .1;
    await expect(generate(changed)).rejects.toMatchObject({ code: 'E_BLUEPRINT_INVALID' });
    await expect(generate({ ...request, assignments: [{ floor: 0, kind: 'lobby' }] })).rejects.toMatchObject({ code: 'E_ASSIGNMENT_INVALID' });
    const narrow = await assembly('corporate-sectors', { width: 16, depth: 32, floors: 5 });
    // A stored blueprint with no room envelope, far from the origin: the outline path.
    for (const floor of narrow.blueprint.floors) {
        floor.outline = floor.outline.map(([x, z]) => [x + 727.7, z + 792.9]);
        delete floor.roomEnvelope;
    }
    narrow.blueprint.roof!.outline = narrow.blueprint.floors[0]!.outline;
    narrow.assignments = narrow.blueprint.floors.map(f => ({ floor: f.index, kind: 'retail' }));
    const before = JSON.stringify(narrow), reduced = await generate(narrow);
    expect(JSON.stringify(narrow)).toBe(before);
    expect(await generate(narrow)).toEqual(reduced);
    const changes = [{ kind: 'storage', requested: [3, 3], fitted: null }, { kind: 'toilets', requested: [3, 3], fitted: [2, 2] }];
    for (const floor of reduced.building.floors) {
        expect(floor.program).toEqual({ kind: 'retail', changes });
        const rooms = reduced.layouts[floor.layout]!.floor.rooms;
        expect(rooms.some(room => room.kind === 'sales_floor')).toBe(true);
        expect(rooms.some(room => room.kind === 'storage')).toBe(false);
        const toilets = rooms.find(room => room.kind === 'toilets')!;
        expect(Math.max(...toilets.polygon.map(p => p[0])) - Math.min(...toilets.polygon.map(p => p[0]))).toBeCloseTo(2);
        expect(Math.max(...toilets.polygon.map(p => p[1])) - Math.min(...toilets.polygon.map(p => p[1]))).toBeCloseTo(2);
    }
    const ajv = new Ajv2020({ strict: false });
    for (const name of ['floor', 'npc', 'blueprint', 'floor-placement', 'building']) ajv.addSchema(await json(`schemas/${name}.schema.json`), `https://urbe.dev/interior/${name}.schema.json`);
    const check = ajv.getSchema('https://urbe.dev/interior/building.schema.json')!;
    expect(check(reduced.building), JSON.stringify(check.errors)).toBe(true);
    await expect(generate(makePlacementFixture({ width: 6, depth: 6, floors: 3 }))).rejects.toMatchObject({ code: 'E_FLOOR_TOO_SMALL' });
});
/** The fixture as a venue of one program, furnished in that building's own family. */
function asVenue(type: BuildingType, tier: Tier, ground: FloorKind, upper: FloorKind): InteriorRequest {
    const venue = structuredClone(request);
    venue.building = { ...venue.building, type, tier };
    venue.assignments = venue.blueprint.floors.map(f => ({ floor: f.index, kind: f.index === 0 ? ground : upper }));
    return venue;
}
const wallPiece = (p: Placement, kind: string) => p.module?.startsWith(`wall-panel-${kind}`);
/** A piece's centre along and across its own partition line. */
const alongOf = (p: Placement) => p.position[0] * Math.cos(p.rotationY) - p.position[2] * Math.sin(p.rotationY);
const acrossOf = (p: Placement) => p.position[0] * Math.sin(p.rotationY) + p.position[2] * Math.cos(p.rotationY);
const same = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
it('frames every fitted partition run as a nine-slice with corners, edges, aligned fields and lit joints', () => {
    const layout = result.layouts.ground!, ceiling = layout.floor.ceilingElevation - layout.floor.elevation;
    const corners = layout.placements.filter(p => wallPiece(p, 'corner')), edges = layout.placements.filter(p => wallPiece(p, 'edge'));
    const fields = layout.placements.filter(p => wallPiece(p, 'field')), lines = layout.placements.filter(p => p.module?.startsWith('wall-light-line'));
    expect(fields.length).toBeGreaterThan(0);
    for (const corner of corners) expect(corner.scale).toEqual([1, 1, 1]);
    for (const field of fields) {
        expect(field.scale[0] * .5).toBeLessThanOrEqual(2.5 + 1e-6);
        expect(field.scale[1] * .5).toBeCloseTo(ceiling - 1, 5);
        expect(field.position[1]).toBeCloseTo(.5, 6);
        // The top edge of its run spans the field, and a corner closes each end of that edge.
        const top = edges.find(e => same(e.rotationY, field.rotationY) && same(e.position[1], ceiling - .5) && same(acrossOf(e), acrossOf(field))
            && Math.abs(alongOf(e) - alongOf(field)) <= e.scale[0] * .25 + 1e-6)!;
        expect(top, field.id).toBeDefined();
        for (const end of [-1, 1]) {
            expect(corners.some(c => same(c.rotationY, top.rotationY) && same(c.position[1], top.position[1]) && same(acrossOf(c), acrossOf(top))
                && same(alongOf(c), alongOf(top) + end * (top.scale[0] * .25 + .25))), `${field.id} corner ${end}`).toBe(true);
        }
        // Lit joints at the bottom and top of the run, each a published emitter.
        for (const y of [.5, ceiling - .5]) {
            const line = lines.find(l => same(l.rotationY, top.rotationY) && same(l.position[1], y) && same(alongOf(l), alongOf(top)) && Math.abs(acrossOf(l) - acrossOf(top)) < .1)!;
            expect(line, `${field.id} line at ${y}`).toBeDefined();
            expect(layout.floor.lights.find(light => light.id === line.id)?.kind).toBe('cove');
        }
    }
});
it('publishes every fixture module as an emitter and keeps each room lit within a bounded set', () => {
    for (const layout of Object.values(result.layouts)) {
        const lights = new Map(layout.floor.lights.map(l => [l.id, l]));
        const fixtures = layout.placements.filter(p => /^(ceiling-spot|ceiling-led-strip|ceiling-cove|wall-light-line)/.test(p.module ?? ''));
        expect(fixtures.length).toBeGreaterThan(0);
        for (const fixture of fixtures) expect(lights.has(fixture.id), fixture.id).toBe(true);
        for (const light of layout.floor.lights) if (!light.furniture) expect(layout.placements.some(p => p.id === light.id), light.id).toBe(true);
        for (const room of layout.floor.rooms) {
            const own = layout.floor.lights.filter(l => l.room === room.id);
            expect(own.some(l => l.kind === 'spot' || l.kind === 'strip'), room.id).toBe(true);
            // a cove piece per ten metres of wall, two lines per frame and a few spots: a lobby stays under this
            expect(own.length, room.id).toBeLessThanOrEqual(64);
        }
    }
});
it('furnishes a lobby, a restaurant and a residence with the pieces their programs name, staffed and lit', { timeout: 30000 }, async () => {
    const kinds = (layout: FloorPlacement, room?: string) => layout.floor.furniture
        .filter(f => !room || layout.floor.rooms.find(r => r.id === f.room)?.kind === room).map(f => f.kind);
    const roles = (layout: FloorPlacement) => layout.npc.roles.map(r => r.role);
    const hotel = await generate(asVenue('hotel', 'rich', 'lobby', 'hotel_rooms')), lobby = hotel.layouts.ground!;
    expect(kinds(lobby, 'reception')).toEqual(expect.arrayContaining(['reception_desk', 'plant', 'sofa']));
    // The desk stands on the axis of the entrance, facing it.
    const desk = lobby.floor.furniture.find(f => f.kind === 'reception_desk')!, hall = lobby.floor.rooms.find(r => r.id === desk.room)!;
    const entrance = hall.doors.find(d => d.to === 'outside')!, a = entrance.angleDeg * Math.PI / 180;
    const along = ([x, z]: readonly number[]) => x! * Math.cos(a) + z! * Math.sin(a);
    expect(Math.abs(along(desk.position) - along(entrance.position))).toBeLessThanOrEqual(1);
    expect((desk.rotationDeg - entrance.angleDeg + 360) % 360).toBe(180);
    expect(roles(lobby)).toEqual(expect.arrayContaining(['receptionist', 'porter', 'security', 'guest']));
    const restaurant = await generate(asVenue('restaurant', 'rich', 'restaurant', 'restaurant')), dining = restaurant.layouts.ground!;
    expect(kinds(dining, 'dining_area')).toEqual(expect.arrayContaining(['bar_counter', 'stool', 'shelf', 'dining_table', 'chair', 'room_divider']));
    expect(kinds(dining, 'kitchen')).toContain('kitchen_block');
    for (const item of dining.floor.furniture.filter(f => ['bar_counter', 'stool', 'dining_table', 'chair'].includes(f.kind)))
        expect(dining.placements.find(p => p.id === item.id)?.module, item.kind).toMatch(/^fit-/);
    expect(roles(dining)).toEqual(expect.arrayContaining(['host', 'waiter', 'cook', 'bartender', 'guest']));
    expect(dining.floor.lights.some(l => l.kind === 'spot' && dining.floor.rooms.find(r => r.id === l.room)?.kind === 'dining_area')).toBe(true);
    const home = await generate(asVenue('residential', 'high_rich', 'lobby', 'residence_studio')), flat = home.layouts.middle!;
    expect(kinds(flat)).toEqual(expect.arrayContaining(['kitchen_block', 'bar_counter', 'stool', 'bed_double', 'wardrobe', 'shower', 'sink', 'toilet', 'plant']));
    expect(flat.placements.some(p => p.module === 'floor-carpet')).toBe(true);
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
