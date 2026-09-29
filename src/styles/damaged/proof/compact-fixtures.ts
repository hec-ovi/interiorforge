import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateRequest, resolveAssignments } from '../../../blueprint/validate.js';
import { planBuilding } from '../../../layout/index.js';
import { doorZonesByRoom } from '../../../layout/clearance.js';
import { circulationKeepouts } from '../../../layout/circulation.js';
import { openingKeepouts } from '../../../layout/openings.js';
import { floorBounds } from '../../../layout/shell.js';
import type { UvRect } from '../../../layout/uv.js';

const root = process.env.DAMAGED_PAIRED_OUT ?? fileURLToPath(new URL('../../../../out/proof/damaged-05/paired/', import.meta.url));
const cases = [];
const overlaps = (a: UvRect, b: UvRect) => a.u < b.u + b.lu && a.u + a.lu > b.u && a.v < b.v + b.lv && a.v + a.lv > b.v;
for (const id of ['residential-courtyard-poor-40', 'residential-courtyard-poor-60', 'residential-megablock-poor-60']) {
  const request = validateRequest(JSON.parse(await readFile(join(root, id, 'interior.request.json'), 'utf8')));
  const planned = planBuilding(request, resolveAssignments(request), new Set([1]));
  const uv = planned.uvFloors.get(1)!, bp = request.blueprint.floors.find(floor => floor.index === 1)!;
  const bounds = floorBounds(bp, planned.core.frame, request.blueprint.facade);
  const doorZones = doorZonesByRoom(uv.rooms);
  const external = openingKeepouts(bp, planned.core.frame, bounds.facadeDepth).map(keepout => keepout.rect);
  const circulation = circulationKeepouts(planned.circulation.get(1)!, planned.core.frame);
  for (const room of uv.rooms) {
    const expected = room.kind === 'kitchen' ? ['kitchen_block'] : room.kind === 'bathroom' ? ['toilet', 'sink', 'shower'] : [];
    const furniture = uv.furniture.filter(item => item.room === room.id);
    const missing = expected.filter(kind => !furniture.some(item => item.kind === kind));
    if (!missing.length) continue;
    cases.push({ source: id, seed: request.seed, floor: 1, family: 'damaged', tier: 'poor', room,
      missing, placed: furniture, bounds,
      doorZones: (doorZones.get(room.id) ?? []).map(zone => zone.rect),
      openingZones: external.filter(zone => overlaps(zone, room.rect)),
      circulationZones: circulation.filter(zone => overlaps(zone, room.rect)) });
  }
}
console.log(JSON.stringify(cases, null, 2));
