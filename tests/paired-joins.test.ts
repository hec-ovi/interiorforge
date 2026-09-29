import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import type { Placement } from '../src/placements/types.js';
import { expectBuildingLevels } from './building-levels.js';

it('closes risers and door heads and connects the ground and roof in resized paired buildings', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const geometries = new Map(moduleRecipes().map(recipe => {
        const positions: number[] = [], indices: number[] = [];
        for (const slot of recipe.mesh.materials()) {
            const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
            // Large modules exceed the engine's argument limit for a spread push.
            for (const value of group.positions) positions.push(value);
            for (const index of group.indices) indices.push(index + base);
        }
        const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices);
        return [recipe.id, geometry] as const;
    }));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
        for (const [width, depth, floors] of [[20.5, 37.5, 2], [37.5, 20.5, 7], [20.5, 20.5, 9]] as const) {
            const { blueprint } = await exterior.generate({ seed: 'lining-clearance', buildingId: 'joins', theme: 'cyberpunk',
                parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [0, depth / 2], maxHeight: floors * 4.5 },
                building: { type: 'corpo', tier: 'high_rich', floors }, options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
            const result = await generate({ seed: 'lining-clearance', building: { id: 'joins', type: 'corpo', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' });
            expectBuildingLevels(result, floors);
            expect(blueprint.roof.bulkhead).toBeTruthy();
            expect(result.layouts.crown!.npc.nav.roofAccess?.floor).toBe(floors);
            expect(result.building.connectors.find(c => c.id === 'stair-a')!.floors).toContain(floors);
            // Exterior owns the outdoor roof; crown below still owns the complete final flight.
            for (const layout of Object.values(result.layouts).filter(layout => layout.floor.kind !== 'roof')) {
                // Each climb owns its top landing: a stair portal's floor above the lowest
                // storey is the landing the flight below publishes at this floor's level.
                const own = result.building.floors.find(ref => ref.index === layout.sourceFloor)!;
                const below = result.building.floors.find(ref => ref.index === layout.sourceFloor - 1);
                const rise = below ? own.elevation - below.elevation : 0;
                const landings = below ? result.layouts[below.layout]!.placements
                    .filter(p => p.connector?.startsWith('stair-') && p.module?.startsWith('floor-slab-') && Math.abs(p.position[1] - rise) < 1e-6)
                    .map(p => ({ ...p, position: [p.position[0], 0, p.position[2]] as [number, number, number] })) : [];
                const placements = [...layout.placements, ...landings].filter(p => p.module && /^(door-|wall-|stair-|floor-)/.test(p.module));
                const meshOf = (p: Placement) => {
                    const mesh = new Mesh(geometries.get(p.module!)!, material);
                    mesh.position.fromArray(p.position); mesh.scale.fromArray(p.scale); mesh.rotation.y = p.rotationY;
                    mesh.updateMatrixWorld();
                    return mesh;
                };
                const meshes = placements.map(meshOf);
                const localProbe = (p: Placement, point: number[], direction: Vector3) => {
                    const mesh = meshOf(p), target = new Vector3().fromArray(point).applyMatrix4(mesh.matrixWorld);
                    direction.transformDirection(mesh.matrixWorld);
                    return new Raycaster(target.addScaledVector(direction, -.003), direction, 0, .006).intersectObjects(meshes, false);
                };
                for (const p of placements.filter(p => p.module && /^door-header(?:-|$)/.test(p.module))) {
                    // Exactly one underside: the wall header cannot occupy the casing face.
                    expect(localProbe(p, [.137, 0, .031], new Vector3(0, 1, 0)), `${layout.id} door ${p.id}`).toHaveLength(1);
                    const transform = meshOf(p).matrixWorld;
                    for (const z of [-.09, -.045, .013, .045, .09]) {
                        const target = new Vector3(.073, 0, z).applyMatrix4(transform).setY(.01);
                        const hits = new Raycaster(target, new Vector3(0, -1, 0), 0, .02).intersectObjects(meshes, false);
                        expect(hits.length, `${layout.id} threshold ${p.id} at ${target.toArray()}`).toBeGreaterThan(0);
                    }
                }
                // A tier's tread cap is its own piece standing proud of the flight's riser.
                const caps = new Set<object>(meshes.filter((_, i) => placements[i]!.module!.startsWith('stair-tread-')));
                for (const p of placements.filter(p => p.module!.startsWith('stair-flight-'))) {
                    const count = Number(p.module!.split('-').at(-1));
                    for (let step = 0; step < count; step++) {
                        const hits = localProbe(p, [.573, step * .17 + .01, step * .28], new Vector3(0, 0, 1));
                        expect(hits.filter(hit => !caps.has(hit.object)), `${layout.id} ${p.id} riser ${step}`).toHaveLength(1);
                        // Never in the riser's own plane: no two faces fight for one surface.
                        for (const hit of hits.filter(hit => caps.has(hit.object)))
                            expect(Math.abs(hit.distance - .003), `${layout.id} ${p.id} riser ${step} cap`).toBeGreaterThan(.001);
                    }
                }
                const shaftFields = placements.filter(p => p.connector?.startsWith('stair-') && /^wall-(panel-)?field-/.test(p.module!));
                expect(shaftFields.length).toBeGreaterThan(0);
                expect(shaftFields.some(p => p.position[1] + p.scale[1] * .5 >= blueprint.floors[layout.sourceFloor]!.height - 1e-6)).toBe(true);
                if (layout.id === 'ground') {
                    const bases = placements.filter(p => p.connector?.startsWith('stair-') && p.module!.startsWith('floor-slab-')
                        && p.position[1] === 0 && p.scale[0] * .5 > 2 && p.scale[2] * .5 > 2);
                    expect(bases.length).toBeGreaterThan(0);
                    for (const p of bases) expect(localProbe(p, [.137, 0, .091], new Vector3(0, -1, 0))).toHaveLength(1);
                }
            }
        }
    } finally { for (const geometry of geometries.values()) geometry.dispose(); material.dispose(); }
});
