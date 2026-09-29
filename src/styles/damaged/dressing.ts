import type { BlueprintFloor, FloorInterior } from '../../core/types.js';
import type { CorePlan } from '../../layout/core-plan.js';
import type { UvFloorData } from '../../layout/plan-floor.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Placement } from '../../placements/types.js';
import { worldToUv } from '../../layout/uv.js';

const PUBLIC = new Set(['corridor', 'elevator_lobby', 'reception', 'lounge', 'concourse', 'storage', 'mechanical_room']);

/** Dress only already-built full-height solid wall spans. The partition pass has cut
 * every door/window/core opening, so fixtures cannot cover an entry or float over glass.
 * Ceiling pipes use fitted ceiling rectangles; never cross voids or low headroom. */
export function dressDamagedRooms(builder: PlacementBuilder, floor: FloorInterior,
  _uv?: UvFloorData, _core?: CorePlan, _bp?: BlueprintFloor): void {
  const kinds = new Map(floor.rooms.map(room => [room.id, room.kind]));
  const source = [...builder.placements];
  const crossesStair = (a: Vec3, b: Vec3, padding = .34): boolean => {
    if (!_core) return false;
    const p = worldToUv([a[0], a[2]], _core.frame), q = worldToUv([b[0], b[2]], _core.frame);
    return [_core.stairA, ...(_core.stairB ? [_core.stairB] : [])].some(stair =>
      Math.min(p[0], q[0]) - padding < stair.u + stair.lu && Math.max(p[0], q[0]) + padding > stair.u
      && Math.min(p[1], q[1]) - padding < stair.v + stair.lv && Math.max(p[1], q[1]) + padding > stair.v);
  };
  const headers = new Set<string>();
  for (const wall of source.filter(p => p.module === 'wall-field-damaged-lodging')
    .sort((a, b) => b.scale[0] - a.scale[0])) {
    // Core wall faces may reuse the private mineral field as their backing, but
    // stairs are not dwellings: no low vent/header may project into their climb.
    if (!['bedroom', 'living', 'studio_main', 'kitchen', 'storage', 'office_private'].includes(kinds.get(wall.room) ?? '')) continue;
    const width = wall.scale[0] * .5, height = wall.scale[1] * .5;
    const s = Math.sin(wall.rotationY), c = Math.cos(wall.rotationY);
    const at = (x: number, y: number): Vec3 => [wall.position[0] + x * c + s * .096,
      wall.position[1] + y, wall.position[2] - x * s + c * .096];
    // Datum-bound base: cut door/header spans cannot restart a skirting above an aperture.
    if (wall.position[1] < .01 && height >= .3) builder.module('wall-damaged-lodging-skirting',
      wall.room, at(0, 0), [width / .5, 1, 1], wall.rotationY);
    const panels = Math.max(1, Math.ceil(width / 3));
    for (let i = 1; i < panels; i++) builder.module('wall-damaged-lodging-joint', wall.room,
      at(-width / 2 + width * i / panels, 0), [1, height / .5, 1], wall.rotationY);
    if (!headers.has(wall.room) && width >= 2 && height >= 2.55 && wall.position[1] < .01) {
      builder.module('wall-shelf-damaged-lodging-header', wall.room, at(0, height - .31), [1, 1, 1], wall.rotationY);
      headers.add(wall.room);
    }
  }
  for (const wall of source.filter(p => p.module === 'wall-field-damaged-public' || p.module === 'wall-field-damaged-megablock')) {
    if (wall.position[1] > .01 || wall.scale[1] * .5 < .4) continue;
    const height = Math.min(1.15, wall.scale[1] * .5);
    // Mount on the finished face, 1 mm beyond the 95 mm backing. Local dado Z
    // starts at its mounting face; no back or edge face coincides with plaster.
    const inset = .096;
    const mount: [number, number, number] = [wall.position[0] + Math.sin(wall.rotationY) * inset,
      wall.position[1], wall.position[2] + Math.cos(wall.rotationY) * inset];
    builder.module(wall.module === 'wall-field-damaged-megablock' ? 'wall-field-damaged-dado-gunmetal' : 'wall-field-damaged-dado', wall.room, mount,
      [wall.scale[0], height / .5, 1], wall.rotationY);
  }
  const decorated = new Set<string>();
  const equipment: { room: string; at: Vec3; mount: Vec3; angle: number }[] = [];
  for (const wall of source.filter(p => p.module === 'wall-field-damaged-public' || p.module === 'wall-field-damaged-megablock' || p.module === 'wall-field-damaged')
    .sort((a, b) => b.scale[0] - a.scale[0])) {
    if (!PUBLIC.has(kinds.get(wall.room) ?? '')
      || wall.position[1] > .01 || wall.scale[1] * .5 < 2.2 || wall.scale[0] * .5 < 2.1) continue;
    const s = Math.sin(wall.rotationY), c = Math.cos(wall.rotationY);
    const x = wall.position[0] + s * .102, z = wall.position[2] + c * .102;
    // Keep equipment clear of placed cupboards/screens; includes their rotation.
    const blocked = floor.furniture.some(item => {
      const dx = x - item.position[0], dz = z - item.position[1];
      const a = item.rotationDeg * Math.PI / 180;
      return Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) < item.size[0] / 2 + .65
        && Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) < item.size[1] / 2 + .2;
    });
    if (blocked) continue;
    equipment.push({ room: wall.room, mount: [x, .85, z], at: [x + s * .072, 1.96, z + c * .072], angle: wall.rotationY });
  }
  const runs: { ceiling: Placement; length: number; angle: number }[] = [];
  for (const ceiling of source.filter(p => p.module === 'ceiling-field-damaged')) {
    if (!PUBLIC.has(kinds.get(ceiling.room) ?? '') || ceiling.position[1] < 2.7) continue;
    const width = ceiling.scale[0] * .5, depth = ceiling.scale[2] * .5;
    if (Math.min(width, depth) < .8 || Math.max(width, depth) < 2) continue;
    const length = Math.max(width, depth) - .2;
    const angle = ceiling.rotationY + (width >= depth ? 0 : -Math.PI / 2);
    // A floor-level ceiling rectangle can neighbor an upper landing. Its static
    // soffit may be valid while suspended services consume the stair's headroom.
    // Stair shafts retain their complete vertical clearance, at every rotation.
    if (crossesStair([ceiling.position[0] - Math.cos(angle) * length / 2, ceiling.position[1], ceiling.position[2] + Math.sin(angle) * length / 2],
      [ceiling.position[0] + Math.cos(angle) * length / 2, ceiling.position[1], ceiling.position[2] - Math.sin(angle) * length / 2])) continue;
    builder.module('ceiling-services-damaged-run', ceiling.room, ceiling.position, [length / .5, 1, 1], angle);
    runs.push({ ceiling, length, angle });
    // Hangers retain physical size while their count follows the actual room span.
    const count = Math.max(1, Math.floor(length / 2.4));
    for (let i = 0; i < count; i++) {
      const offset = length * ((i + .5) / count - .5);
      builder.module('ceiling-services-damaged-hanger', ceiling.room,
        [ceiling.position[0] + offset * Math.cos(angle), ceiling.position[1], ceiling.position[2] - offset * Math.sin(angle)],
        [1, 1, 1], angle);
    }
    const joints = Math.floor(length / 2.8);
    for (let i = 0; i < joints; i++) {
      const offset = length * ((i + 1) / (joints + 1) - .5);
      builder.module('ceiling-services-damaged-coupling', ceiling.room,
        [ceiling.position[0] + offset * Math.cos(angle), ceiling.position[1], ceiling.position[2] - offset * Math.sin(angle)],
        [1, 1, 1], angle);
    }
    const rungs = Math.max(2, Math.ceil(length / .28));
    for (let i = 0; i < rungs; i++) {
      const offset = length * ((i + .5) / rungs - .5);
      builder.module('ceiling-services-damaged-rung', ceiling.room,
        [ceiling.position[0] + offset * Math.cos(angle), ceiling.position[1], ceiling.position[2] - offset * Math.sin(angle)],
        [1, 1, 1], angle);
    }
  }
  for (const bank of equipment) {
    if (decorated.has(bank.room)) continue;
    // A wall feed may only connect across its own fitted ceiling rectangle. This
    // rejects shortcuts through a core void or an adjacent room in concave plans.
    const candidates = runs.filter(run => {
      if (run.ceiling.room !== bank.room) return false;
      const dx = bank.at[0] - run.ceiling.position[0], dz = bank.at[2] - run.ceiling.position[2];
      const a = run.ceiling.rotationY;
      return Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) <= run.ceiling.scale[0] * .25 + .05
        && Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) <= run.ceiling.scale[2] * .25 + .05;
    }).sort((a, b) => Math.hypot(bank.at[0] - a.ceiling.position[0], bank.at[2] - a.ceiling.position[2])
      - Math.hypot(bank.at[0] - b.ceiling.position[0], bank.at[2] - b.ceiling.position[2]));
    const run = candidates[0];
    if (!run) continue;
    const c = Math.cos(run.angle), s = Math.sin(run.angle), origin = run.ceiling.position;
    const dx = bank.at[0] - origin[0], dz = bank.at[2] - origin[2];
    const along = Math.max(-run.length / 2 + .1, Math.min(run.length / 2 - .1, dx * c - dz * s));
    const start: Vec3 = [origin[0] + along * c + .19 * s, origin[1], origin[2] - along * s + .19 * c];
    const bx = bank.at[0] - start[0], bz = bank.at[2] - start[2], reach = Math.hypot(bx, bz);
    const height = origin[1] - .30 - bank.at[1];
    if (reach < .16 || height < .08 || crossesStair(start, bank.at, .06)) continue;
    // Publish equipment only after its route is proven. If a large wall span is
    // beside a core opening, the next suitable span becomes the service node.
    const bs = Math.sin(bank.angle), bc = Math.cos(bank.angle);
    builder.module('wall-shelf-damaged-meter-bank', bank.room, bank.mount, [1, 1, 1], bank.angle);
    builder.module('wall-shelf-damaged-meter-drops', bank.room,
      [bank.mount[0] + bs * .065, 0, bank.mount[2] + bc * .065], [1, .85 / .5, 1], bank.angle);
    for (const y of [.20, .63]) builder.module('wall-shelf-damaged-meter-drop-clips', bank.room,
      [bank.mount[0] + bs * .065, y, bank.mount[2] + bc * .065], [1, 1, 1], bank.angle);
    decorated.add(bank.room);
    const angle = Math.atan2(-bz, bx), length = reach - .12;
    builder.module('ceiling-services-damaged-branch', bank.room,
      [start[0] + bx / reach * length / 2, origin[1], start[2] + bz / reach * length / 2], [length / .5, 1, 1], angle);
    builder.module('ceiling-services-damaged-elbow', bank.room, [bank.at[0], origin[1], bank.at[2]], [1, 1, 1], angle);
    builder.module('wall-shelf-damaged-feed', bank.room, bank.at, [1, height / .5, 1]);
    const clips = Math.max(1, Math.ceil(height / .65));
    for (let i = 0; i < clips; i++) builder.module('wall-shelf-damaged-feed-clip', bank.room,
      [bank.at[0], bank.at[1] + height * ((i + .5) / clips), bank.at[2]], [1, 1, 1], bank.angle);
  }
}
