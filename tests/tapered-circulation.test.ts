import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate, expandBuilding, findPath } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';

it('closes a tapered-floor door into a thin leftover and preserves the useful replacement doorway', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = await exterior.generate({ seed: 'paired:garden-taper', buildingId: 'garden-access', theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [52, 0], [52, 42], [0, 42]], accessPoint: [0, 21], maxHeight: 22 },
        building: { type: 'residential', tier: 'high_rich', floors: 4 }, options: { architecture: 'garden-taper', glb: 'merged' } },
        { textures: { mode: 'keys' } });
    const result = await generate({ seed: blueprint.seed, building: { id: 'garden-access', type: 'residential', tier: 'high_rich' },
        blueprint, materialTheme: 'cyberpunk' });
    expect(result.building.floors).toHaveLength(4);
    const crown = result.layouts.crown!;
    expect(crown.floor.rooms.filter(room => room.kind === 'studio_main')).toHaveLength(2);
    expect(crown.floor.rooms.filter(room => room.kind === 'bathroom')).toHaveLength(2);
    // This old door faced a 305 mm strip; it must disappear from both navigation and walls.
    const oldPosition = [15.805, 34.5];
    expect(crown.floor.rooms.flatMap(room => room.doors).some(door =>
        Math.hypot(door.position[0] - oldPosition[0]!, door.position[1] - oldPosition[1]!) < .001)).toBe(false);
    const unit = crown.floor.rooms.find(room => room.kind === 'studio_main'
        && room.polygon.some(([x, z]) => x > 30 && z > 35))!;
    const useful = unit.doors.find(door => door.position[0] === 32 && door.position[1] === 27.1)!;
    expect(useful).toBeDefined();
    expect(crown.floor.rooms.find(room => room.id === useful.to)?.kind).toBe('lounge');
    const expanded = expandBuilding(result);
    const route = findPath(expanded.npc, { floor: 3, position: [32, 26.4] }, { floor: 3, position: [32, 27.8] });
    expect(route).not.toBeNull();

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
    try {
        const walls = crown.placements.filter(p => p.module && /^(wall-|door-)/.test(p.module)).map(p => {
            const mesh = new Mesh(geometries.get(p.module!)!, material);
            mesh.position.fromArray(p.position); mesh.rotation.y = p.rotationY; mesh.scale.fromArray(p.scale); mesh.updateMatrixWorld();
            return mesh;
        });
        for (const height of [.4, 1.2, 2]) {
            const closed = new Raycaster(new Vector3(15.605, height, 34.5), new Vector3(1, 0, 0), 0, .4).intersectObjects(walls, false);
            expect(closed.length, `old doorway wall at height ${height}`).toBeGreaterThan(0);
            for (const offset of [-.3, 0, .3]) {
                const open = new Raycaster(new Vector3(32 + offset, height, 26.9), new Vector3(0, 0, 1), 0, .4).intersectObjects(walls, false);
                expect(open, `replacement doorway body clearance at ${offset}/${height}`).toHaveLength(0);
            }
        }
    } finally { for (const geometry of geometries.values()) geometry.dispose(); material.dispose(); }
}, 30_000);
