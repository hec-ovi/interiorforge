import type { Furniture, LightFixture, RoomKind } from '../../core/types.js';
import type { DressContext, StyleSpec } from '../systems/types.js';
import { itemFrame } from '../systems/built-ins.js';
import { R1_CEILING, R1_FLOOR, R1_GLAZING, R1_PANEL, R1_PORTALS } from './systems.js';
import { CHEST } from './furniture.js';

/** The rich office (r1): every room of a kind R building wears it over the corporate family.
 *  - The executive and private offices and the public rooms take the graphite panel walls
 *    with bronze inlays and the red floor line; the open office, meeting rooms, services and
 *    wet rooms keep the corporate family's mineral, slate and service finishes.
 *  - The executive and private offices take the walnut board floor, the continuous timber
 *    ceiling and pendant spots in place of the ceiling strips.
 *  - Office doorways take the layered doorway, the meeting rooms and private offices the
 *    mullioned glazing; the executive office stays closed.
 *  - The dress pass lays the ivory rug under an executive desk and stands the pale timber pier
 *    behind the drawer chest by the door, as in the reference office. */

/** Rooms the corporate family lines in dark graphite: they take the r1 panel system. */
const GRAPHITE = 'wall-field-corporate-graphite';
/** Rooms with the walnut floor, the timber ceiling and pendant spots. */
const TIMBER: ReadonlySet<RoomKind> = new Set(['executive_office', 'office_private']);
/** Rooms whose doorways between them take the layered doorway (both sides one of them). */
const PORTAL_ROOMS: ReadonlySet<RoomKind> = new Set(R1_PORTALS[0]!.rooms);

export const PENDANT = 'ceiling-spot-r1-pendant';
/** The rug under the executive desk: across the desk, reaching `behind` it (the operator
 *  side) and `ahead` towards the visitor, with a bronze band. */
export const RUG = { body: 'floor-finish-r1-rug', border: 'floor-finish-r1-rug-border', width: 2.6, behind: 1, ahead: 3.8, band: .03 };
/** The pale timber pier on the wall behind the drawer chest. */
export const PIER = { module: 'wall-panel-r1-pier', margin: .15, depth: .02 };

export const R1_STYLE: StyleSpec = {
    id: 'r1', kind: 'R', tier: 'rich',
    finish(room, _floorKind, base) {
        const timber = TIMBER.has(room);
        return {
            ...base,
            field: base.field === GRAPHITE ? R1_PANEL.system.id : base.field,
            ...(timber ? { floor: R1_FLOOR.system.id, ceiling: R1_CEILING.system.id, spot: PENDANT } : {}),
            casing: 'r1',
            ...(PORTAL_ROOMS.has(room) ? { portal: R1_PORTALS[0]!.id } : {}),
            glazing: R1_GLAZING.system.id,
        };
    },
    dress: dressR1,
};

/** Pendant spots for the planned ceiling strips of the timber rooms, the rug under each
 *  executive desk, the pier behind each drawer chest. Returns no new records: the spots keep
 *  the strips' records and ids, the rug and the pier are unlit. */
function dressR1(ctx: DressContext): LightFixture[] {
    const timber = new Set(ctx.rooms.filter(room => TIMBER.has(room.kind)).map(room => room.id));
    for (const light of ctx.floor.lights) {
        if (light.furniture || light.kind !== 'strip' || !timber.has(light.room)) continue;
        // the planned light stands later as the finish's spot module under the same id
        Object.assign(light, { kind: 'spot', length: 0, angleDeg: 0, direction: [0, -1, 0], beamDeg: 70, diffuse: .35 });
        delete light.axis;
    }
    const executive = new Set(ctx.rooms.filter(room => room.kind === 'executive_office').map(room => room.id));
    for (const item of ctx.floor.furniture) {
        if (!executive.has(item.room)) continue;
        if (item.kind === 'desk') rug(ctx, item);
        if (item.fit === CHEST.module) pier(ctx, item);
    }
    return [];
}

function rug(ctx: DressContext, desk: Furniture): void {
    const room = ctx.floor.rooms.find(item => item.id === desk.room);
    if (!room) return;
    const frame = itemFrame({ ...desk, elevation: 0 });
    const z0 = -RUG.ahead, z1 = RUG.behind, x0 = -RUG.width / 2, x1 = RUG.width / 2;
    const xs = room.polygon.map(p => p[0]), zs = room.polygon.map(p => p[1]);
    const inside = ([x, z]: [number, number]) => {
        const [px, , pz] = frame.at(x, 0, z);
        return px > Math.min(...xs) + .3 && px < Math.max(...xs) - .3 && pz > Math.min(...zs) + .3 && pz < Math.max(...zs) - .3;
    };
    if (!([[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as [number, number][]).every(inside)) return;
    const b = RUG.band, w = x1 - x0, l = z1 - z0, cz = (z0 + z1) / 2;
    frame.place(ctx.builder, RUG.body, room.id, 0, 0, cz, [(w - 2 * b) / .5, 1, (l - 2 * b) / .5]);
    for (const side of [-1, 1]) {
        frame.place(ctx.builder, RUG.border, room.id, 0, 0, cz + side * (l - b) / 2, [w / .5, 1, b / .5]);
        frame.place(ctx.builder, RUG.border, room.id, side * (w - b) / 2, 0, cz, [b / .5, 1, (l - 2 * b) / .5]);
    }
}

function pier(ctx: DressContext, chest: Furniture): void {
    const frame = itemFrame({ ...chest, elevation: 0 });
    const ceiling = ctx.ceilingY - (ctx.floor.rooms.find(room => room.id === chest.room)?.ceilingDrop ?? 0);
    // the chest's back stands 60 mm off the wall line; the pier stands on the panel face
    const width = CHEST.size[0] + 2 * PIER.margin, back = -chest.size[1] / 2 - .06 + .096;
    frame.place(ctx.builder, PIER.module, chest.room, 0, 0, back, [width / .5, ceiling / .5, 1]);
}
