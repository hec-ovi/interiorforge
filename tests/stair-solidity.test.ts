import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { validateRequest, resolveAssignments } from '../src/blueprint/validate.js';
import { architectureAssignments } from '../src/architecture/recipes.js';
import { planBuilding } from '../src/layout/index.js';
import { stairAccess } from '../src/layout/core-plan.js';
import { uvToWorld } from '../src/layout/uv.js';

it('closes landing undersides, connected stair bodies and rear stairwell walls behind facade windows', async () => {
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
    const hits = (objects: Mesh[], point: number[], direction: number[], far: number) =>
        new Raycaster(new Vector3().fromArray(point), new Vector3().fromArray(direction), 0, far).intersectObjects(objects, false);
    try {
        for (const [id, geometry] of geometries) {
            const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld();
            if (id.startsWith('floor-slab-')) {
                expect(hits([mesh], [.071, -.16, .037], [0, 1, 0], .02), `${id} underside`).toHaveLength(1);
                expect(hits([mesh], [.26, -.01, .037], [-1, 0, 0], .02), `${id} finished edge`).toHaveLength(1);
            }
            if (!id.startsWith('stair-flight-')) continue;
            const count = Number(id.split('-').at(-1));
            for (let step = 0; step < count; step++) {
                expect(hits([mesh], [.573, step * .17 - .16, step * .28 + .137], [0, 1, 0], .02), `${id} soffit ${step}`).toHaveLength(1);
                if (step) expect(hits([mesh], [.573, step * .17 - .07, step * .28 - .01], [0, 0, 1], .02), `${id} internal seam ${step}`).toHaveLength(0);
            }
        }
        const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
        const { blueprint } = await exterior.generate({ seed: 'plans:balcony-grid-commercial-high_rich-5x3x33f', buildingId: 'closed-stairs', theme: 'cyberpunk',
            parcel: { footprint: [[0, 0], [20.5, 0], [20.5, 37.5], [0, 37.5]], accessPoint: [0, 18.75], maxHeight: 37.5 },
            building: { type: 'corpo', tier: 'high_rich', floors: 7 }, options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
        const request = validateRequest({ seed: blueprint.seed, building: { id: 'closed-stairs', type: 'corpo', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' });
        const result = await generate(request);
        const { core } = planBuilding(request, architectureAssignments(request, resolveAssignments(request)), new Set([0, 1, 6]));
        expect(core.stairB).toBeDefined();
        let probes = 0;
        for (const layout of Object.values(result.layouts)) for (const which of ['a', 'b'] as const) {
            const shaft = which === 'a' ? core.stairA : core.stairB!;
            const access = stairAccess(core, which);
            const meshes = layout.placements.filter(p => p.connector === `stair-${which}` && p.module?.startsWith('wall-')).map(p => {
                const mesh = new Mesh(geometries.get(p.module!)!, material);
                mesh.position.fromArray(p.position); mesh.rotation.y = p.rotationY; mesh.scale.fromArray(p.scale); mesh.updateMatrixWorld();
                return mesh;
            });
            for (const axis of ['H', 'V'] as const) for (const side of [-1, 1]) for (const t of [.17, .51, .83]) for (const y of [.43, 1.57, 4.41]) {
                const c = axis === 'H' ? shaft.v + (side > 0 ? shaft.lv : 0) : shaft.u + (side > 0 ? shaft.lu : 0);
                const along = axis === 'H' ? shaft.u + shaft.lu * t : shaft.v + shaft.lv * t;
                if (axis === access.axis && Math.abs(c - access.c) < 1e-6 && Math.abs(along - access.at) < .65 && y < 2.2) continue;
                const uv: [number, number] = axis === 'H' ? [along, c - side * .2] : [c - side * .2, along];
                const [x, z] = uvToWorld(uv, core.frame);
                const dir = axis === 'H' ? [-core.frame.sin * side, 0, core.frame.cos * side] : [core.frame.cos * side, 0, core.frame.sin * side];
                expect(hits(meshes, [x, y, z], dir, .4).length, `${layout.id} stair-${which} ${axis}/${side}/${t}/${y}`).toBeGreaterThan(0);
                probes++;
            }
        }
        expect(probes).toBeGreaterThan(150);
    } finally { for (const g of geometries.values()) g.dispose(); material.dispose(); }
});
