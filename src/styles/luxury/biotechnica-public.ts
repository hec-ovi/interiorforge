import type { FloorInterior, RoomKind } from '../../core/types.js';
import type { Point } from '../../core/geom.js';
import type { RoomFinish } from '../../placements/finish.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { uvToWorld, type Frame, type UvRect } from '../../layout/uv.js';
import { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import { luxuryPortalRecipes } from './portals.js';
import { MERIDIAN_IVORY } from './surfaces.js';

/** Biotechnica floor-19 PUBLIC sequence 63108–63639. Its dark public palette is
 * deliberately separate from the cream private-suite sequence. Dimensions below
 * are our construction system, not claimed measurements of the captured game. */
export const BIOTECHNICA_PUBLIC = {
  wall: 'wall-field-biotechnica-public',
  floor: 'floor-slab-biotechnica-public',
  ceiling: 'ceiling-field-biotechnica-public',
  fixture: 'ceiling-spot-biotechnica-public-field',
  support: 'floor-slab-biotechnica-public-support',
} as const;
const MATERIAL = {
  dark: 'cyberpunk/gutierrez-lacquer/rich#ink',
  floor: 'cyberpunk/corpo-plaza-stone/rich#basin',
  pale: 'cyberpunk/loft1702-stone/rich#pale',
  bronze: F.bronze,
} as const;
const PUBLIC: ReadonlySet<RoomKind> = new Set(['reception', 'lounge', 'corridor', 'elevator_lobby', 'concourse']);
export const isBiotechnicaPublicRoom = (kind: RoomKind): boolean => PUBLIC.has(kind);

/** Caller dispatches only luxury ground/public rooms. No private, wet or service
 * room changes its finish merely because it shares the building's wealth tier. */
export function biotechnicaPublicFinish(kind: RoomKind, base: RoomFinish): RoomFinish {
  if (!isBiotechnicaPublicRoom(kind)) return base;
  const { frame: _frame, band: _band, services: _services, ...plain } = base;
  return { ...plain, field: BIOTECHNICA_PUBLIC.wall, floor: BIOTECHNICA_PUBLIC.floor,
    ceiling: BIOTECHNICA_PUBLIC.ceiling, cove: 'ceiling-cove-biotechnica-public', spot: BIOTECHNICA_PUBLIC.fixture };
}

const portalVariants = new Map<string, string>();
export const biotechnicaPublicRecipes: RecipeSet = add => {
  add(BIOTECHNICA_PUBLIC.wall, k => k.cbox(MATERIAL.dark, [0, 0, .0475], [.5, .5, .095]));
  add('wall-biotechnica-public-base', k => {
    k.cbox(MATERIAL.dark, [0, 0, .089], [.5, .11, .018]);
    k.cbox(MATERIAL.bronze, [0, .11, .096], [.5, .003, .004]);
  });
  add('wall-biotechnica-public-joint', k => k.cbox(MATERIAL.bronze, [0, 0, .096], [.003, .5, .002]));
  add(BIOTECHNICA_PUBLIC.floor, k => {
    k.cbox(F.concrete, [0, -.15, 0], [.5, .132, .5]);
    k.cbox(MATERIAL.pale, [0, -.018, 0], [.5, .018, .5]);
  });
  add(BIOTECHNICA_PUBLIC.support, k => k.cbox(F.concrete, [0, -.15, 0], [.5, .132, .5]));
  for (const [name, material] of [['dark', MATERIAL.floor], ['pale', MATERIAL.pale], ['inlay', MATERIAL.bronze], ['joint', F.black]] as const)
    add(`floor-finish-biotechnica-public-${name}`, k => k.cbox(material, [0, -.018, 0], [.5, .018, .5]));
  add(BIOTECHNICA_PUBLIC.ceiling, k => k.cbox(MATERIAL.dark, [0, 0, 0], [.5, .085, .5]));
  add('ceiling-field-biotechnica-public-backing', k => k.cbox(F.black, [0, .085, 0], [.5, .015, .5]));
  add('ceiling-cove-biotechnica-public', k => k.cbox(MATERIAL.bronze, [0, 0, 0], [.5, .012, .022]));
  add(BIOTECHNICA_PUBLIC.fixture, k => {
    // 1.52m closed housing surrounds an actual 1.44m opening. The diffuser is
    // recessed 26mm above the dark soffit, with no opaque sheet in front of it.
    for (const x of [-.746, .746]) k.cbox(MATERIAL.bronze, [x, -.004, 0], [.028, .09, 1.52]);
    for (const z of [-.746, .746]) k.cbox(MATERIAL.bronze, [0, -.004, z], [1.464, .09, .028]);
    for (const x of [-.723, .723]) k.cbox(F.black, [x, .004, 0], [.018, .082, 1.464]);
    for (const z of [-.723, .723]) k.cbox(F.black, [0, .004, z], [1.428, .082, .018]);
    k.cbox(F.lensWarm, [0, .026, 0], [1.414, .006, 1.414]);
    k.cbox(F.black, [0, .088, 0], [1.52, .010, 1.52]);
  });
  // Identical portal geometry retains all opening sizes, independent corner
  // radii, slots and collision bounds. Only the public-facing skin vocabulary
  // changes; the original private portal recipes are untouched.
  luxuryPortalRecipes((id, draw) => {
    const target = `${id}-biotechnica-public`; portalVariants.set(id, target);
    add(target, k => {
      const source = new Kit(() => [1, 1]); draw(source);
      for (const slot of source.mesh.materials()) {
        const material = slot === MERIDIAN_IVORY ? MATERIAL.dark : slot === F.black ? MATERIAL.bronze : slot;
        k.mesh.addSurface(material, source.mesh.getGroup(slot)!);
      }
    });
  });
};

function placeRect(builder: PlacementBuilder, module: string, room: string, r: UvRect, y: number, frame: Frame): void {
  const [x, z] = uvToWorld([r.u + r.lu / 2, r.v + r.lv / 2], frame);
  builder.module(module, room, [x, y, z], [r.lu / .5, 1, r.lv / .5], -frame.angleDeg * Math.PI / 180);
}

/** Dark broad panels and large luminous fields share one real ceiling grid.
 * Fixed fixture dimensions are never stretched to a narrow polygon remainder. */
export function placeBiotechnicaPublicCeiling(builder: PlacementBuilder, room: string, rect: UvRect, y: number, frame: Frame): void {
  placeRect(builder, 'ceiling-field-biotechnica-public-backing', room, rect, y, frame);
  const cols = Math.max(1, Math.floor(rect.lu / 1.65)), rows = Math.max(1, Math.floor(rect.lv / 1.65));
  const width = rect.lu / cols, depth = rect.lv / rows;
  const frequency = Math.max(3, Math.ceil(rect.lu * rect.lv / 240));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const r = { u: rect.u + i * width + .003, v: rect.v + j * depth + .003, lu: width - .006, lv: depth - .006 };
    const illuminated = r.lu >= 1.58 && r.lv >= 1.58 && (i + j) % frequency === 0;
    if (!illuminated) { placeRect(builder, BIOTECHNICA_PUBLIC.ceiling, room, r, y, frame); continue; }
    const u = r.u + r.lu / 2, v = r.v + r.lv / 2, side = .76;
    for (const part of [
      { u: r.u, v: r.v, lu: r.lu, lv: v - side - r.v },
      { u: r.u, v: v + side, lu: r.lu, lv: r.v + r.lv - v - side },
      { u: r.u, v: v - side, lu: u - side - r.u, lv: 2 * side },
      { u: u + side, v: v - side, lu: r.u + r.lu - u - side, lv: 2 * side },
    ]) if (part.lu > 1e-5 && part.lv > 1e-5) placeRect(builder, BIOTECHNICA_PUBLIC.ceiling, room, part, y, frame);
    const [x, z] = uvToWorld([u, v], frame);
    builder.module(BIOTECHNICA_PUBLIC.fixture, room, [x, y, z], [1, 1, 1], -frame.angleDeg * Math.PI / 180);
  }
}

/** Square-distance to an orthogonal boundary makes crisp architectural borders,
 * including re-entrant corners. It does not create rounded or stepped pixel edges. */
function edgeDistance(point: Point, rings: readonly (readonly Point[])[]): number {
  let distance = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const du = Math.max(Math.min(a[0], b[0]) - point[0], point[0] - Math.max(a[0], b[0]), 0);
    const dv = Math.max(Math.min(a[1], b[1]) - point[1], point[1] - Math.max(a[1], b[1]), 0);
    distance = Math.min(distance, Math.max(du, dv));
  }
  return distance;
}

/** Partition, never overlay, the entire walking plane into a pale perimeter,
 * bronze separator and dark 1.5m fields. Every part finishes at exact Y0. */
export function placeBiotechnicaPublicFloor(builder: PlacementBuilder, room: string, rect: UvRect, y: number, frame: Frame,
  polygon: readonly Point[], holes: readonly (readonly Point[])[] = []): void {
  placeRect(builder, BIOTECHNICA_PUBLIC.support, room, rect, y, frame);
  const rings = [polygon, ...holes], band = .45, inlay = .012, tile = 1.5, joint = .003;
  const breaks = (axis: 0 | 1, lo: number, hi: number): number[] => {
    const values = [lo, hi];
    for (const ring of rings) for (const p of ring) for (const offset of [-band, -band + inlay, 0, band - inlay, band]) {
      const v = p[axis] + offset; if (v > lo + 1e-7 && v < hi - 1e-7) values.push(v);
    }
    for (let n = Math.floor(lo / tile); n * tile < hi; n++) for (const d of [-joint / 2, joint / 2]) {
      const v = n * tile + d; if (v > lo + 1e-7 && v < hi - 1e-7) values.push(v);
    }
    return [...new Set(values.map(v => Math.round(v * 1e8) / 1e8))].sort((a, b) => a - b);
  };
  const us = breaks(0, rect.u, rect.u + rect.lu), vs = breaks(1, rect.v, rect.v + rect.lv);
  const pieces: (UvRect & { finish: string })[] = [];
  const onJoint = (n: number) => Math.abs(n - Math.round(n / tile) * tile) < joint / 2 + 1e-7;
  for (let j = 0; j < vs.length - 1; j++) {
    let current: (UvRect & { finish: string }) | undefined;
    const flush = () => {
      if (!current) return;
      const previous = pieces.find(p => p.finish === current!.finish && Math.abs(p.u - current!.u) < 1e-7
        && Math.abs(p.lu - current!.lu) < 1e-7 && Math.abs(p.v + p.lv - current!.v) < 1e-7);
      if (previous) previous.lv += current.lv; else pieces.push(current);
    };
    for (let i = 0; i < us.length - 1; i++) {
      const u = us[i]!, v = vs[j]!, lu = us[i + 1]! - u, lv = vs[j + 1]! - v;
      if (lu < 1e-7 || lv < 1e-7) continue;
      const center: Point = [u + lu / 2, v + lv / 2], distance = edgeDistance(center, rings);
      const finish = distance < band - inlay ? 'pale' : distance < band ? 'inlay'
        : onJoint(center[0]) || onJoint(center[1]) ? 'joint' : 'dark';
      if (current?.finish === finish) current.lu += lu;
      else { flush(); current = { u, v, lu, lv, finish }; }
    }
    flush();
  }
  for (const piece of pieces) placeRect(builder, `floor-finish-biotechnica-public-${piece.finish}`, room, piece, y, frame);
}

function publicRooms(floor: FloorInterior): Set<string> {
  const core = new Set([...(floor.core?.stairs ?? []), ...(floor.core?.elevators ?? [])].map(c => c.id));
  return new Set(floor.rooms.filter(r => !core.has(r.id) && isBiotechnicaPublicRoom(r.kind)).map(r => r.id));
}
/** Run before placeLayout takes its `planned` light snapshot. Furniture-owned
 * planter/table lamps remain; generic perimeter coves/downlights do not duplicate
 * the public ceiling's authored luminous fields. */
export function prepareBiotechnicaPublicLights(floor: FloorInterior): void {
  const rooms = publicRooms(floor);
  floor.lights = floor.lights.filter(light => light.furniture || !rooms.has(light.room));
}
/** Run after props and before illumination balancing. Structural/dynamic room and
 * furniture records are untouched; only appearance parts and real lights enter. */
export function dressBiotechnicaPublic(builder: PlacementBuilder, floor: FloorInterior): void {
  const rooms = publicRooms(floor);
  for (const p of [...builder.placements]) {
    if (!rooms.has(p.room)) continue;
    const replacement = portalVariants.get(p.module ?? '');
    if (replacement) p.module = replacement;
    if (p.module === BIOTECHNICA_PUBLIC.wall) {
      const width = p.scale[0] * .5, height = p.scale[1] * .5;
      if (height < 1.4) continue;
      if (Math.abs(p.position[1]) < .01) builder.module('wall-biotechnica-public-base', p.room, [...p.position], [width / .5, 1, 1], p.rotationY);
      const count = Math.max(1, Math.ceil(width / 2.1));
      for (let i = 1; i < count; i++) {
        const x = -width / 2 + width * i / count;
        builder.module('wall-biotechnica-public-joint', p.room,
          [p.position[0] + x * Math.cos(p.rotationY), p.position[1] + .113, p.position[2] - x * Math.sin(p.rotationY)],
          [1, (height - .113) / .5, 1], p.rotationY);
      }
    }
    if (p.module === BIOTECHNICA_PUBLIC.fixture) {
      floor.lights.push({ id: `${p.id}:public-field`, kind: 'strip', room: p.room,
        position: [p.position[0], floor.elevation + p.position[1] + .026, p.position[2]],
        length: 1.414, angleDeg: -p.rotationY * 180 / Math.PI,
        axis: [Math.cos(p.rotationY), 0, -Math.sin(p.rotationY)], direction: [0, -1, 0],
        intensity: 2300, colorTemperatureK: 3000, range: 5, beamDeg: 170, diffuse: .95, facing: 'down' });
    }
  }
}
