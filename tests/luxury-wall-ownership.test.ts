import { beforeAll, expect, it } from 'vitest';
import { FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildModules } from '../src/modules/index.js';

const engineUrl = (file: string) => new URL(`../../engine/src/game/${file}`, import.meta.url).href;
let built: Awaited<ReturnType<typeof buildModules>>;
beforeAll(async () => { built = await buildModules({theme: null}); }, 120000);
async function meshes(id: string): Promise<Mesh[]> {
  const { cityGltfLoader } = await import(engineUrl('data/CityGltfLoader.js'));
  const { bake } = await import(engineUrl('city/GeometryBake.js'));
  const { scene } = await cityGltfLoader().parseAsync(new Uint8Array(built.files.get(`${id}.glb`)!).buffer, '');
  scene.updateMatrixWorld(true);
  const out: Mesh[] = [];
  scene.traverse((node: Mesh) => {
    if (!node.isMesh) return;
    const original = Array.isArray(node.material) ? node.material[0]! : node.material;
    const material = new MeshBasicMaterial({side: FrontSide}); material.name = original.name;
    const mesh = new Mesh(bake(node), material); mesh.scale.set(4, 6, 1); mesh.updateMatrixWorld(true); out.push(mesh);
  });
  return out;
}

it.each(['ivory', 'mineral'])('gives every exposed %s wall end/header cap exactly one visible skin after GLB quantization', async finish => {
  const objects = [...await meshes('wall-field-meridian-backing'), ...await meshes(`wall-field-meridian-${finish}`)];
  try {
    const probes: {point: number[]; direction: number[]}[] = [];
    for (const z of [.012, .043, .077, .091]) for (const tilt of [-.27, .13, .39]) {
      probes.push({point: [1, 1.37, z], direction: [1, tilt, .017]});
      probes.push({point: [-1, 1.29, z], direction: [-1, tilt, -.013]});
      probes.push({point: [.19, 3, z], direction: [tilt, 1, .017]});
      probes.push({point: [.13, 0, z], direction: [tilt, -1, -.013]});
    }
    probes.push({point: [.13, 1.37, 0], direction: [.27, .13, -1]});
    probes.push({point: [.13, 1.37, .095], direction: [.27, .13, 1]});
    for (const {point, direction} of probes) {
      const away = new Vector3().fromArray(direction).normalize();
      const origin = new Vector3().fromArray(point).addScaledVector(away, .3);
      const hits = new Raycaster(origin, away.clone().negate(), 0, .34).intersectObjects(objects, false);
      expect(hits.length, `${finish} closed at ${point}`).toBeGreaterThan(0);
      const nearest = hits.filter(hit => Math.abs(hit.distance - hits[0]!.distance) < .00005);
      expect(nearest.map(hit => ((hit.object as Mesh).material as MeshBasicMaterial).name), `${finish} competing surfaces at ${point}/${direction}`).toHaveLength(1);
    }
  } finally { for (const mesh of objects) {mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();} }
});
