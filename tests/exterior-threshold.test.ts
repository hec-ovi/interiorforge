import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { edgeFrame, edgePoint } from '../src/geometry/shell-fit.js';
import { makeFrame, uvToWorld } from '../src/layout/uv.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { surface } from '../src/placements/surfaces.js';
import { exteriorThreshold } from '../src/placements/thresholds.js';
import { generate } from '../src/index.js';

it.each([[0, 3, .258, 1], [37, 3, .258, 1], [90, 1.1, .12, .676], [-23, 4.6, .45, 2.4]])(
    'joins the full passage to its actual floor with one top surface (yaw %s, width %s, recess %s, room inset %s)', (angle, width, recess, inset) => {
        const frame = makeFrame(angle!), builder = new PlacementBuilder();
        // Meridian's real entrance coordinates: outline z36, shell backing z36.676,
        // published room envelope z37. The old threshold stopped .324m short.
        const outline = [[83.5, 36], [119.5, 36], [119.5, 72], [83.5, 72]]
            .map(([u, v]) => uvToWorld([u!, v!], frame));
        const face = edgeFrame(outline, 0);
        surface(builder, 'floor-slab-marble', 'lobby', { u: 84.5, v: 36 + inset!, lu: 34, lv: 34 - inset! + 1 }, 0, frame);
        exteriorThreshold(builder, face, 'entrance', 22 - width! / 2, width!, recess!, 'floor-slab-marble', 'lobby');
        expect(builder.placements.filter(p => p.opening === 'entrance')).toHaveLength(1);
        const recipe = moduleRecipes().find(recipe => recipe.id === 'floor-slab-marble')!;
        const positions: number[] = [], indices: number[] = [];
        for (const slot of recipe.mesh.materials()) {
            const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
            positions.push(...group.positions);
            indices.push(...Array.from(group.indices, index => index + base));
        }
        const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices);
        const material = new MeshBasicMaterial({ side: DoubleSide });
        const meshes = builder.placements.map(placement => {
            const mesh = new Mesh(geometry, material);
            mesh.position.fromArray(placement.position); mesh.rotation.y = placement.rotationY; mesh.scale.fromArray(placement.scale);
            mesh.updateMatrixWorld();
            return mesh;
        });
        try {
            for (const across of [-.49, -.23, .013, .27, .49]) for (let step = 0; step < 41; step++) {
                const depth = recess! + .001 + (inset! + .11 - recess!) * step / 40;
                const [x, z] = edgePoint(face, 22 + width! * across, depth);
                const hits = new Raycaster(new Vector3(x, .01, z), new Vector3(0, -1, 0), 0, .02).intersectObjects(meshes, false);
                expect(hits, `passage at depth ${depth} across ${across}`).toHaveLength(1);
                expect(hits[0]!.point.y).toBeCloseTo(0, 6);
            }
        } finally { geometry.dispose(); material.dispose(); }
    },
);

it('meets a stepped room boundary without laying a duplicate top over the nearer floor', () => {
    const builder = new PlacementBuilder(), frame = makeFrame(0);
    surface(builder, 'floor-slab-marble', 'lobby', { u: 0, v: 1, lu: 2, lv: 4 }, 0, frame);
    surface(builder, 'floor-slab-marble', 'lobby', { u: 2, v: 1.5, lu: 2, lv: 3.5 }, 0, frame);
    const face = edgeFrame([[0, 0], [4, 0], [4, 5], [0, 5]], 0);
    exteriorThreshold(builder, face, 'stepped', 1, 2, .2, 'floor-slab-marble', 'lobby');
    const thresholds = builder.placements.filter(p => p.opening === 'stepped');
    expect(thresholds).toHaveLength(2);
    expect(thresholds.map(p => p.position[2] + p.scale[2] * .25)).toEqual([1, 1.5]);
    expect(thresholds.map(p => p.scale[0] * .5)).toEqual([1, 1]);
});

it.each([0, 37])('keeps the actual Meridian shell and room finish continuous without coplanar faces at %s degrees', async angle => {
    const [{ generate: exterior }, { glbIO }, { cutPlate, interiorStoreys }] = await Promise.all([
        import(new URL('../../exterior/src/index.ts', import.meta.url).href),
        import(new URL('../../exterior/tests/support.ts', import.meta.url).href),
        import(new URL('../../engine/src/game/city/StoreyPlates.js', import.meta.url).href),
    ]);
    const frame = makeFrame(angle), rotate = (u: number, v: number) => uvToWorld([u, v], frame);
    const { blueprint, glb } = await exterior({
        seed: 'luxury-reference-review', buildingId: 'p0', theme: 'cyberpunk',
        parcel: { footprint: [rotate(81.5, 34), rotate(121.5, 34), rotate(121.5, 74), rotate(81.5, 74)],
            accessPoint: rotate(101.5, 34), maxHeight: 31.5,
            buildingGrid: { origin: rotate(81.5, 34), angle, spacing: .5 } },
        building: { type: 'residential', tier: 'high_rich', floors: 6 },
        options: { architecture: 'mirror-frame', glb: 'named' },
    }, { textures: { mode: 'keys' } });
    const interior = await generate({ seed: blueprint.seed, building: { id: 'p0', type: 'residential', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' });
    const document = await glbIO().readBinary(glb), material = new MeshBasicMaterial();
    const geometries: BufferGeometry[] = [], shellMeshes: Mesh[] = [], meshes: Mesh[] = [];
    const floor = blueprint.floors[0], door = floor.openings.find((opening: { id: string }) => opening.id === 'entrance');
    const face = edgeFrame(floor.outline, door.edge), field = door.door.clearance;
    const center = field.offset + field.width / 2;
    const finish = interior.layouts.ground!.placements.find(p => p.id === 'threshold:entrance')!;
    expect(finish.scale[0] * .5).toBeCloseTo(field.width, 6);
    const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
    try {
        for (const node of document.getRoot().listNodes().filter((node: { getName(): string }) => node.getName() === 'floor:0/slab')) {
            for (const primitive of node.getMesh()!.listPrimitives()) {
                const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(primitive.getAttribute('POSITION')!.getArray()!), 3));
                geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
                const raw = geometry.toNonIndexed(); geometry.dispose(); geometries.push(raw);
                shellMeshes.push(new Mesh(raw, material));
                const clipped = cutPlate(raw, interiorStoreys('p0', interior).get(0).rect);
                if (clipped) { geometries.push(clipped); meshes.push(new Mesh(clipped, material)); }
            }
        }
        // A reference style's floor system lays its finish tiles on a support 2 mm below the walking
        // surface, so the finish the threshold meets is the tile, not the slab.
        for (const placement of interior.layouts.ground!.placements.filter(p => p.module?.startsWith('floor-slab-') || p.module?.startsWith('floor-finish-'))) {
            const positions: number[] = [], indices: number[] = [], recipe = recipes.get(placement.module!)!;
            for (const slot of recipe.mesh.materials()) {
                const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
                positions.push(...group.positions); indices.push(...Array.from(group.indices, index => index + base));
            }
            const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
            geometry.setIndex(indices); geometries.push(geometry);
            const mesh = new Mesh(geometry, material);
            mesh.position.fromArray(placement.position); mesh.rotation.y = placement.rotationY; mesh.scale.fromArray(placement.scale); mesh.updateMatrixWorld();
            meshes.push(mesh);
        }
        for (const across of [-.45, -.21, .017, .31, .45]) for (const depth of [.021, .137, .259, .417, .675, .677, .873, .999, 1.003, 1.113]) {
            const [x, z] = edgePoint(face, center + field.width * across, depth);
            const ray = new Raycaster(new Vector3(x, .05, z), new Vector3(0, -1, 0), 0, .1);
            const hits = ray.intersectObjects(meshes, false).filter(hit => Math.abs(hit.point.y) < .001);
            expect(hits, `finish depth ${depth}, across ${across}`).toHaveLength(1);
            if (depth > field.backDepth && depth < .999) {
                const structural = ray.intersectObjects(shellMeshes, false);
                expect(structural[0]!.point.y).toBeCloseTo(-.02, 5);
            }
        }
    } finally { for (const geometry of geometries) geometry.dispose(); material.dispose(); }
}, 180_000);
