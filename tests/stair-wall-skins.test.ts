import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { placementRecipe } from '../src/placements/builder.js';
import { stairWallSkinId } from '../src/modules/recipes/stair-wall-skins.js';
import { publishStairSoffits } from '../src/placements/stair-soffits.js';
import type { BuildingManifest, FloorPlacement, LayoutMap, Placement } from '../src/placements/types.js';

function mesh(p: Placement, elevation: number) {
    const recipe = placementRecipe(p.module!)!, positions: number[] = [], indices: number[] = [];
    for (const material of recipe.mesh.materials()) {
        const group = recipe.mesh.getGroup(material)!, offset = positions.length / 3;
        for (const value of group.positions) positions.push(value);
        for (const value of group.indices) indices.push(value + offset);
    }
    const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    const result = new Mesh(geometry, new MeshBasicMaterial());
    result.position.set(p.position[0], p.position[1] + elevation, p.position[2]);
    result.scale.fromArray(p.scale); result.rotation.y = p.rotationY; result.updateMatrixWorld();
    return result;
}
it.each([0, 37])('keeps next-storey wall skins opaque in the lower band at %s degrees without increasing any collider', async angle => {
    const { floorBoxes } = await import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href);
    const rotationY = angle * Math.PI / 180;
    const wall: Placement = { id: 'wall', module: 'wall-field-meridian-ivory', room: 'stair-a', connector: 'stair-a',
        position: [10, 0, 20], scale: [8, 9, 1], rotationY };
    const privateWall = { ...structuredClone(wall), id: 'private', room: 'unit-duplex', connector: 'unit-duplex' };
    const layouts: LayoutMap<Pick<FloorPlacement, 'placements'>> = {
        ground: { placements: [] }, middle: { placements: [structuredClone(wall), privateWall] },
    };
    const floors: BuildingManifest['floors'] = [
        { index: 0, layout: 'ground', elevation: 0, openings: {} },
        { index: 1, layout: 'middle', elevation: 4.5, openings: {} },
    ];
    publishStairSoffits(floors, layouts);
    expect(floors[0]!.treatments).toHaveLength(1);
    const skin = floors[0]!.treatments![0]!, body = layouts.middle!.placements[0]!;
    expect(skin.module).toBe(stairWallSkinId(wall.module!));
    expect(privateWall).toEqual({ ...wall, id: 'private', room: 'unit-duplex', connector: 'unit-duplex' });
    const originalMesh = mesh(wall, 4.5), skinMesh = mesh(skin, 0), bodyMesh = mesh(body, 4.5);
    const source = placementRecipe(wall.module!)!, surface = placementRecipe(skin.module!)!;
    const front = source.size[2] - source.origin[2], back = -source.origin[2];
    expect(surface.size[2] - surface.origin[2]).toBeCloseTo(front, 6);
    expect(-surface.origin[2]).toBeGreaterThan(back);
    // Every emitted volume lies inside the original wall bounds, including yaw.
    const inverse = originalMesh.matrixWorld.clone().invert();
    for (const piece of [skinMesh, bodyMesh]) {
        const p = piece.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
            const local = new Vector3().fromBufferAttribute(p, i).applyMatrix4(piece.matrixWorld).applyMatrix4(inverse);
            expect(local.z).toBeGreaterThanOrEqual(back - 1e-7);
            expect(local.z).toBeLessThanOrEqual(front + 1e-7);
        }
    }
    const originalBox = floorBoxes([wall], 4.5, placementRecipe)[0]!;
    const boxes = [...floorBoxes([body], 4.5, placementRecipe), ...floorBoxes([skin], 0, placementRecipe)];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
        const relative = new Vector3(...box.center).sub(new Vector3(...originalBox.center))
            .applyAxisAngle(new Vector3(0, 1, 0), -rotationY);
        for (let axis = 0; axis < 3; axis++) expect(Math.abs(relative.getComponent(axis)) + box.halfExtents[axis])
            .toBeLessThanOrEqual(originalBox.halfExtents[axis] + 1e-6);
    }
    // A facing ray sees the exact existing front when only the lower band is
    // present. When that band unloads upstairs, the local backing remains opaque.
    for (const x of [-.2, 0, .2]) for (const y of [.05, .25, .45]) {
        const start = new Vector3(x, y, front + .2).applyMatrix4(originalMesh.matrixWorld);
        const direction = new Vector3(0, 0, -1).transformDirection(originalMesh.matrixWorld);
        const ray = new Raycaster(start, direction, 0, 1);
        const original = ray.intersectObject(originalMesh)[0]!, visible = ray.intersectObject(skinMesh)[0]!, backing = ray.intersectObject(bodyMesh)[0]!;
        expect(visible.distance).toBeCloseTo(original.distance, 6);
        expect(backing.distance - visible.distance).toBeCloseTo(.002, 6);
    }
    for (const m of [originalMesh, skinMesh, bodyMesh]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
});
