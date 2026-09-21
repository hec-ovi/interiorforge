import { expect, it } from 'vitest';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate, coreFeasibility, makePlacementFixture, type InteriorRequest, type PlacementResult } from '../src/index.js';
import { STAIR } from '../src/layout/constants.js';
import { planFlights, shaftDepthFor, shaftLength } from '../src/layout/stair-plan.js';
import { baseLanding, computeStairSteps, entryAtLowEnd, minHeadroom } from '../src/geometry/stairs.js';
import { planCore } from '../src/layout/core-plan.js';
import { uvRectWorldBounds, uvToWorld } from '../src/layout/uv.js';
import { moduleRecipes } from '../src/modules/recipes.js';

/** Probe the shipped modules with adjacent storeys present, including a change in rise. */
function checkStackedGeometry(request: InteriorRequest, result: PlacementResult): number {
    const core = planCore(request, []);
    const geometries = new Map(moduleRecipes().map(recipe => {
        const positions: number[] = [], indices: number[] = [];
        for (const slot of recipe.mesh.materials()) {
            const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
            positions.push(...group.positions);
            indices.push(...group.indices.map(index => index + base));
        }
        const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices);
        return [recipe.id, geometry] as const;
    }));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
        const meshes = result.building.floors.flatMap(ref => result.layouts[ref.layout]!.placements.filter(placement => placement.module).map(placement => {
            const mesh = new Mesh(geometries.get(placement.module!)!, material);
            mesh.position.set(placement.position[0], placement.position[1] + ref.elevation, placement.position[2]);
            mesh.rotation.y = placement.rotationY;
            mesh.scale.fromArray(placement.scale);
            mesh.updateMatrixWorld();
            return { mesh, bounds: new Box3().setFromObject(mesh) };
        }));
        let probes = 0;
        for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
            const shaft = which === 'a' ? core.stairA : core.stairB!, low = entryAtLowEnd(core, which);
            const bounds = uvRectWorldBounds(shaft, core.frame);
            const box = new Box3(new Vector3(bounds.x - .01, -100, bounds.z - .01), new Vector3(bounds.x + bounds.w + .01, 1000, bounds.z + bounds.d + .01));
            const candidates = meshes.filter(item => box.intersectsBox(item.bounds)).map(item => item.mesh);
            for (const ref of result.building.floors) {
                const layout = result.layouts[ref.layout]!;
                const floor = request.blueprint.floors.find(item => item.index === ref.index)!;
                const hasFlight = layout.placements.some(placement => placement.connector === `stair-${which}` && placement.module?.startsWith('stair-flight-'));
                const steps = [baseLanding(shaft, low, ref.elevation), ...(hasFlight ? computeStairSteps(shaft, low, ref.elevation, floor.height) : [])];
                for (const step of steps) {
                    const du = Math.min(.12, step.lu / 2), dv = Math.min(.12, step.lv / 2);
                    for (const [u, v] of [[step.u + step.lu / 2, step.v + step.lv / 2], [step.u + du, step.v + dv],
                        [step.u + step.lu - du, step.v + dv], [step.u + du, step.v + step.lv - dv],
                        [step.u + step.lu - du, step.v + step.lv - dv]]) {
                        const [x, z] = uvToWorld([u!, v!], core.frame);
                        const hit = new Raycaster(new Vector3(x, step.y + .001, z), new Vector3(0, 1, 0), 0, 100).intersectObjects(candidates, false)[0];
                        expect(hit ? hit.distance + .001 : Infinity, `floor ${ref.index} stair-${which} at ${step.y}`).toBeGreaterThanOrEqual(STAIR.headroom - 1e-4);
                        probes++;
                    }
                }
            }
        }
        return probes;
    } finally {
        for (const geometry of geometries.values()) geometry.dispose();
        material.dispose();
    }
}

it.each([
    [2.5, 2, 7], [3, 2, 9], [4.5, 2, 13], [4.8, 2, 14],
    [5, 2, 14], [6, 4, 9], [9.8, 4, 14], [12, 6, 12],
])('fits a %sm climb using the fewest legal flights', (climb, flights, risersPerFlight) => {
    const plan = planFlights(climb!);
    expect(plan.flights).toBe(flights);
    expect(plan.risersPerFlight).toBe(risersPerFlight);
    expect(plan.rise).toBeGreaterThanOrEqual(STAIR.riser.min);
    expect(plan.rise).toBeLessThanOrEqual(STAIR.riser.max);
    expect(plan.flights * plan.risersPerFlight * plan.rise).toBeCloseTo(climb!, 10);
    expect(shaftDepthFor([climb!])).toBeGreaterThanOrEqual(shaftLength(plan.risersPerFlight));
});

it('does not interpret touching tread edges as a low overhead flight', () => {
    const slab = .32 * (5 / 28) / .17;
    const below = { u: 3.8499999999999996, v: 1.5, lu: .28000000000000025, lv: 1.45, y: 0, slab };
    const touching = { u: 3.5700000000000003, v: 1.5, lu: .2799999999999998, lv: 1.45, y: 2.5 - 5 / 28, slab };
    const overhead = { ...below, y: 2.5 };
    expect(minHeadroom([below, touching, overhead])).toBeCloseTo(2.5 - slab, 10);
    expect(minHeadroom([below, touching, overhead])).toBeGreaterThanOrEqual(STAIR.headroom);
});

it.each([2.5, 3, 4.5, 4.8, 5, 6, 9.8, 12])('generates physically checked modules for %sm storeys', async height => {
    const request = makePlacementFixture({ seed: 'variable-stair', width: 24, depth: 22, floors: 3, type: 'residential', tier: 'high_rich' });
    for (const [index, floor] of request.blueprint.floors.entries()) {
        floor.height = height;
        floor.elevation = index * height;
        floor.openings = floor.openings.filter(opening => opening.kind !== 'window')
            .map(opening => ({ ...opening, height: Math.min(opening.height, height - .15) }));
    }
    const result = await generate(request);
    const fit = coreFeasibility(request.blueprint, request.building.type);
    expect(fit.fits).toBe(true);
    expect(result.building.corePlacement).toEqual(fit.placement);
    const plan = planFlights(height);
    const flights = result.layouts.ground!.placements.filter(placement => placement.connector === 'stair-a' && placement.module?.startsWith('stair-flight-'));
    expect(flights).toHaveLength(plan.flights);
    expect(flights.every(flight => flight.module === `stair-flight-${plan.risersPerFlight}`)).toBe(true);
    if (height === 2.5) expect(checkStackedGeometry(request, result)).toBeGreaterThan(200);
});

it('pairs the real 5m white-grid podium with its 4.5m upper floors', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = await exterior.generate({
        seed: 'paired:white-grid', buildingId: 'variable-stair-white', theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [32.5, 0], [32.5, 17.5], [0, 17.5]], accessPoint: [0, 8.75], maxHeight: 38.5 },
        building: { type: 'residential', tier: 'high_rich', floors: 7 },
        options: { architecture: 'white-grid', glb: 'merged' },
    }, { textures: { mode: 'keys' } });
    const request: InteriorRequest = { seed: blueprint.seed, building: { id: blueprint.buildingId, type: 'residential', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' };
    const result = await generate(request);
    expect(blueprint.floors.map((floor: { height: number }) => floor.height)).toEqual([5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5]);
    expect(result.building.floors).toHaveLength(7);
    expect(result.building.corePlacement).toEqual(coreFeasibility(blueprint, 'residential').placement);
    for (const [layout, treads] of [[result.layouts.ground!, 14], [result.layouts.middle!, 13]] as const) {
        const flights = layout.placements.filter(placement => placement.connector === 'stair-a' && placement.module?.startsWith('stair-flight-'));
        expect(flights.map(flight => flight.module)).toEqual([`stair-flight-${treads}`, `stair-flight-${treads}`]);
    }
    expect(checkStackedGeometry(request, result)).toBeGreaterThan(1000);
});
