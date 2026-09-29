import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import type { Room } from '../src/core/types.js';
import { makeFrame } from '../src/layout/uv.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { duplexCoveSpans, duplexFloorRegions, placeDuplexLivingFloor } from '../src/placements/duplex-finish.js';
import { walkingSlabs } from '../src/placements/thresholds.js';
import { carveApartmentPockets } from '../src/placements/apartment-pockets.js';
import { apartmentEntrances, apartmentSlots } from '../src/styles/luxury/apartment-doors.js';
import { LOFT1702_FINISH as L, placeLoft1702Wall } from '../src/styles/luxury/loft-finish.js';
import type { Placement } from '../src/placements/types.js';

const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));

it('covers each visible floor point once while preserving a continuous walked support at translated rotations', () => {
    const rect = { u: 5.2, v: -3.1, lu: 12.3, lv: 8.4 };
    const rugs = [{ u: 6.1, v: -2.2, lu: 3.4, lv: 4.1 }, { u: 8.4, v: -.8, lu: 3.2, lv: 3.1 }];
    const regions = duplexFloorRegions(rect, rugs), all = [...regions.stone, ...regions.timber];
    expect(all.reduce((sum, r) => sum + r.lu * r.lv, 0)).toBeCloseTo(rect.lu * rect.lv, 8);
    for (let i = 0; i < all.length; i++) for (const b of all.slice(i + 1)) {
        const a = all[i]!;
        expect(Math.max(0, Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u))
            * Math.max(0, Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v))).toBeLessThan(1e-8);
    }
    for (const angle of [0, 37]) {
        const builder = new PlacementBuilder(), frame = makeFrame(angle);
        placeDuplexLivingFloor(builder, 'living', rect, rugs, frame);
        expect(builder.placements.filter(p => p.module === L.floorSupport)).toHaveLength(1);
        const support = walkingSlabs(builder, frame);
        expect(support).toHaveLength(1);
        for (const key of ['u', 'v', 'lu', 'lv'] as const) expect(support[0]![key]).toBeCloseTo(rect[key], 7);
    }
});

it('does not hang a lower ceiling cove across a double-height void or cut the opposite room side', () => {
    const holes = [{ u: 2, v: 0, lu: 4, lv: 3 }, { u: 6, v: 0, lu: 2, lv: 2 }];
    expect(duplexCoveSpans(0, 10, 'H', 0, 1, holes)).toEqual([[0, 2], [8, 10]]);
    expect(duplexCoveSpans(0, 10, 'H', 0, -1, holes)).toEqual([[0, 10]]);
    expect(duplexCoveSpans(0, 5, 'V', 2, 1, holes)).toEqual([[3, 5]]);
});

it('keeps wide sliding entry travel physically empty and conceals both pockets behind actual loft wall skins', () => {
    const rooms: Room[] = [
        { id: 'corridor', kind: 'corridor', polygon: [[0, 8], [18, 8], [18, 11], [0, 11]], doors: [] },
        { id: 'living', unit: 'duplex', kind: 'living', polygon: [[0, 0], [18, 0], [18, 8], [0, 8]],
            doors: [{ id: 'entry', to: 'corridor', width: 1.6, leaves: 2, position: [9, 8], angleDeg: 0 }] },
    ];
    const door = apartmentEntrances(rooms, 1, apartmentSlots([rooms]))[0]!, builder = new PlacementBuilder();
    for (const [room, yaw] of [['corridor', 0], ['living', Math.PI]] as const) {
        for (const [a, b] of [[0, 8.12], [9.88, 18]])
            placeLoft1702Wall(builder, room, [(a! + b!) / 2, 0, 8], b! - a!, 3.2, yaw, { phase: yaw ? -b! : a! });
        placeLoft1702Wall(builder, room, [9, 2.58, 8], 1.76, .62, yaw, { phase: yaw ? -9.88 : 8.12 });
    }
    carveApartmentPockets([door], builder.placements, rooms);
    const bounds = (part: Pick<Placement, 'module' | 'position' | 'scale' | 'rotationY'>) => {
        const m = catalog.get(part.module!)!, c = Math.cos(part.rotationY), s = Math.sin(part.rotationY), points: number[][] = [];
        for (const x of [-m.origin[0], m.size[0] - m.origin[0]]) for (const y of [-m.origin[1], m.size[1] - m.origin[1]])
            for (const z of [-m.origin[2], m.size[2] - m.origin[2]]) points.push([
                part.position[0] + c * x * part.scale[0] + s * z * part.scale[2], part.position[1] + y * part.scale[1],
                part.position[2] - s * x * part.scale[0] + c * z * part.scale[2]]);
        return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]!))), max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]!))) };
    };
    const solids = builder.placements.map(bounds);
    for (const fraction of [0, .25, .5, .75, 1]) for (const [i, leaf] of door.leaves.entries()) {
        const travel = door.motion.leaves[i]!.travelU * fraction, yaw = door.leaves[0]!.rotationY;
        const box = bounds({ ...leaf, position: [leaf.position[0] + Math.cos(yaw) * travel, leaf.position[1], leaf.position[2] - Math.sin(yaw) * travel] });
        expect(solids.some(solid => [0, 1, 2].every(axis => Math.min(solid.max[axis]!, box.max[axis]!)
            - Math.max(solid.min[axis]!, box.min[axis]!) > 1e-5)), `leaf ${i} at ${fraction}`).toBe(false);
    }
    const material = new MeshBasicMaterial(), meshes: Mesh[] = [];
    for (const part of builder.placements) for (const slot of catalog.get(part.module!)!.mesh.materials()) {
        const group = catalog.get(part.module!)!.mesh.getGroup(slot)!;
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(group.positions, 3));
        geometry.setIndex(Array.from(group.indices));
        const mesh = new Mesh(geometry, material); mesh.position.fromArray(part.position); mesh.scale.fromArray(part.scale);
        mesh.rotation.y = part.rotationY; mesh.updateMatrixWorld(); meshes.push(mesh);
    }
    try {
        for (const side of [-1, 1]) for (const pocket of door.pockets) {
            const localX = (pocket.min[0] + pocket.max[0]) / 2, yaw = door.leaves[0]!.rotationY;
            const x = door.leaves[0]!.position[0] + Math.cos(yaw) * localX;
            const hits = new Raycaster(new Vector3(x, 1.2, 8 + side), new Vector3(0, 0, -side), 0, 2).intersectObjects(meshes);
            expect(hits[0], `closed wall skin from side ${side}`).toBeDefined();
            expect((hits[0]!.point.z - 8) * side).toBeGreaterThan(.04);
        }
    } finally { meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); }
});
