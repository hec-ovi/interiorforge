import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { validateRequest, resolveAssignments } from '../src/blueprint/validate.js';
import { architectureAssignments } from '../src/architecture/recipes.js';
import { planBuilding } from '../src/layout/index.js';
import { baseLanding, computeStairSteps, entryAtLowEnd } from '../src/geometry/stairs.js';
import { uvToWorld } from '../src/layout/uv.js';
import type { Placement } from '../src/placements/types.js';

it('covers the full doorway passage and every tread/landing join across assembled balcony-grid floors', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const geometries = new Map(moduleRecipes().map(recipe => {
        const positions: number[] = [], indices: number[] = [];
        for (const slot of recipe.mesh.materials()) {
            const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
            positions.push(...group.positions); indices.push(...group.indices.map(i => i + base));
        }
        const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices);
        return [recipe.id, geometry] as const;
    }));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const meshOf = (p: Placement, elevation = 0) => {
        const mesh = new Mesh(geometries.get(p.module!)!, material);
        mesh.position.fromArray(p.position); mesh.position.y += elevation;
        mesh.rotation.y = p.rotationY; mesh.scale.fromArray(p.scale); mesh.updateMatrixWorld();
        return mesh;
    };
    const hasFloor = (meshes: Mesh[], point: Vector3) =>
        new Raycaster(point.clone().add(new Vector3(0, .003, 0)), new Vector3(0, -1, 0), 0, .006)
            .intersectObjects(meshes, false).length > 0;
    try {
        for (const [width, depth, floors, tier] of [[20.5, 37.5, 7, 'high_rich'], [37.5, 20.5, 2, 'high_rich'], [20.5, 20.5, 9, 'high_rich'], [20.5, 37.5, 7, 'mid']] as const) {
            const { blueprint } = await exterior.generate({ seed: 'stair-coverage', buildingId: 'coverage', theme: 'cyberpunk',
                parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [0, depth / 2], maxHeight: floors * 4.5 },
                building: { type: 'corpo', tier, floors }, options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
            const request = validateRequest({ seed: 'stair-coverage', building: { id: 'coverage', type: 'corpo', tier }, blueprint, materialTheme: 'cyberpunk' });
            const result = await generate(request);
            const { core } = planBuilding(request, architectureAssignments(request, resolveAssignments(request)), new Set([0, 1, floors - 1]));
            const missing: string[] = [];
            let probes = 0;
            const floorMeshes = result.building.floors.flatMap(ref => result.layouts[ref.layout]!.placements
                .filter(p => p.module?.startsWith('floor-slab-') || p.module?.startsWith('stair-flight-'))
                .map(p => meshOf(p, ref.elevation)));
            const groundStructure = result.layouts.ground!.placements
                .filter(p => p.module && /^(floor-slab-|wall-)/.test(p.module)).map(p => meshOf(p));
            for (const ref of result.building.floors) {
                const layout = result.layouts[ref.layout]!;
                for (const p of layout.placements.filter(p => p.module === 'door-header')) {
                    const transform = meshOf(p, ref.elevation).matrixWorld;
                    // Sample in world metres, including both clear edges beside the jambs.
                    const halfPassage = (p.scale[0] * .5 - .16) / 2;
                    for (const x of [-halfPassage + .004, -halfPassage / 2, .013, halfPassage / 2, halfPassage - .004]) {
                        for (const z of [-.096, -.051, -.009, .047, .096]) {
                            const point = new Vector3(x / p.scale[0], 0, z).applyMatrix4(transform).setY(ref.elevation);
                            if (!hasFloor(floorMeshes, point)) missing.push(`floor ${ref.index} ${p.id} doorway ${point.toArray()}`);
                            probes++;
                        }
                    }
                }
                for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
                    const shaft = which === 'a' ? core.stairA : core.stairB!;
                    if (ref.index === 0) {
                        // The lowest shaft is a closed room even behind and beneath the flight.
                        // Near-wall probes also catch open channels below recessed base trim.
                        for (const du of [.025, .075, shaft.lu / 2, shaft.lu - .075, shaft.lu - .025]) {
                            for (const dv of [.025, .075, shaft.lv / 2, shaft.lv - .075, shaft.lv - .025]) {
                                const [x, z] = uvToWorld([shaft.u + du, shaft.v + dv], core.frame);
                                if (!hasFloor(groundStructure, new Vector3(x, 0, z))) missing.push(`ground stair-${which} perimeter ${[x, 0, z]}`);
                                probes++;
                            }
                        }
                    }
                    const roof = layout.npc.nav.roofAccess;
                    const climb = ref.index < floors - 1 ? request.blueprint.floors[ref.index]!.height : which === 'a' ? roof?.elevation ?? 0 : 0;
                    const steps = [baseLanding(shaft, entryAtLowEnd(core, which), ref.elevation),
                        ...(climb ? computeStairSteps(shaft, entryAtLowEnd(core, which), ref.elevation, climb) : [])];
                    for (const [stepIndex, step] of steps.entries()) {
                        for (const du of [.003, step.lu / 2, step.lu - .003]) for (const dv of [.003, step.lv / 2, step.lv - .003]) {
                            const [x, z] = uvToWorld([step.u + du, step.v + dv], core.frame);
                            if (!hasFloor(floorMeshes, new Vector3(x, step.y, z))) missing.push(`floor ${ref.index} stair-${which} step ${stepIndex} ${[x, step.y, z]}`);
                            probes++;
                        }
                    }
                }
            }
            expect(probes).toBeGreaterThan(1000);
            expect(missing, `${width} × ${depth}, ${floors} floors, ${tier}`).toEqual([]);
        }
    } finally { for (const geometry of geometries.values()) geometry.dispose(); material.dispose(); }
}, 60_000);
