import { beforeAll, expect, it } from 'vitest';
import { Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { BATHROOM_WALL_CLEARANCE, fitBathroomRecipe } from '../src/layout/bathroom-recipe.js';
import { createRng } from '../src/core/rng.js';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import type { EdgeName, PlanRoom } from '../src/layout/plan-types.js';
import type { UvFloorData } from '../src/layout/plan-floor.js';
import { makeFrame, uvRectCenter, uvToWorld } from '../src/layout/uv.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import { buildModules } from '../src/modules/index.js';
import { FINISH } from '../src/modules/finishes.js';
import { props } from '../src/placements/props.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import type { Family } from '../src/placements/finish.js';
import { loadTheme } from '../src/materials/load.js';

const sizes = { toilet: [.4, .65, .75], sink: [.5, .45, .85], shower: [.9, .9, 2] } as Record<'toilet' | 'sink' | 'shower', [number, number, number]>;
const room: PlanRoom = { id: 'bathroom', kind: 'bathroom', rect: { u: 0, v: 0, lu: 7, lv: 7 }, doors: [] };

it.each(['v0', 'u0', 'v1', 'u1'] as EdgeName[])('faces real bowls toward usable space on wall %s, including rotated building frames', edge => {
  const inset = BATHROOM_WALL_CLEARANCE + .01;
  const recipes = fitBathroomRecipe(room, sizes, createRng(41), fp => {
    const back = edge === 'v0' ? fp.v : edge === 'v1' ? 7 - fp.v - fp.lv : edge === 'u0' ? fp.u : 7 - fp.u - fp.lu;
    return Math.abs(back - inset) < 1e-7;
  }, fp => roomCoversRect(room, fp))!;
  expect(recipes.map(p => p.kind).sort()).toEqual(['shower', 'sink', 'toilet']);
  for (const item of recipes) for (const degrees of [0, 37, 90, 143, 271]) {
    const frame = makeFrame(degrees), center = uvToWorld(uvRectCenter(item.footprint), frame);
    const operation = uvToWorld(uvRectCenter(item.operation), frame);
    const inward = new Vector3(operation[0] - center[0], 0, operation[1] - center[1]).normalize();
    const worldYaw = (item.rotationDeg - degrees) * Math.PI / 180;
    const front = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), worldYaw);
    expect(front.dot(inward), `${item.kind} on ${edge} in ${degrees} degree building`).toBeCloseTo(1, 8);
  }
});

it.each(['luxury', 'capsule', 'damaged', 'industrial'] as Family[])('publishes sanitary modules, retaining fixture identities and transforms in %s interiors', family => {
  const furniture: Furniture[] = [
    { id: 'wc', kind: 'toilet', room: room.id, position: [3, 4], size: sizes.toilet, rotationDeg: 53 },
    { id: 'basin', kind: 'sink', room: room.id, position: [5, 6], size: sizes.sink, rotationDeg: 233 },
  ];
  // props consumes only these layout fields; independent of unrelated stair/room planning.
  const floor = { furniture: structuredClone(furniture), lights: [] } as unknown as FloorInterior;
  const uv: UvFloorData = { outline: [], rooms: [room], sealed: [], carpets: [],
    furniture: furniture.map(f => ({ ...f, at: f.position, rotationDeg: 0 as const })) };
  const builder = new PlacementBuilder();
  props(builder, floor, uv, family, { present: new Set(), missing: new Set() });
  expect(builder.placements.map(p => p.module)).toEqual(['fit-toilet', family === 'luxury' ? 'fit-basin' : family === 'damaged' ? 'fit-basin-worn' : 'fit-basin-steel']);
  expect(floor.furniture).toEqual(furniture);
  for (const [i, placement] of builder.placements.entries()) {
    expect(placement.id).toBe(furniture[i]!.id);
    expect(placement.scale).toEqual([1, 1, 1]);
    expect(placement.rotationY).toBeCloseTo(furniture[i]!.rotationDeg * Math.PI / 180, 8);
    expect(placement.prop).toBeUndefined();
  }
});

let modules: Awaited<ReturnType<typeof buildModules>>;
beforeAll(async () => { modules = await buildModules(); }, 30000);

it('exports open recessed bowls, rounded normals and rear cisterns in the compressed shared GLBs', async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const id of ['fit-toilet', 'fit-basin', 'fit-basin-steel', 'fit-basin-worn']) {
    const entry = modules.catalog.modules.find(m => m.id === id)!;
    const bytes = modules.files.get(entry.file)!;
    const scene = (await loader.parseAsync(new Uint8Array(bytes).buffer, '')).scene;
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    scene.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
    const top = (x: number, z: number): number => {
      const hit = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0)).intersectObjects(meshes, false)[0];
      expect(hit, `${id} surface at ${x}/${z}`).toBeDefined();
      return hit!.point.y;
    };
    if (id === 'fit-toilet') {
      expect(top(.018, .07)).toBeLessThan(.3);
      expect(top(.174, .064)).toBeGreaterThan(.45);
      expect(top(.045, -.225)).toBeGreaterThan(.73);
      expect(top(.045, .245)).toBeLessThan(.47);
      expect(entry.size[0]).toBeLessThanOrEqual(sizes.toilet[0]);
      expect(entry.size[2]).toBeLessThanOrEqual(sizes.toilet[1]);
    } else {
      expect(top(.013, .046)).toBeLessThan(.74);
      expect(top(.224, .026)).toBeGreaterThan(.84);
      expect(entry.size[0]).toBeLessThanOrEqual(sizes.sink[0]);
      expect(entry.size[2]).toBeLessThanOrEqual(sizes.sink[1]);
    }
    expect(entry.materialSlots).toContain(FINISH.ceramic);
    expect(entry.materialSlots).toContain(FINISH.chrome);
    expect(entry.triangles).toBeLessThan(4000);
    // One reusable fixture stays smaller than the previous 187 KB imported toilet.
    expect(entry.bytes).toBeLessThan(150000);
    const ceramic = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name.includes('/interior-ceramic/'))!;
    const normal = ceramic.geometry.getAttribute('normal');
    let curved = 0;
    for (let i = 0; i < normal.count; i++) {
      const n = new Vector3().fromBufferAttribute(normal, i);
      expect(n.length()).toBeCloseTo(1, 2);
      if (Math.abs(n.x) > .1 && Math.abs(n.y) > .1 && Math.abs(n.z) > .1) curved++;
    }
    expect(curved).toBeGreaterThan(100);
  }
});

it('resolves a smooth nonmetallic glazed ceramic finish from the shared material catalog', () => {
  const theme = loadTheme('cyberpunk');
  if (!theme) return; // Standalone module publishing also supports keys without the sibling repository.
  const entry = theme.library.entry(FINISH.ceramic.split('#')[0]!)!;
  expect(entry.physical?.metallicFactor).toBe(0);
  expect(entry.physical?.roughnessFactor).toBeGreaterThan(.1);
  expect(entry.physical?.roughnessFactor).toBeLessThan(.3);
  expect(entry.variants.some(v => v.id === 'glaze')).toBe(true);
});
