import { Group, Mesh, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { moduleRecipes } from '../../modules/recipes.js';
import { MODULE_THEME, tileScale } from '../../modules/index.js';
import { loadAssetCatalog } from '../../assets/catalog.js';
import { readBundledAssetModel } from '../../assets/bundled.js';
import { createDocument, writeGlb } from '../../glb/io.js';
import { applyMaterials, MaterialLibrary, type ThemeIndex } from '../../materials/index.js';
import type { PlacementResult } from '../../placements/types.js';

/** The materials database, served by the preview at this route. */
const MATERIALS_URL = '/materials/themes';
/** A lit diffuser reads as a light source, not a bright surface. */
const DIFFUSER_EMISSIVE = 6;

let shared: Promise<Map<string, Group>> | undefined;

/** Every shared module, dressed in its published maps when the materials route answers. */
async function moduleScenes(): Promise<Map<string, Group>> {
    const theme = await fetch(`${MATERIALS_URL}/${MODULE_THEME}/theme.json`).then(r => r.ok ? r.json() as Promise<ThemeIndex> : null).catch(() => null);
    const library = theme ? new MaterialLibrary(theme) : null;
    const loader = new GLTFLoader(), scenes = new Map<string, Group>();
    for (const recipe of moduleRecipes(tileScale(theme))) {
        const doc = createDocument(recipe.mesh);
        if (library) applyMaterials(doc, library, { baseUrl: `${MATERIALS_URL}/${MODULE_THEME}`, embed: false, readMap: () => new Uint8Array() });
        const scene = (await loader.parseAsync(new Uint8Array(await writeGlb(doc)).buffer, '')).scene;
        scene.traverse(node => {
            const material = (node as Mesh).material as MeshStandardMaterial | undefined;
            if (material?.name?.includes('/light-fixture/') || material?.name?.includes('/interior-led-')) material.emissiveIntensity = DIFFUSER_EMISSIVE;
        });
        scenes.set(recipe.id, scene);
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
