import { fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expandBuilding, findPath } from '../../../index.js';
import type { FloorPlacement, PlacementResult } from '../../../placements/types.js';
import { polygonArea } from '../../../core/geom.js';
const root = process.env.DAMAGED_PAIRED_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/paired/', import.meta.url));
const reports = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(root, entry.name, 'interior');
  const blueprint = JSON.parse(await readFile(join(root, entry.name, 'blueprint.json'), 'utf8'));
  const building = JSON.parse(await readFile(join(dir, 'building.json'), 'utf8'));
  const layouts = Object.fromEntries(await Promise.all(Object.keys(building.layouts).map(async id => [id,
    JSON.parse(await readFile(join(dir, 'layouts', `${id}.json`), 'utf8'))])));
  const expanded = expandBuilding({ building, layouts } as PlacementResult);
  const entrances = building.floors.flatMap((floor: { apartmentEntrances?: { width: number; height: number }[] }) => floor.apartmentEntrances ?? []);
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
    return { mode, id: to.id, floor: to.floor, ...('error' in route ? { error: route.error } : { legs: route.legs.length }) };
  }));
  const floors = expanded.floors.map(floor => {
    const units = [...new Set(floor.rooms.map(room => room.unit).filter(Boolean))].map(unit => {
      const roomIds = new Set(floor.rooms.filter(room => room.unit === unit).map(room => room.id));
      const roomKinds = new Set(floor.rooms.filter(room => room.unit === unit).map(room => room.kind));
      const furniture = floor.furniture.filter(item => roomIds.has(item.room));
      const area = floor.rooms.filter(room => room.unit === unit).reduce((sum, room) => sum + Math.abs(polygonArea(room.polygon))
        - (room.holes ?? []).reduce((cut, hole) => cut + Math.abs(polygonArea(hole)), 0), 0);
      return { unit, area: Math.round(area * 100) / 100,
        missingRooms: (['living', 'bedroom', 'bathroom', 'kitchen'] as const).filter(kind => !roomKinds.has(kind)),
        missing: ['bed', 'kitchen_block', 'fridge', 'sink', 'toilet', 'shower', 'sofa', 'low_table', 'display_screen'].filter(kind =>
        !furniture.some(item => kind === 'bed' ? item.kind.startsWith('bed_') : item.kind === kind)) };
    });
    return { floor: floor.floor, kind: floor.kind, units: units.length, unitAreas: units.map(unit => unit.area),
      incomplete: units.filter(unit => unit.missing.length || unit.missingRooms.length) };
  });
  const services = Object.entries(layouts).map(([id, layout]) => {
    const placements = (layout as FloorPlacement).placements;
    const banks = placements.filter(p => p.module === 'wall-shelf-damaged-meter-bank');
    const branches = placements.filter(p => p.module === 'ceiling-services-damaged-branch');
    return { layout: id, banks: banks.length, connected: branches.length,
      unconnected: banks.filter(bank => !branches.some(branch => branch.room === bank.room)).map(bank => bank.room) };
  });
  const ground = expanded.floors.find(floor => floor.floor === 0)!;
  const groundProgramme = ground.rooms.filter(room => room.id.includes('-damaged-')).map(room => ({
    room: room.id, role: room.id.split('-damaged-')[1], kind: room.kind,
    area: Math.round((Math.abs(polygonArea(room.polygon))
      - (room.holes ?? []).reduce((area, hole) => area + Math.abs(polygonArea(hole)), 0)) * 100) / 100,
    furniture: ground.furniture.filter(item => item.room === room.id).map(item => item.kind),
  }));
  const report = { id: entry.name, architecture: blueprint.assembly?.architecture,
    storeys: blueprint.floors.map((floor: { index: number; height: number; elevation: number }) =>
      ({ floor: floor.index, height: floor.height, elevation: floor.elevation })),
    groundDoors: blueprint.floors[0].openings.filter((opening: { kind: string }) => opening.kind === 'door')
      .map((opening: { id: string; door?: { motion?: { kind: string } } }) => ({ id: opening.id, motion: opening.door?.motion?.kind })),
    floors, services, groundProgramme, numberedEntrances: entrances.length,
    minPrivateWidth: Math.min(...entrances.map((entrance: { width: number }) => entrance.width)),
    invalidPrivateEntrances: entrances.filter((entrance: { width: number; motion?: { kind: string }; leaves?: unknown[]; pockets?: unknown[] }) =>
      entrance.width < 1.2 - 1e-6 || entrance.motion?.kind !== 'pocket' || entrance.leaves?.length !== 2 || entrance.pockets?.length !== 2),
    routes: routes.length, failedRoutes: routes.filter(route => 'error' in route),
    emptyApartmentFloors: floors.filter(floor => floor.kind === 'apartment' && floor.units === 0) };
  reports.push(report);
  await writeFile(join(root, entry.name, 'audit.json'), JSON.stringify({ ...report, from, routeDetails: routes }, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
await writeFile(join(root, 'audit.json'), JSON.stringify(reports, null, 2) + '\n');
if (reports.some(report => report.failedRoutes.length || report.emptyApartmentFloors.length || report.invalidPrivateEntrances.length
  || report.floors.some(floor => floor.incomplete.length) || report.services.some(service => service.unconnected.length)
  || report.groundProgramme.length < 6 || !report.groundProgramme.some(room => room.kind === 'reception' && room.area <= 120)
  || report.numberedEntrances !== report.floors.reduce((count, floor) => count + floor.units, 0))) process.exitCode = 1;
