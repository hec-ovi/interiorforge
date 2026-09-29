import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expandBuilding, findPath } from '../../../index.js';
import type { PlacementResult } from '../../../placements/types.js';
const root = process.env.DAMAGED_PAIRED_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/paired/', import.meta.url));
const dir = join(root, 'residential-megablock-poor-40-full-band/interior');
const building = JSON.parse(await readFile(join(dir, 'building.json'), 'utf8'));
const layouts = Object.fromEntries(await Promise.all(Object.keys(building.layouts).map(async id => [id,
  JSON.parse(await readFile(join(dir, 'layouts', `${id}.json`), 'utf8'))])));
const expanded = expandBuilding({ building, layouts } as PlacementResult);
const entrance = expanded.floors[0]!.rooms.flatMap(room => room.doors).find(door => door.to === 'outside')!;
const from = { floor: 0, x: entrance.position[0], z: entrance.position[1] + 1.5 };
const destinations = expanded.npc.anchors.filter(anchor => anchor.kind === 'bed').map(anchor => ({
  id: anchor.id, floor: anchor.floor, x: anchor.position[0], z: anchor.position[1],
}));
const roof = expanded.npc.nav.roofAccess;
if (roof) destinations.push({ id: 'roof-access', floor: roof.floor, x: roof.entry[0], z: roof.entry[1] });
const routes = (['all', 'stairs', 'lifts'] as const).flatMap(mode => destinations.filter(to => mode !== 'lifts' || to.id !== 'roof-access').map(to => {
  const nav = { ...expanded.npc.nav, connectors: expanded.npc.nav.connectors.filter(connector =>
    mode === 'all' || connector.kind === (mode === 'stairs' ? 'stair' : 'elevator')) };
  const route = findPath({ nav, from, to });
  return { mode, id: to.id, floor: to.floor, ...('error' in route ? { error: route.error } : {
    transfers: route.connectors.map(transfer => ({ kind: transfer.kind, from: transfer.fromFloor, to: transfer.toFloor })),
    legs: route.legs.length }) };
}));
await writeFile(join(root, 'residential-megablock-poor-40-full-band/routes.json'), JSON.stringify({ from, routes }, null, 2) + '\n');
console.log(JSON.stringify({ destinations: routes.length, failed: routes.filter(route => 'error' in route), servedFloors: [...new Set(routes.map(route => route.floor))] }));
