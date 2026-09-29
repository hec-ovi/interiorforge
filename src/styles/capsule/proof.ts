/** Offline artifact proof only. Does not create or replace any Engine city. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createDocument } from '../../glb/io.js';
import { moduleRecipes } from '../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../modules/index.js';
import { loadTheme } from '../../materials/load.js';
import { generate } from '../../index.js';
import { roomFootprintArea } from '../../core/room-footprint.js';
import { CAPSULE_BUILDING_SETS, capsuleExteriorRequest, capsuleInteriorRequest } from './sets.js';
import { capsuleRecipes } from './recipes.js';
import { CAPSULE_SHOWER_PARTS } from './shower.js';
import { sandraRecipes } from '../sandra/recipes.js';

const destination = resolve(process.argv[2] ?? 'out/proof/capsule-quality');
await mkdir(destination, { recursive: true });
const theme = loadTheme('cyberpunk')!.library.themeIndex;
const owned = new Set<string>();
capsuleRecipes(id => { owned.add(id); });
sandraRecipes(id => { owned.add(id); });
const recipes = moduleRecipes(tileScale(theme), slotAlignment(theme)).filter(recipe =>
  owned.has(recipe.id) && (recipe.id.startsWith('fit-capsule-') || recipe.id.startsWith('fit-sandra-') || recipe.id === 'wall-shelf-capsule' || recipe.id === 'wall-art-sandra-lattice'));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const metrics = [];
for (const recipe of recipes) {
  const doc = createDocument(recipe.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
  const bytes = await io.writeBinary(doc);
  await writeFile(`${destination}/${recipe.id}.glb`, bytes);
  metrics.push({ id: recipe.id, bytes: bytes.length, size: recipe.size, origin: recipe.origin,
    triangles: recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0) });
}
await writeFile(`${destination}/model-metrics.json`, JSON.stringify(metrics, null, 2));
await writeFile(`${destination}/proof.html`, await readFile(new URL('./proof-view.html', import.meta.url), 'utf8'));

if (!process.argv.includes('--models-only')) {
 const exterior = await import(new URL('../../../../exterior/src/index.ts', import.meta.url).href);
 const results = [];
 const selectedSet = process.argv.find(argument => argument.startsWith('--set='))?.slice(6);
 for (const set of CAPSULE_BUILDING_SETS.filter(set => !selectedSet || set.id === selectedSet)) {
  // The larger set also proves a dedicated bridge connection floor. It does not
  // invent a bridge mesh or silently claim the adjacent building exists.
  const connectionSource = set.connectionFloor === null ? undefined
    : (await exterior.generate(capsuleExteriorRequest(set), { textures: { mode: 'keys' } })).blueprint;
  const exteriorRequest = capsuleExteriorRequest(set, set.connectionFloor !== null, connectionSource);
  const built = await exterior.generate(exteriorRequest, { textures: { mode: 'keys' } });
  const request = capsuleInteriorRequest(set, built.blueprint);
  const folder = `${destination}/${set.id}`;
  await mkdir(`${folder}/layouts`, { recursive: true });
  for (const [name, data] of Object.entries({ 'exterior-request': exteriorRequest, request, blueprint: built.blueprint })) {
    await writeFile(`${folder}/${name}.json`, JSON.stringify(data, null, 2));
  }
  await writeFile(`${folder}/status.json`, JSON.stringify({ ready: false, status: 'generating' }));
  let result;
  try { result = await generate(request, { models: new Set() }); }
  catch (error) {
    const blocker = { set, ready: false, status: 'blocked', reason: error instanceof Error ? error.message : String(error),
      ...(error && typeof error === 'object' && 'diagnostics' in error ? { diagnostics: error.diagnostics } : {}) };
    await writeFile(`${folder}/status.json`, JSON.stringify(blocker, null, 2));
    results.push(blocker);
    console.log(`${set.id}: BLOCKED ${blocker.reason}`);
    continue;
  }
  await writeFile(`${folder}/building.json`, JSON.stringify(result.building, null, 2));
  for (const layout of Object.values(result.layouts)) await writeFile(`${folder}/layouts/${layout.id}.json`, JSON.stringify(layout, null, 2));
  if (built.glb instanceof Uint8Array) await writeFile(`${folder}/exterior.glb`, built.glb);
  const occupied = result.building.floors.filter(ref => result.layouts[ref.layout]!.floor.kind !== 'roof');
  if (occupied.length !== set.floors) throw new Error(`${set.id} lost occupied floors`);
  if (result.building.reservationCrossing) throw new Error(`${set.id} crosses a facade reservation`);
  const layouts = Object.values(result.layouts).map(layout => {
    const units = new Map<string, number>();
    for (const room of layout.floor.rooms) if (room.unit) units.set(room.unit, (units.get(room.unit) ?? 0) + roomFootprintArea(room));
    const incompleteUnits = [...units.keys()].flatMap(unit => {
      const rooms = new Set(layout.floor.rooms.filter(room => room.unit === unit).map(room => room.id));
      const furniture = layout.floor.furniture.filter(item => rooms.has(item.room));
      const kinds = new Set(furniture.map(item => item.kind));
      const missing = ['kitchen_block', 'fridge', 'wardrobe', 'sink', 'toilet', 'shower'].filter(kind => !kinds.has(kind as typeof furniture[number]['kind']));
      if (!furniture.some(item => item.kind === 'sleeping_pod' || item.kind.startsWith('bed_'))) missing.push('bed');
      for (const kind of ['sofa', 'low_table', 'display_screen'] as const) if (!kinds.has(kind)) missing.push(kind);
      return missing.length ? [{ unit, missing }] : [];
    });
    const incompleteKitchens = layout.floor.rooms.filter(room => room.kind === 'kitchen'
      && !layout.floor.furniture.some(item => item.room === room.id && item.kind === 'kitchen_block'))
      .map(room => ({ room: room.id, unit: room.unit }));
    const incompleteBathrooms = layout.floor.rooms.filter(room => room.kind === 'bathroom').flatMap(room => {
      const missing = ['sink', 'toilet', 'shower'].filter(kind => !layout.floor.furniture.some(item => item.room === room.id && item.kind === kind));
      return missing.length ? [{ room: room.id, unit: room.unit, missing }] : [];
    });
    return { id: layout.id, sourceFloor: layout.sourceFloor, kind: layout.floor.kind,
      storeyHeight: layout.floor.height, clearCeilingHeight: layout.floor.ceilingElevation - layout.floor.elevation,
      rooms: layout.floor.rooms.length, furniture: layout.floor.furniture.length,
      unitAreas: [...units.values()].map(area => Math.round(area * 100) / 100),
      units: [...units].map(([unit, area]) => ({ unit, area: Math.round(area * 100) / 100 })),
      areaTargetMisses: [...units].filter(([, area]) => area < 65 || area > 95).map(([unit, area]) => ({ unit, area })),
      kitchens: layout.floor.furniture.filter(item => item.kind === 'kitchen_block').length,
      beds: layout.floor.furniture.filter(item => item.kind === 'sleeping_pod' || item.kind.startsWith('bed_')).length,
      incompleteKitchens,
      incompleteBathrooms,
      incompleteUnits,
      showerComponentsReady: layout.floor.furniture.filter(item => item.kind === 'shower')
        .every(item => layout.placements.find(p => p.id === item.id)?.module === CAPSULE_SHOWER_PARTS[0]),
      sinks: layout.floor.furniture.filter(item => item.kind === 'sink').map(item => ({ size: item.size, module: layout.placements.find(p => p.id === item.id)?.module })),
    };
  });
  const ready = layouts.every(layout => !layout.incompleteKitchens.length && !layout.incompleteBathrooms.length
    && !layout.incompleteUnits.length && !layout.areaTargetMisses.length && layout.showerComponentsReady);
  await writeFile(`${folder}/status.json`, JSON.stringify({ ready, status: ready ? 'generated' : 'incomplete fixtures or dwelling area target',
    scope: 'Generated placement, complete private dwelling programme and target areas; full-room visual review is separate.' }, null, 2));
  results.push({ set, ready, minimumRequestedClearHeight: exteriorRequest.options.minimumClearHeight,
    preferredStoreyHeight: exteriorRequest.options.preferredFloorHeight,
    actualStoreys: built.blueprint.floors.map((floor: { index: number; elevation: number; height: number }) => ({ floor: floor.index, elevation: floor.elevation, height: floor.height })),
    actualConstructionGrids: built.blueprint.floors.map((floor: { roomEnvelope?: { grid: unknown } }) => floor.roomEnvelope?.grid),
    occupiedFloors: occupied.length, roof: result.building.floors.find(ref => result.layouts[ref.layout]!.floor.kind === 'roof'), layouts });
  console.log(`${set.id}: ${occupied.length} occupied storeys, ${layouts.length} distinct layouts`);
 }
 await writeFile(`${destination}/set-report.json`, JSON.stringify(results, null, 2));
 if (results.some(result => !result.ready)) process.exitCode = 1;
}
console.log(`Capsule proof: ${destination}; ${metrics.reduce((sum, row) => sum + row.bytes, 0)} shared module bytes`);
