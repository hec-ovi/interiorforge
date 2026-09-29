import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { generate } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { polygonArea } from '../src/core/geom.js';

it('gives the translated 40m balcony building a glazed residential arrival, equipped support rooms and wall-backed art', async () => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await exterior({ buildingId: 'p0', seed: 'luxury-reference-review',
    parcel: { footprint: [[81.5, 34], [121.5, 34], [121.5, 74], [81.5, 74]], accessPoint: [101.5, 34], maxHeight: 31.5,
      buildingGrid: { origin: [81.5, 34], angle: 0, spacing: .5 } },
    building: { type: 'residential', tier: 'high_rich', floors: 6 }, theme: 'cyberpunk',
    options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
  const result = await generate({ seed: 'luxury-reference-review', building: { id: 'p0', type: 'residential', tier: 'high_rich' },
    blueprint, materialTheme: 'cyberpunk' });
  const ground = result.layouts.ground!;
  const rooms = ground.floor.rooms;
  const reception = rooms.find(room => room.kind === 'reception')!;
  const area = (room: typeof reception) => Math.abs(polygonArea(room.polygon))
    - (room.holes ?? []).reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0);
  expect(area(reception)).toBeLessThan(350);
  expect(area(reception)).toBeGreaterThan(100);
  const lounges = rooms.filter(room => room.kind === 'lounge');
  expect(lounges).toHaveLength(2);
  expect(lounges.every(room => area(room) >= 70)).toBe(true);
  for (const lounge of lounges) {
    expect(lounge.doors.some(door => door.to === reception.id && door.width >= 2.4)).toBe(true);
    expect(ground.floor.furniture.some(piece => piece.room === lounge.id && piece.kind === 'sofa')).toBe(true);
    expect(ground.placements.some(piece => piece.room === lounge.id && piece.module === 'wall-panel-field-glass')).toBe(true);
  }
  const expected = { reception: 'reception_desk', office_private: 'desk', kitchen: 'kitchen_block',
    storage: 'shelf', toilets: 'toilet', meeting: 'meeting_table' } as const;
  for (const [kind, furniture] of Object.entries(expected)) {
    const owners = rooms.filter(room => room.kind === kind);
    expect(owners.length, kind).toBeGreaterThan(0);
    expect(ground.floor.furniture.some(piece => owners.some(room => room.id === piece.room) && piece.kind === furniture), kind).toBe(true);
  }
  expect(rooms.every(room => room.unit === undefined)).toBe(true);
  expect(reception.doors.some(door => rooms.find(room => room.id === door.to)?.kind === 'corridor' && door.width >= 3)).toBe(true);

  const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
  const geometries = new Map<string, BufferGeometry>();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const walls = ground.placements.filter(piece => piece.module?.startsWith('wall-') && !piece.module.includes('glass'))
    .map(piece => {
      let geometry = geometries.get(piece.module!);
      if (!geometry) {
        const recipe = recipes.get(piece.module!)!, positions: number[] = [], indices: number[] = [];
        for (const slot of recipe.mesh.materials()) {
          const group = recipe.mesh.getGroup(slot)!, base = positions.length / 3;
          positions.push(...group.positions); indices.push(...group.indices.map(index => index + base));
        }
        geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices); geometries.set(piece.module!, geometry);
      }
      const mesh = new Mesh(geometry, material);
      mesh.position.fromArray(piece.position); mesh.rotation.y = piece.rotationY; mesh.scale.fromArray(piece.scale); mesh.updateMatrixWorld();
      return mesh;
    });
  try {
    const mounted = ground.floor.furniture.filter(piece => ['wall_art', 'wall_shelf', 'display_screen', 'ornament_wall'].includes(piece.kind));
    expect(mounted.length).toBeGreaterThan(0);
    for (const piece of mounted) {
      const angle = piece.rotationDeg * Math.PI / 180, forward = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      const start = new Vector3(piece.position[0], (piece.elevation ?? 0) + piece.size[2] / 2, piece.position[1])
        .addScaledVector(forward, -piece.size[1] / 2 - .005);
      const hits = new Raycaster(start, forward.clone().negate(), 0, .16).intersectObjects(walls, false);
      expect(hits.length, `${piece.id}/${piece.kind} needs an emitted opaque wall behind its back`).toBeGreaterThan(0);
    }
  } finally { for (const geometry of geometries.values()) geometry.dispose(); material.dispose(); }
}, 180_000);
