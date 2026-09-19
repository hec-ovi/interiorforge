import { Group, Mesh, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { buildModules } from '../../modules/index.js';
import { loadAssetCatalog } from '../../assets/catalog.js';
import { readBundledAssetModel } from '../../assets/bundled.js';
import { writeGlb } from '../../glb/io.js';
import type { PlacementResult } from '../../placements/types.js';
let shared: Promise<Map<string, Group>> | undefined;
async function moduleScenes(): Promise<Map<string, Group>> {
    const kit = await buildModules(), loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), scenes = new Map<string, Group>();
    for (const entry of kit.catalog.modules) {
        const data = kit.files.get(entry.file)!;
        scenes.set(entry.id, (await loader.parseAsync(new Uint8Array(data).buffer, '')).scene);
    }
    return scenes;
}
export async function placementScene(result: PlacementResult): Promise<Group> {
    const modules = await (shared ??= moduleScenes()), sources = new Map(modules), catalog = loadAssetCatalog(), loader = new GLTFLoader();
    const ids = [...new Set(Object.values(result.layouts).flatMap(l => l.placements.flatMap(p => p.prop ? [p.prop] : [])))];
    for (const id of ids) {
        const asset = catalog.assets.find(a => a.id === id)!;
        try {
            const bytes = await writeGlb(await readBundledAssetModel(asset));
            sources.set(id, (await loader.parseAsync(new Uint8Array(bytes).buffer, '')).scene);
        }
        catch { /* The catalog declares local assets; the city resource pack supplies them. */ }
    }
    const matrices = new Map<string, Matrix4[]>(), axis = new Vector3(0, 1, 0);
    for (const floor of result.building.floors)
        for (const p of [...result.layouts[floor.layout]!.placements, ...(floor.treatments ?? [])]) {
            const id = p.module ?? p.prop!, items = matrices.get(id) ?? [];
            items.push(new Matrix4().compose(new Vector3(p.position[0], p.position[1] + floor.elevation, p.position[2]), new Quaternion().setFromAxisAngle(axis, p.rotationY), new Vector3(...p.scale)));
            matrices.set(id, items);
        }
    const group = new Group();
    for (const [id, items] of matrices) {
        const source = sources.get(id);
        if (!source)
            continue;
        source.updateMatrixWorld(true);
        source.traverse(node => {
            if (!(node instanceof Mesh))
                return;
            const instance = new InstancedMesh(node.geometry, node.material, items.length);
            items.forEach((matrix, i) => instance.setMatrixAt(i, matrix.clone().multiply(node.matrixWorld)));
            instance.instanceMatrix.needsUpdate = true;
            group.add(instance);
        });
    }
    return group;
}
