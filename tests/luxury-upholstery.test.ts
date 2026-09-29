import { beforeAll, expect, it } from 'vitest';
import { FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { buildModules } from '../src/modules/index.js';

// Import the unchanged consumer path, including normalized GLB position decoding.
const engineUrl = (file: string) => new URL(`../../engine/src/game/${file}`, import.meta.url).href;
let built: Awaited<ReturnType<typeof buildModules>>;
beforeAll(async () => { built = await buildModules({ theme: null }); }, 120000);

async function uploaded(id: string): Promise<Mesh[]> {
  const { cityGltfLoader } = await import(engineUrl('data/CityGltfLoader.js'));
  const { bake } = await import(engineUrl('city/GeometryBake.js'));
  const bytes = built.files.get(`${id}.glb`)!;
  const { scene } = await cityGltfLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse((node: Mesh) => {
    if (!node.isMesh) return;
    const original = Array.isArray(node.material) ? node.material[0]! : node.material;
    expect(original.side, `${id} must survive normal face culling`).toBe(FrontSide);
    const material = new MeshBasicMaterial({ side: FrontSide }); material.name = original.name;
    const mesh = new Mesh(bake(node), material); mesh.updateMatrixWorld(true); meshes.push(mesh);
  });
  return meshes;
}

/** Quantized/welded GLBs may split a geometric vertex for UVs and hard normals.
 * Weld only for topology, then each closed edge must occur twice in opposite directions. */
function expectClosed(geometry: BufferGeometry, label: string): void {
  const position = geometry.getAttribute('position');
  const edges = new Map<string, { count: number; balance: number }>();
  const key = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
    .map(value => Math.round(value * 10000)).join(',');
  const indexAt = (i: number) => geometry.index ? geometry.index.getX(i) : i;
  const count = geometry.index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const points = [key(indexAt(i)), key(indexAt(i + 1)), key(indexAt(i + 2))];
    for (let side = 0; side < 3; side++) {
      const a = points[side]!, b = points[(side + 1) % 3]!;
      if (a === b) continue;
      const edge = a < b ? `${a}/${b}` : `${b}/${a}`;
      const old = edges.get(edge) ?? { count: 0, balance: 0 };
      old.count++; old.balance += a < b ? 1 : -1; edges.set(edge, old);
    }
  }
  const defects = [...edges].filter(([, edge]) => edge.count !== 2 || edge.balance !== 0);
  expect(defects.slice(0, 12), `${label}: unsealed or reversed face edges`).toEqual([]);
}

it.each(['fit-sofa-luxury', 'fit-chair-luxury', 'fit-sofa-corpo', 'fit-chair-corpo', 'fit-bed-luxury'])('%s exports closed outward upholstery through actual engine GLB loading', async id => {
  const meshes = await uploaded(id);
  try {
    const upholstery = meshes.filter(mesh => /fabric|upholstery|bedding|leather/.test((mesh.material as MeshBasicMaterial).name));
    expect(upholstery.length).toBeGreaterThan(0);
    for (const mesh of upholstery) expectClosed(mesh.geometry, `${id}/${(mesh.material as MeshBasicMaterial).name}`);
  } finally { for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); } }
});

it('has rounded opaque seat edges, filled backs and a .49m actor support surface', async () => {
  for (const [id, seats] of [
    ['fit-chair-luxury', [{ x: 0, y: .365, z: .04, w: .55, h: .125, d: .60 }]],
    ['fit-sofa-luxury', [-.79, 0, .79].map(x => ({ x, y: .355, z: .075, w: .765, h: .135, d: .72 }))],
  ] as const) {
    const meshes = await uploaded(id);
    const ray = (origin: number[], dir: number[], far: number) => new Raycaster(new Vector3().fromArray(origin), new Vector3().fromArray(dir).normalize(), 0, far).intersectObjects(meshes, false)[0];
    try {
      for (const seat of seats) {
        // Across each exposed front edge the rolled upholstery remains opaque and
        // upward-facing. The crown may compress at the sewn perimeter.
        for (const x of [-seat.w * .35, 0, seat.w * .35]) {
          const hit = ray([seat.x + x, .60, seat.z + seat.d / 2 - .025], [0, -1, 0], .20);
          expect(hit, `${id} filled front edge`).toBeDefined();
          expect(hit!.point.y).toBeGreaterThan(.445);
          expect(hit!.face!.normal.y).toBeGreaterThan(.2);
        }
      }
      const support = id === 'fit-chair-luxury' ? [0, .495, -.25] : [0, .475, -.30];
      expect(ray(support, [0, 0, -1], .21), `${id} has a continuous supporting back`).toBeDefined();
      const seat = ray([.01, .7, .10], [0, -1, 0], .25)!;
      expect(seat.point.y, `${id} actor support`).toBeCloseTo(.49, 3);
      const upholstery = meshes.filter(mesh => /fabric|upholstery/.test((mesh.material as MeshBasicMaterial).name));
      const curved = upholstery.flatMap(mesh => {
        const normals = mesh.geometry.getAttribute('normal'); let count = 0;
        for (let i = 0; i < normals.count; i++) {
          if (Math.abs(normals.getY(i)) > .15 && Math.abs(normals.getY(i)) < .98) count++;
        }
        return count;
      }).reduce((a, b) => a + b, 0);
      expect(curved, `${id} has smooth three-dimensional upholstery shading`).toBeGreaterThan(500);
    } finally { for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); } }
  }
});

it('keeps the kitchen basin open to its drain below the stone counter', async () => {
  const meshes = await uploaded('fit-kitchen-run-luxury');
  try {
    for (const [x, z] of [[.65, .015], [.55, .065], [.75, -.055]]) {
      const hit = new Raycaster(new Vector3(x, 1.3, z), new Vector3(0, -1, 0), 0, .6).intersectObjects(meshes, false)[0]!;
      expect(hit, 'sink has an opaque bottom').toBeDefined();
      expect(hit.point.y, 'neither counter nor cabinet blocks the recessed bowl').toBeLessThan(.83);
      expect(hit.point.y).toBeGreaterThan(.80);
    }
  } finally { for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); } }
});

it('keeps the rumpled cover above its mattress and deliberately reveals white sheet on the right', async () => {
  const meshes = await uploaded('fit-bed-luxury');
  const hitAt=(x:number,z:number)=>new Raycaster(new Vector3(x,.8,z),new Vector3(0,-1,0),0,.6).intersectObjects(meshes,false)[0]!;
  try {
    for(const x of[-.86,-.6,0,.6,.86])for(const z of[.65,.9,1.04]){
      const hit=hitAt(x,z);expect(hit,`covered bed ${x}/${z}`).toBeDefined();
      expect(((hit.object as Mesh).material as MeshBasicMaterial).name).toContain('corpo-plaza-bedding');
    }
    const exposed=hitAt(.60,-.30);
    expect(((exposed.object as Mesh).material as MeshBasicMaterial).name).toContain('meridian-bedding');
    expect(exposed.point.y).toBeGreaterThan(.47);
    // The sheet must roll down onto the rounded shoulder instead of hovering
    // at the full mattress crown and drawing a loose dark edge in side views.
    const shoulder=hitAt(.892,-.30);
    expect(shoulder.point.y).toBeLessThan(.463);
    expect(shoulder.point.y).toBeGreaterThan(.435);
  } finally {for(const mesh of meshes){mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();}}
});
