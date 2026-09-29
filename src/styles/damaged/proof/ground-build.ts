import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolveAssignments } from '../../../blueprint/validate.js';
import { planBuilding } from '../../../layout/index.js';
import { placeLayout } from '../../../placements/layout.js';
import { pointInPolygon, polygonBounds, type Point } from '../../../core/geom.js';
import { moduleRecipes } from '../../../modules/recipes.js';
import { tileScale, slotAlignment } from '../../../modules/index.js';
import { loadTheme } from '../../../materials/load.js';
import { textureDocument } from '../../../materials/index.js';
import { createDocument, writeGlb } from '../../../glb/io.js';
import type { InteriorRequest, Room } from '../../../core/types.js';
import { damagedGroundSummary } from '../ground-program.js';

/** Selected-floor inspection of the unchanged full building blueprint. It uses
 * the same planner and placement pass as full generation; it cannot approve the
 * unselected upper floors or substitute a one-floor building for a failed stack. */
const source = process.env.DAMAGED_GROUND_SOURCE ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/pitch35/', import.meta.url));
const out = process.env.DAMAGED_PROOF_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-ground/', import.meta.url));
await mkdir(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), wanted = new Set<string>(), views = [], reports = [];
for (const family of ['courtyard', 'megablock']) for (const size of [40, 60]) {
  const variant = `residential-${family}-poor-${size}`, scene = `${family}-${size}-ground`;
  const input: InteriorRequest = JSON.parse(await readFile(join(source, variant, 'interior.request.json'), 'utf8'));
  const plan = planBuilding(input, resolveAssignments(input), new Set([0]));
  const bp = input.blueprint.floors.find(floor => floor.index === 0)!;
  const placed = placeLayout(plan, bp, input, { present: new Set(), missing: new Set() }, bp.height);
  const floor = plan.floors[0]!, grid = plan.navGrids.get(0)!;
  const shell = await io.readBinary(await readFile(join(source, variant, 'shell.glb')));
  await textureDocument(shell, 'cyberpunk', { mode: 'embed' });
  await writeFile(join(out, `${scene}-shell.glb`), await io.writeBinary(shell));
  await writeFile(join(out, `${scene}.json`), JSON.stringify(placed.placements, null, 2) + '\n');
  for (const placement of placed.placements) if (placement.module) wanted.add(placement.module);
  const contains = (room: Room, point: Point) => pointInPolygon(point, room.polygon)
    && !(room.holes ?? []).some(hole => pointInPolygon(point, hole));
  const camera = (room: Room, focus: Point, prefer?: Point): Point => {
    const bounds = polygonBounds(room.polygon), low = grid.cellAt([bounds.x, bounds.z]), high = grid.cellAt([bounds.x + bounds.w, bounds.z + bounds.d]);
    const points: Point[] = [];
    for (let row = Math.max(0, low[1]); row <= Math.min(grid.rows - 1, high[1]); row++)
      for (let column = Math.max(0, low[0]); column <= Math.min(grid.cols - 1, high[0]); column++) {
        if (!grid.isWalkable(column, row)) continue;
        const point = grid.center(column, row);
        if (contains(room, point)) points.push(point);
      }
    points.sort((a, b) => prefer
      ? Math.hypot(a[0] - prefer[0], a[1] - prefer[1]) - Math.hypot(b[0] - prefer[0], b[1] - prefer[1])
      : Math.hypot(b[0] - focus[0], b[1] - focus[1]) - Math.hypot(a[0] - focus[0], a[1] - focus[1]));
    if (!points.length) throw new Error(`${variant}/${room.id} has no real walkable camera`);
    return points[0]!;
  };
  const entryRoom = floor.rooms.find(room => room.doors.some(door => door.id === 'entrance' && door.to === 'outside'))!;
  const entry = entryRoom.doors.find(door => door.id === 'entrance')!;
  const desk = floor.furniture.find(item => item.room === entryRoom.id && item.kind === 'reception_desk');
  if (!desk) throw new Error(`${variant} entry has no actual caretaker counter`);
  const angle = entry.angleDeg * Math.PI / 180;
  const entranceAt = camera(entryRoom, desk.position,
    [entry.position[0] + Math.sin(angle) * 3, entry.position[1] + Math.cos(angle) * 3]);
  const reverse = camera(entryRoom, entry.position, desk.position);
  views.push({ name: `${scene}-entry`, scene, kind: 'living', room: entryRoom.id, snapshot: 'selected-ground-current-generator',
    at: [entranceAt[0], 1.62, entranceAt[1]], aim: [desk.position[0], 1.1, desk.position[1]],
    reverseAt: [reverse[0], 1.62, reverse[1]], reverseAim: [entry.position[0], 1.3, entry.position[1]], elevation: 0 });
  for (const [role, fixture] of [['resident-waiting', 'sofa'], ['caretaker-office', 'desk'], ['resident-workroom', 'desk']] as const) {
    const room = floor.rooms.find(room => room.id.includes(`-damaged-${role}`));
    const target = floor.furniture.find(item => item.room === room?.id && item.kind === fixture);
    if (!room || !target) throw new Error(`${variant} ${role} has no actual ${fixture}`);
    const at = camera(room, target.position), reverse = camera(room, at, target.position);
    const other = floor.furniture.find(item => item.room === room.id && item !== target && item.kind !== 'wall_art') ?? target;
    views.push({ name: `${scene}-${role}`, scene, kind: 'living', room: room.id, snapshot: 'selected-ground-current-generator',
      at: [at[0], 1.62, at[1]], aim: [target.position[0], .9, target.position[1]],
      reverseAt: [reverse[0], 1.62, reverse[1]], reverseAim: [other.position[0], 1.0, other.position[1]], elevation: 0 });
  }
  reports.push({ variant, scope: 'selected ground floor of unchanged complete blueprint',
    programme: damagedGroundSummary(plan.uvFloors.get(0)!.rooms), rooms: floor.rooms.length, furniture: floor.furniture.length,
    mailBanks: placed.placements.filter(part => part.module === 'fit-damaged-mail-bank').length });
  console.log(JSON.stringify(reports.at(-1)));
}
const theme = loadTheme('cyberpunk')!.library.themeIndex;
for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme)).filter(recipe => wanted.has(recipe.id))) {
  const doc = createDocument(recipe.mesh); await textureDocument(doc, 'cyberpunk', { mode: 'embed' });
  await writeFile(join(out, `${recipe.id}.glb`), await writeGlb(doc));
}
await writeFile(join(out, 'actual-rooms.json'), JSON.stringify(views, null, 2) + '\n');
await writeFile(join(out, 'ground-report.json'), JSON.stringify(reports, null, 2) + '\n');
