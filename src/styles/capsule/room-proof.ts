/** Assembled producer proof, with no Engine city or consumer source changes. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { MeshBuilder } from '../../glb/mesh-builder.js';
import { createDocument } from '../../glb/io.js';
import { moduleRecipes } from '../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../modules/index.js';
import { loadTheme } from '../../materials/load.js';
import { roomFootprintClearance } from '../../core/room-footprint.js';
import { polygonBounds } from '../../core/geom.js';
import type { Room, Furniture } from '../../core/types.js';
import type { BuildingManifest, FloorPlacement, Placement } from '../../placements/types.js';
import { CAPSULE_BUILDING_SETS } from './sets.js';

const source = resolve(process.argv[2] ?? 'out/proof/capsule-quality');
const destination = resolve(process.argv[3] ?? `${source}/units`);
await mkdir(destination, { recursive: true });
const theme = loadTheme('cyberpunk')!.library.themeIndex;
const recipes = new Map(moduleRecipes(tileScale(theme), slotAlignment(theme)).map(recipe => [recipe.id, recipe]));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const reports = [];
const selectedSet = process.argv.find(argument => argument.startsWith('--set='))?.slice(6);
for (const set of CAPSULE_BUILDING_SETS.filter(set => !selectedSet || set.id === selectedSet)) {
  const building = JSON.parse(await readFile(`${source}/${set.id}/building.json`, 'utf8')) as BuildingManifest;
  const ref = building.floors.find(ref => ref.index === 1)!;
  const layout = JSON.parse(await readFile(`${source}/${set.id}/layouts/${ref.layout}.json`, 'utf8')) as FloorPlacement;
  const unit = layout.floor.rooms.find(room => room.unit)!.unit!;
  const rooms = layout.floor.rooms.filter(room => room.unit === unit), ids = new Set(rooms.map(room => room.id));
  const furniture = layout.floor.furniture.filter(item => ids.has(item.room));
  const mesh = new MeshBuilder();
  const placements = [...layout.placements, ...(ref.treatments ?? [])].filter(placement => ids.has(placement.room));
  const entrance = ref.apartmentEntrances?.find(door => door.unit === unit);
  for (const placement of [...placements, ...(entrance?.fixed ?? []), ...(entrance?.leaves ?? [])]) {
    if (!placement.module) continue;
    const recipe = recipes.get(placement.module);
    if (!recipe) throw new Error(`Missing module ${placement.module}`);
    const c = Math.cos(placement.rotationY), s = Math.sin(placement.rotationY);
    const repeat = (placement as Placement).uvRepeat ?? [1, 1];
    for (const slot of recipe.mesh.materials()) {
      const group = recipe.mesh.getGroup(slot)!, positions: number[] = [], normals: number[] = [];
      for (let i = 0; i < group.positions.length; i += 3) {
        const x = group.positions[i]! * placement.scale[0], y = group.positions[i + 1]! * placement.scale[1], z = group.positions[i + 2]! * placement.scale[2];
        positions.push(x * c + z * s + placement.position[0], y + placement.position[1], z * c - x * s + placement.position[2]);
        const nx = group.normals[i]! / placement.scale[0], ny = group.normals[i + 1]! / placement.scale[1], nz = group.normals[i + 2]! / placement.scale[2];
        const length = Math.hypot(nx, ny, nz) || 1;
        normals.push((nx * c + nz * s) / length, ny / length, (nz * c - nx * s) / length);
      }
      mesh.addSurface(slot, { positions, normals, indices: group.indices,
        uvs: Array.from(group.uvs, (value, index) => value * repeat[index % 2]!) });
    }
  }
  const doc = createDocument(mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
  const bytes = await io.writeBinary(doc);
  await writeFile(`${destination}/${set.id}.glb`, bytes);
  const views = rooms.flatMap(room => roomViews(room, furniture));
  reports.push({ set: set.id, interiorStyle: set.interiorStyle, unit, rooms: rooms.map(room => ({ id: room.id, kind: room.kind })),
    glb: `${set.id}.glb`, bytes: bytes.length, views, lights: layout.floor.lights.filter(light => ids.has(light.room)) });
}
await writeFile(`${destination}/units.json`, JSON.stringify(reports, null, 2));
await writeFile(`${destination}/unit-view.html`, await readFile(new URL('./unit-view.html', import.meta.url), 'utf8'));
console.log(`Assembled ${reports.length} actual units and ${reports.reduce((count, report) => count + report.views.length, 0)} room views at ${destination}`);

function roomViews(room: Room, all: Furniture[]) {
  const kinds = { living: 'sofa', bedroom: 'sleeping_pod', kitchen: 'kitchen_block', bathroom: 'sink' } as const;
  if (!(room.kind in kinds)) return [];
  const items = all.filter(item => item.room === room.id);
  const target = items.find(item => item.kind === kinds[room.kind as keyof typeof kinds])
    ?? items.find(item => item.kind.startsWith('bed_')) ?? items[0];
  if (!target) return [];
  const b = polygonBounds(room.polygon), yaw = target.rotationDeg * Math.PI / 180;
  const front = [Math.sin(yaw), Math.cos(yaw)], candidates: { x: number; z: number; score: number }[] = [];
  for (let x = b.x + .4; x < b.x + b.w - .3; x += .25) for (let z = b.z + .4; z < b.z + b.d - .3; z += .25) {
    if (roomFootprintClearance(room, [x, z]) < .38) continue;
    if (items.some(item => {
      const angle = item.rotationDeg * Math.PI / 180, dx = x - item.position[0], dz = z - item.position[1];
      return Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)) < item.size[0] / 2 + .28
        && Math.abs(dx * Math.sin(angle) + dz * Math.cos(angle)) < item.size[1] / 2 + .28;
    })) continue;
    const dx = x - target.position[0], dz = z - target.position[1], distance = Math.hypot(dx, dz);
    const facing = (dx * front[0]! + dz * front[1]!) / (distance || 1);
    candidates.push({ x, z, score: facing * 4 - Math.abs(distance - 3.2) * .6 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const first = candidates[0];
  if (!first) return [];
  const second = candidates.find(point => Math.hypot(point.x - first.x, point.z - first.z) > 1.1) ?? first;
  const views = [first, second].map((point, index) => ({ name: `${room.kind}-${index + 1}`, room: room.id,
    at: [point.x, 1.62, point.z], aim: [target.position[0], room.kind === 'bedroom' ? 1.02 : room.kind === 'kitchen' ? 1.2 : .75, target.position[1]] }));
  if (room.kind === 'living' || room.kind === 'bedroom') views.push({ name: `${room.kind}-upper`, room: room.id,
    at: [second.x, 1.62, second.z], aim: [target.position[0], 3.1, target.position[1]] });
  return views;
}
