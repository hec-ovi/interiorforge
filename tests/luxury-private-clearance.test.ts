import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateRequest, resolveAssignments } from '../src/blueprint/validate.js';
import { pointInPolygon } from '../src/core/geom.js';
import { segmentDistance } from '../src/core/segment-sweep.js';
import { planBuilding } from '../src/layout/index.js';
import { doorUvPoint } from '../src/layout/plan-floor.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import { uvRectCorners, worldToUv } from '../src/layout/uv.js';

it('keeps the actual luxury floor wide after room fitting, pocket reservations and furniture placement', () => {
  const blueprint = JSON.parse(readFileSync(new URL('./kit-plans/balcony-grid-review-05.blueprint.json', import.meta.url), 'utf8'));
  const request = validateRequest({ seed: 'luxury-reference-review', building: { id: 'p0', type: 'residential', tier: 'high_rich' },
    blueprint, materialTheme: 'cyberpunk' });
  const plan = planBuilding(request, resolveAssignments(request), new Set([1])), uv = plan.uvFloors.get(1)!;
  const publicSpine = uv.rooms.find(room => room.id === 'f1-corridor')!;
  expect(publicSpine.rect.lv).toBe(3.5);
  expect(publicSpine.rect.lv - .2).toBeGreaterThanOrEqual(3); // two conservative 100mm finished faces
  const circulation = plan.circulation.get(1)!;
  const mains = uv.rooms.filter(room => room.unit && room.kind === 'living');
  expect(mains).toHaveLength(4);
  for (const main of mains) {
    const members = uv.rooms.filter(room => room.unit === main.unit);
    const furnishing = uv.furniture.filter(piece => piece.room === main.id);
    for (const kind of ['counter', 'display_screen', 'sofa', 'low_table'])
      expect(furnishing.some(piece => piece.kind === kind), `${main.unit} needs a coherent full-size salon: ${kind}`).toBe(true);
    const sofa = furnishing.find(piece => piece.kind === 'sofa')!;
    const screen = furnishing.find(piece => piece.kind === 'display_screen')!;
    expect(sofa.size[0]).toBeGreaterThanOrEqual(2.8);
    expect(Math.hypot(sofa.at[0] - screen.at[0], sofa.at[1] - screen.at[1])).toBeLessThan(4);

    const entrance = main.doors.find(door => door.to === publicSpine.id)!;
    expect(entrance.width).toBe(1.6);
    expect(entrance.leaves).toBe(2);
    const foyer = main.furnishingKeepouts![0]!;
    expect(foyer.lu * foyer.lv).toBe(8);
    expect(roomCoversRect(main, foyer)).toBe(true);
    const ids = new Set(members.map(room => room.id));
    const destinations = new Set(circulation.endpoints.filter(endpoint => endpoint.kind === 'room' && ids.has(endpoint.source)
      || endpoint.kind === 'door' && members.some(room => endpoint.id.endsWith(`:${room.id}`))).map(endpoint => endpoint.id));
    const routes = circulation.routes.filter(route => destinations.has(route.to));
    for (const room of members.filter(room => room !== main)) {
      const connections = uv.rooms.flatMap(owner => owner.doors.filter(door => owner.id === room.id || door.to === room.id));
      expect(connections, `${room.id} must not become a through-room`).toHaveLength(1);
      const door = room.doors[0]!;
      expect(door.width).toBeGreaterThanOrEqual(1.2);
      const [u, v] = doorUvPoint(door, room), horizontal = door.edge.startsWith('v');
      const sign = door.edge.endsWith('0') ? -1 : 1;
      // A finished 1.5m landing stands beyond every private-room opening.
      expect(roomCoversRect(main, { u: u + (horizontal ? 0 : sign * .95) - .85,
        v: v + (horizontal ? sign * .95 : 0) - .85, lu: 1.7, lv: 1.7 }), room.id).toBe(true);
    }
    for (const piece of uv.furniture.filter(piece => piece.room === main.id && !piece.elevation)) {
      const [width, depth] = piece.rotationDeg % 180 ? [piece.size[1], piece.size[0]] : piece.size;
      const polygon = uvRectCorners({ u: piece.at[0] - width! / 2, v: piece.at[1] - depth! / 2, lu: width!, lv: depth! });
      for (const route of routes) for (let i = 0; i < route.points.length; i++) {
        const a = worldToUv(route.points[i]!, plan.core.frame), b = worldToUv(route.points[Math.min(i + 1, route.points.length - 1)]!, plan.core.frame);
        const distance = pointInPolygon(a, polygon) || pointInPolygon(b, polygon) ? 0
          : Math.min(...polygon.map((point, edge) => segmentDistance(a, b, point, polygon[(edge + 1) % 4]!)));
        expect(distance, `${main.unit}/${piece.kind} crowds private circulation`).toBeGreaterThanOrEqual(1.2 - 1e-6);
      }
    }
  }
}, 180_000);
