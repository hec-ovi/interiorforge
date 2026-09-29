import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { generate } from '../../../index.js';
import { moduleRecipes } from '../../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../../modules/index.js';
import { loadTheme } from '../../../materials/load.js';
import { textureDocument } from '../../../materials/index.js';
import { createDocument, writeGlb } from '../../../glb/io.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { pointInPolygon, polygonBounds, type Point } from '../../../core/geom.js';
import { WalkGrid } from '../../../core/grid.js';
import type { GeneratedInterior } from '../../../placements/types.js';

const out = process.env.DAMAGED_PROOF_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-03/', import.meta.url));
const paired = process.env.DAMAGED_PAIRED_SOURCE ?? join(out, 'paired');
await mkdir(out, { recursive: true });
const wanted = new Set<string>(), views = [];
const shellIo = new NodeIO().registerExtensions(ALL_EXTENSIONS);
type RoomSpec = [family: string, size: number, layoutId: string, name: string, mode: 'service' | 'home'];
const specs: RoomSpec[] = process.env.DAMAGED_ROOM_SPECS ? JSON.parse(process.env.DAMAGED_ROOM_SPECS) as RoomSpec[]
  : process.env.DAMAGED_FULL_MATRIX === '1'
  ? ['residential-courtyard', 'residential-megablock'].flatMap(family => [40, 60].flatMap(size =>
    ['ground', 'middle', ...(family === 'residential-megablock' && size === 60 ? ['floor-5'] : []), 'crown']
      .map(layout => [family, size, layout, `${family.replace('residential-', '')}-${size}-${layout}`,
        layout === 'ground' ? 'service' : 'home'] as RoomSpec)))
  : [['residential-courtyard', 40, 'ground', 'courtyard-ground', 'service'],
    ['residential-megablock', 60, 'middle', 'megablock-home', 'home']];
const shells = new Set<string>();
const generated = new Map<string, Pick<GeneratedInterior, 'building' | 'layouts'>>();
for (const [family, size, layoutId, name, mode] of specs) {
  const variant = `${family}-poor-${size}`;
  const input = JSON.parse(await readFile(join(paired, `${family}-poor-${size}`, 'interior.request.json'), 'utf8'));
  const result = process.env.DAMAGED_USE_SAVED === '1'
    ? { building: JSON.parse(await readFile(join(paired, `${family}-poor-${size}`, 'interior/building.json'), 'utf8')),
      layouts: { [layoutId]: JSON.parse(await readFile(join(paired, `${family}-poor-${size}`, `interior/layouts/${layoutId}.json`), 'utf8')) } } as Pick<GeneratedInterior, 'building' | 'layouts'>
    : generated.get(variant) ?? await generate(input, { models: new Set() });
  if (process.env.DAMAGED_USE_SAVED !== '1') generated.set(variant, result);
  const layout = result.layouts[layoutId as keyof typeof result.layouts]!;
  const entrances = result.building.floors.find(floor => floor.index === layout.sourceFloor)?.apartmentEntrances ?? [];
  const placements = [...layout.placements, ...entrances.flatMap(entrance => [...entrance.fixed, ...entrance.leaves]
    .map((part, index) => ({ ...part, id: `${entrance.id}:closed:${index}`, room: entrance.privateRoom })))];
  if (!shells.has(variant)) {
    const shell = await shellIo.readBinary(await readFile(join(paired, variant, 'shell.glb')));
    await textureDocument(shell, 'cyberpunk', { mode: 'embed' });
    await writeFile(join(out, `${variant}-shell.glb`), await shellIo.writeBinary(shell));
    shells.add(variant);
  }
  // These are the complete real generated floor placements, including every room,
  // opening, core and finish. The camera is the only editorial choice here.
  await writeFile(join(out, `${name}.json`), JSON.stringify(placements, null, 2) + '\n');
  for (const p of placements) if (p.module) wanted.add(p.module);
  const p = layout.placements.find(p => p.module === (mode === 'service' ? 'wall-shelf-damaged-meter-bank' : 'fit-damaged-bed'));
  if (!p) throw new Error(`${variant}/${layoutId} has no representative ${mode} fixture`);
  const n = [Math.sin(p.rotationY), Math.cos(p.rotationY)];
  const slab = layout.placements.find(item => item.room === p.room && item.module?.startsWith('floor-slab'))!;
  const at = mode === 'service'
    ? [p.position[0] + n[0]! * 3.2 + .6, 1.62, p.position[2] + n[1]! * 3.2]
    : [slab.position[0] + 1.3, 1.62, slab.position[2] + .7];
  views.push({ name, shell: variant, room: p.room, at,
    snapshot: process.env.DAMAGED_SNAPSHOT_LABEL ?? (process.env.DAMAGED_USE_SAVED === '1' ? 'saved-generated-layout' : 'current-generator'),
    elevation: input.blueprint.floors.find((floor: { index: number }) => floor.index === layout.sourceFloor).elevation,
    aim: [p.position[0], mode === 'service' ? 2.05 : 1.0, p.position[2]],
    serviceBanks: layout.placements.filter(p => p.module === 'wall-shelf-damaged-meter-bank').length,
    connectedBanks: layout.placements.filter(p => p.module === 'ceiling-services-damaged-branch').length,
    lodgingWalls: layout.placements.filter(p => p.module === 'wall-field-damaged-lodging').length,
    closedPrivateEntrances: entrances.length });
  if (mode === 'service') {
    const arrivalRoom = layout.floor.rooms.find(room => room.doors.some(door => door.to === 'outside' && door.id === 'entrance'))
      ?? layout.floor.rooms.find(room => room.doors.some(door => door.to === 'outside'));
    const entrance = arrivalRoom?.doors.find(door => door.to === 'outside' && door.id === 'entrance')
      ?? arrivalRoom?.doors.find(door => door.to === 'outside');
    const desk = layout.placements.find(item => item.module === 'fit-damaged-caretaker-desk');
    if (entrance && desk) {
      const angle = entrance.angleDeg * Math.PI / 180;
      views.push({ name: `${name}-arrival`, scene: name, shell: variant, kind: 'living', room: arrivalRoom!.id,
        at: [entrance.position[0] + Math.sin(angle) * 3, 1.62, entrance.position[1] + Math.cos(angle) * 3],
        aim: [desk.position[0], 1.1, desk.position[2]],
        reverseAt: [desk.position[0] + Math.sin(desk.rotationY) * 3, 1.62, desk.position[2] + Math.cos(desk.rotationY) * 3],
        reverseAim: [entrance.position[0], 1.3, entrance.position[1]],
        elevation: input.blueprint.floors.find((floor: { index: number }) => floor.index === layout.sourceFloor).elevation,
        programme: layout.floor.rooms.filter(room => !['corridor', 'elevator_lobby'].includes(room.kind)).map(room => ({
          room: room.id, kind: room.kind, furniture: layout.floor.furniture.filter(item => item.room === room.id).map(item => item.kind),
        })) });
    }
  }
  if (mode === 'home') {
    const unit = layout.floor.rooms.find(room => room.id === p.room)!.unit;
    const living = layout.floor.rooms.find(room => room.unit === unit && ['living', 'studio_main'].includes(room.kind))!;
    const entry = entrances.find(entrance => entrance.unit === unit)!;
    const rects = layout.placements.filter(item => item.room === living.id && item.module?.startsWith('floor-slab'))
      .sort((a, b) => b.scale[0] * b.scale[2] - a.scale[0] * a.scale[2]);
    const aim = [rects[0]!.position[0], 1.05, rects[0]!.position[2]];
    const arrival: [number, number, number] = [entry.position[0] + entry.inward[0], 1.62, entry.position[1] + entry.inward[1]];
    const nav = layout.npc.nav.floors.find(floor => floor.floor === layout.sourceFloor)!;
    const grid = WalkGrid.fromBase64(nav.walkable, nav.origin, layout.npc.nav.cellSize, nav.cols, nav.rows);
    const contains = (point: Point) => pointInPolygon(point, living.polygon) && !(living.holes ?? []).some(hole => pointInPolygon(point, hole));
    const cameras: Point[] = [];
    for (let row = 0; row < grid.rows; row++) for (let column = 0; column < grid.cols; column++) {
      if (!grid.isWalkable(column, row)) continue;
      const point = grid.center(column, row);
      if (!contains(point)) continue;
      if ([.2, .4, .6, .8].some(t => !contains([point[0] + (aim[0]! - point[0]) * t, point[1] + (aim[2]! - point[1]) * t]))) continue;
      cameras.push(point);
    }
    cameras.sort((a, b) => Math.hypot(b[0] - arrival[0], b[1] - arrival[2]) - Math.hypot(a[0] - arrival[0], a[1] - arrival[2]));
    const reverse = cameras[0]!;
    views.push({ name: name === 'megablock-home' ? 'megablock-living' : `${name}-living`,
      scene: name, shell: variant, kind: 'living', room: living.id, at: arrival, aim,
      elevation: input.blueprint.floors.find((floor: { index: number }) => floor.index === layout.sourceFloor).elevation,
      reverseAt: [reverse[0], 1.62, reverse[1]], reverseAim: [entry.position[0], 1.3, entry.position[1]],
      bounds: polygonBounds(living.polygon), furniture: layout.floor.furniture.filter(item => item.room === living.id).map(item => item.kind),
      closedPrivateEntrances: entrances.length });
    for (const [kind, focusKind, otherKind] of [['kitchen', 'kitchen_block', 'fridge'], ['bathroom', 'shower', 'sink']] as const) {
      const room = layout.floor.rooms.find(room => room.unit === unit && room.kind === kind);
      const focus = layout.floor.furniture.find(item => item.room === room?.id && item.kind === focusKind);
      const other = layout.floor.furniture.find(item => item.room === room?.id && item.kind === otherKind);
      if (!room || !focus || !other) throw new Error(`${variant}/${layoutId}/${unit} has no complete ${kind} proof`);
      const inside = (point: Point) => pointInPolygon(point, room.polygon)
        && !(room.holes ?? []).some(hole => pointInPolygon(point, hole));
      const possible: Point[] = [];
      const bounds = polygonBounds(room.polygon), low = grid.cellAt([bounds.x, bounds.z]), high = grid.cellAt([bounds.x + bounds.w, bounds.z + bounds.d]);
      for (let row = Math.max(0, low[1]); row <= Math.min(grid.rows - 1, high[1]); row++)
        for (let column = Math.max(0, low[0]); column <= Math.min(grid.cols - 1, high[0]); column++) {
          if (!grid.isWalkable(column, row)) continue;
          const point = grid.center(column, row);
          if (inside(point)) possible.push(point);
        }
      const pick = (target: Point) => possible.slice().sort((a, b) =>
        Math.hypot(b[0] - target[0], b[1] - target[1]) - Math.hypot(a[0] - target[0], a[1] - target[1]))[0];
      const camera = pick(focus.position), reverse = pick(other.position);
      if (!camera || !reverse) throw new Error(`${variant}/${layoutId}/${room.id} has no actual walkable camera position`);
      views.push({ name: `${name}-${kind}`, scene: name, shell: variant, kind: 'living', room: room.id,
        at: [camera[0], 1.62, camera[1]], aim: [focus.position[0], 1.05, focus.position[1]],
        reverseAt: [reverse[0], 1.62, reverse[1]], reverseAim: [other.position[0], 1.05, other.position[1]],
        elevation: input.blueprint.floors.find((floor: { index: number }) => floor.index === layout.sourceFloor).elevation,
        furniture: layout.floor.furniture.filter(item => item.room === room.id).map(item => item.kind) });
    }
  }
}
const theme = loadTheme('cyberpunk')!.library.themeIndex;
for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme)).filter(recipe => wanted.has(recipe.id))) {
  const doc = createDocument(recipe.mesh); await textureDocument(doc, 'cyberpunk', { mode: 'embed' });
  await writeFile(join(out, `${recipe.id}.glb`), await writeGlb(doc));
}
await writeFile(join(out, 'actual-rooms.json'), JSON.stringify(views, null, 2) + '\n');
console.log(JSON.stringify(views));
