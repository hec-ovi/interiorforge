import type { Point } from '../../core/geom.js';
import type { BlueprintFloor, FloorKind, InteriorRequest } from '../../core/types.js';
import type { CorePlan } from '../core-plan.js';
import type { PlanRoom } from '../plan-types.js';
import type { IdGen } from '../rooms.js';
import type { UvRect } from '../uv.js';
import { Composer } from './composer.js';
import { worldToUv } from '../uv.js';
import { templateTrace } from '../templates/fit.js';
import { composedPlate } from './core.js';
import { coreBox, crownA, groundA, LOOK_A, LOOK_R, typicalA, wearing } from './kind-a.js';
import { groundB, groundC, LOOK_B, LOOK_C, typicalC } from './kind-bc.js';
import { groundR, OFFICE_TYPES, officeR } from './kind-r.js';

export interface ComposedFloor {
  rooms: PlanRoom[];
  sealed: UvRect[];
  /** the through cars open their back doors on this floor */
  rearLanding: boolean;
}

/** The floor programs a composed building plans itself. */
const COMPOSED_FLOORS: ReadonlySet<FloorKind> = new Set(['lobby', 'apartment', 'residence_studio', 'office', 'corpo_office']);
// kind C's ground floor plans as its lobby whatever the blueprint calls it (`entry`)

/** A building's own turn through the office plan types, from its seed. */
function seedOffset(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % OFFICE_TYPES.length;
}

/** How many arrangements a composed building's typical floors turn through (1 when the
 *  building does not compose). */
export function composedTurns(request: InteriorRequest, kind: FloorKind): number {
  if (!composedPlate(request.blueprint, request.building)) return 1;
  const plate = composedPlate(request.blueprint, request.building)!;
  return kind === 'apartment' || kind === 'residence_studio' ? (plate.kind === 'C' || plate.kind === 'B' ? 2 : 3) : kind === 'office' || kind === 'corpo_office' ? OFFICE_TYPES.length : 1;
}

/** A whole floor composed from its kind's plan, or null where the generic planner keeps it. */
export function planComposedFloor(request: InteriorRequest, floor: BlueprintFloor, kind: FloorKind, core: CorePlan,
  plate: Point[], ids: IdGen): ComposedFloor | null {
  if (!core.openPlan || !COMPOSED_FLOORS.has(kind)) return null;
  const composed = composedPlate(request.blueprint, request.building);
  if (!composed) return null;
  const c = new Composer(plate, floor.index, ids, composed.mirror);
  const cut = [core.stairA, core.riser, core.stub, ...core.elevators.map(e => e.rect)];
  const box = coreBox(c, cut);
  const top = Math.max(...request.blueprint.floors.map(f => f.index));
  const main = floor.openings.find(o => o.doorRole === 'main') ?? floor.openings.find(o => o.kind === 'door' || o.kind === 'openFront');
  const entrance = main ? (() => {
    const a = floor.outline[main.edge]!, b = floor.outline[(main.edge + 1) % floor.outline.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (main.offset + main.width / 2) / len;
    return c.planPoint(worldToUv([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], core.frame))[0];
  })() : c.W / 2;
  const office = kind === 'office' || kind === 'corpo_office';
  wearing(composed.kind === 'B' ? LOOK_B : composed.kind === 'C' ? LOOK_C : composed.kind === 'R' ? LOOK_R : LOOK_A);
  const result = composed.kind === 'B' && kind === 'lobby' ? groundB(c, box, plate as [number, number][], entrance)
    : composed.kind === 'C' ? (kind === 'lobby' ? groundC(c, box, plate as [number, number][], entrance) : typicalC(c, box, floor.index))
    : composed.kind === 'R'
    ? (kind === 'lobby' ? groundR(c, box, plate as [number, number][], entrance)
      : officeR(c, box, plate as [number, number][], OFFICE_TYPES[(floor.index + seedOffset(String(request.seed))) % OFFICE_TYPES.length]!))
    : composed.kind === 'B' ? (floor.index === top || floor.index % 2 === 0 ? crownA(c, box) : typicalA(c, box, 2))
    : kind === 'lobby' ? groundA(c, box, plate as [number, number][], entrance)
    : office ? officeR(c, box, plate as [number, number][], OFFICE_TYPES[(floor.index + seedOffset(String(request.seed))) % OFFICE_TYPES.length]!)
    : floor.index === top ? crownA(c, box)
    : typicalA(c, box, (((floor.index - 1) % 3) + 3) % 3);
  // the stair's mouth and every lift landing the floor serves stay clear of furniture
  const stair = core.stairA, keep: UvRect[] = [{ u: stair.u, v: stair.v - 1.8, lu: stair.lu, lv: 1.8 }];
  for (const { rect } of core.elevators) {
    keep.push({ u: rect.u - .3, v: rect.v - 1.8, lu: rect.lu + .6, lv: 1.8 });
    if (result.rearLanding) keep.push({ u: rect.u - .3, v: rect.v + rect.lv, lu: rect.lu + .6, lv: 1.8 });
  }
  for (const opening of floor.openings.filter(o => o.kind === 'door' || o.kind === 'openFront')) {
    const a = floor.outline[opening.edge]!, b = floor.outline[(opening.edge + 1) % floor.outline.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (opening.offset + opening.width / 2) / len;
    const at = worldToUv([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], core.frame);
    keep.push({ u: at[0] - opening.width / 2 - .5, v: at[1] - 3, lu: opening.width + 1, lv: 6 });
  }
  const dropped = c.settle(keep);
  if (dropped.length) templateTrace(`composed floor ${floor.index}: ${dropped.join('; ')}`);
  return { rooms: result.rooms, sealed: [core.stub], rearLanding: result.rearLanding };
}
