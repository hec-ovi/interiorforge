import { BoxGeometry, Group, InstancedBufferAttribute, Mesh, InstancedMesh, Matrix4, Material, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { moduleRecipes } from '../../modules/recipes.js';
import { MODULE_THEME, slotAlignment, tileScale } from '../../modules/index.js';
import { loadAssetCatalog } from '../../assets/catalog.js';
import { readBundledAssetModel } from '../../assets/bundled.js';
import { createDocument, writeGlb } from '../../glb/io.js';
import { applyMaterials, MaterialLibrary, type ThemeIndex } from '../../materials/index.js';
import type { PlacementResult } from '../../placements/types.js';
import type { AssetEntry } from '../../assets/types.js';

/** The materials database, served by the preview at this route. */
const MATERIALS_URL = '/materials/themes';
/** A lit diffuser reads as a light source, not a bright surface. */
const DIFFUSER_EMISSIVE = 6;

/** Every map coordinate of one instance takes that placement's published repeat, so a
 *  fitted piece wears its map at the size the material publishes however wide it stands. */
const REPEAT_UV = ["MAP", "NORMALMAP", "ROUGHNESSMAP", "METALNESSMAP", "AOMAP", "EMISSIVEMAP", "ALPHAMAP"]
  .map((map) => {
    const varying = `v${map[0]}${map.slice(1).toLowerCase().replace("map", "Map")}Uv`;
    return `#ifdef USE_${map}\n\t${varying} *= aUvRepeat;\n#endif`;
  }).join("\n");

/** Each source material's repeating copy, made once and shared by every scene drawing it. */
const repeated = new WeakMap<Material, Material>();

function repeating(material: Material | Material[]): Material {
  const source = Array.isArray(material) ? material[0]! : material;
  let one = repeated.get(source);
  if (!one) {
    one = source.clone();
    one.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute vec2 aUvRepeat;\n${shader.vertexShader}`
        .replace("#include <uv_vertex>", `#include <uv_vertex>\n${REPEAT_UV}`);
    };
    one.customProgramCacheKey = () => "uvRepeat";
    repeated.set(source, one);
  }
  return one;
}

let shared: Promise<Map<string, Group>> | undefined;

/** Every shared module, dressed in its published maps when the materials route answers. */
async function moduleScenes(): Promise<Map<string, Group>> {
    const theme = await fetch(`${MATERIALS_URL}/${MODULE_THEME}/theme.json`).then(r => r.ok ? r.json() as Promise<ThemeIndex> : null).catch(() => null);
    const library = theme ? new MaterialLibrary(theme) : null;
    const loader = new GLTFLoader(), scenes = new Map<string, Group>();
    for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme))) {
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

const PLACEHOLDER = new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9, transparent: true, opacity: 0.5 });

/** A catalog model the preview cannot read stands as its fitted box: centred, grounded,
 *  half clear. */
function placeholder([width, depth, height]: [number, number, number]): Group {
    return new Group().add(new Mesh(new BoxGeometry(width, height, depth).translate(0, height / 2, 0), PLACEHOLDER));
}

/** How a placed prop draws: its model, its fitted box when the model cannot be read, or
 *  nothing when the catalog gives it no size either. */
type PropSource = { scene: Group; boxed: boolean } | null;
/** Every prop the preview has drawn, loaded once per session. */
const props = new Map<string, Promise<PropSource>>();

async function loadProp(asset: AssetEntry | undefined): Promise<PropSource> {
    if (!asset) return null;
    try {
        const bytes = await writeGlb(await readBundledAssetModel(asset));
        return { scene: (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene, boxed: false };
    }
    catch {
        return asset.dimensionsMeters ? { scene: placeholder(asset.dimensionsMeters), boxed: true } : null;
    }
}

/** The building's instances, the placed props drawn as boxes because their model is absent,
 *  and those not drawn at all. Sources and their materials stay shared between scenes, so a
 *  scene owns only its instances: `releaseScene` frees them. */
export async function placementScene(result: PlacementResult): Promise<{ group: Group; boxed: string[]; undrawn: string[] }> {
    const modules = await (shared ??= moduleScenes()), sources = new Map(modules), catalog = loadAssetCatalog();
    const ids = [...new Set(Object.values(result.layouts).flatMap(l => l.placements.flatMap(p => p.prop ? [p.prop] : [])))].sort();
    const loaded = await Promise.all(ids.map(id => {
        let prop = props.get(id);
        if (!prop) props.set(id, prop = loadProp(catalog.assets.find(a => a.id === id)));
        return prop;
    }));
    const boxed: string[] = [], undrawn: string[] = [];
    ids.forEach((id, i) => {
        const source = loaded[i];
        if (!source) undrawn.push(id);
        else {
            sources.set(id, source.scene);
            if (source.boxed) boxed.push(id);
        }
    });
    const matrices = new Map<string, { matrix: Matrix4; repeat: [number, number] }[]>(), axis = new Vector3(0, 1, 0);
    for (const floor of result.building.floors)
        for (const p of [...result.layouts[floor.layout]!.placements, ...(floor.treatments ?? [])]) {
            const id = p.module ?? p.prop!, items = matrices.get(id) ?? [];
            items.push({ matrix: new Matrix4().compose(new Vector3(p.position[0], p.position[1] + floor.elevation, p.position[2]), new Quaternion().setFromAxisAngle(axis, p.rotationY), new Vector3(...p.scale)), repeat: p.uvRepeat ?? [1, 1] });
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
            const instance = new InstancedMesh(node.geometry, repeating(node.material), items.length);
            const repeats = new Float32Array(items.length * 2);
            items.forEach((item, i) => {
                instance.setMatrixAt(i, item.matrix.clone().multiply(node.matrixWorld));
                repeats.set(item.repeat, i * 2);
            });
            instance.instanceMatrix.needsUpdate = true;
            instance.geometry = instance.geometry.clone();
            instance.geometry.setAttribute('aUvRepeat', new InstancedBufferAttribute(repeats, 2));
            group.add(instance);
        });
    }
    return { group, boxed, undrawn };
}

/** Frees the GPU buffers one placementScene group owns: its instances and their geometry copies. */
export function releaseScene(group: Group): void {
    group.traverse(node => {
        if (!(node instanceof InstancedMesh)) return;
        node.geometry.dispose();
        node.dispose();
    });
}
