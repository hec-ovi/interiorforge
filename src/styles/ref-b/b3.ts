import type { RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { levelRecipes, type LevelProfile } from '../systems/levels.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { Point } from '../../core/geom.js';
import type { LightFixture } from '../../core/types.js';
import { uvToWorld } from '../../layout/uv.js';
import { exposedSides, zoneRect } from '../systems/levels.js';
import { facingRotation } from '../systems/surface-grid.js';
import type { DressContext, StyleSpec } from '../systems/types.js';
import { B_LOOK, B_WARM } from './looks.js';

/** B3, the rich glass building's apartment with the raised bar: smoked walnut fields in
 *  1.2 m panels with fine gold joints and a gold reveal under the ceiling in the living
 *  rooms, charcoal fields with gold seams in the bedroom, dark lacquer with bronze strips in
 *  the bath; warm walnut planks inside a pale timber border in the living rooms (the
 *  platform and the pit in the same planks), smoked wide planks in the bedroom, white
 *  marble in the bath; a glossy dark ceiling inside a dropped ring
 *  whose fascia carries a warm up-light (the double light loop); the bar stands on a
 *  raised platform with gold-nosed lit steps and a glass guard. */

export const B3 = {
    /** living panel pitch and joint */
    pitch: 1.2, seam: .004,
    /** raised bar platform: height, riser count follows (0.45 m → 3 risers of 0.15) */
    bar: { delta: .45 },
} as const;

const wall = panelPreset('B', 'b3', {
    system: { pitch: [B3.pitch], exact: true, rows: 2.1, seam: B3.seam, minColumn: .3 },
    profile: { skin: B_LOOK.smoked, backing: B_LOOK.gold, seams: [] },
});
const bedWall = panelPreset('B', 'b3-bed', {
    system: { pitch: [1], rows: 2.1, seam: .006, head: { height: .05, module: 'wall-panel-b3-bed-backing' }, minColumn: .3 },
    profile: { skin: B_LOOK.charcoal, backing: B_LOOK.gold, seams: [{ y: 2.2, width: .012, slot: B_LOOK.gold }] },
});
const wetWall = panelPreset('B', 'b3-wet', {
    system: { pitch: [.6, 1.2], exact: true, rows: 2.1, seam: .01, head: { height: .08, module: 'wall-panel-b3-wet-backing' },
        foot: { height: .05, module: 'wall-panel-b3-wet-foot' }, minColumn: .25 },
    profile: { skin: B_LOOK.charcoal, backing: B_LOOK.bronze, seams: [], foot: { slot: B_LOOK.bronze, depth: .1 } },
});
const livingFloor = floorPreset('B-plank', 'b3', {
    system: { tile: { size: [2.4, .2], joint: .002, block: 'floor-finish-b3-planks', blockTiles: [1, 5], phase: 'room' },
        border: { width: .18, module: 'floor-finish-b3-border' } },
    profile: { tile: B_LOOK.walnut, border: B_LOOK.oak },
});
const bedFloor = floorPreset('B-plank', 'b3-plank', {
    system: { tile: { size: [2.4, .3], joint: .002, block: 'floor-finish-b3-plank-planks', blockTiles: [1, 4], phase: 'room' } },
    profile: { tile: B_LOOK.smoked },
});
const wetFloor = floorPreset('B', 'b3-marble', {
    system: { tile: { size: [1.2, 1.2], joint: .002, block: 'floor-finish-b3-marble-slab', blockTiles: [2, 2], phase: 'room' },
        border: { width: .06, module: 'floor-finish-b3-marble-border' } },
    profile: { tile: B_LOOK.marble, border: B_LOOK.bronze },
});
const ceiling = ceilingPreset('B', 'b3', {
    system: {
        grid: { pitch: [1.2, 1.2], block: 'ceiling-b3-grid12', blockCells: [2, 2], joint: .004, phase: 'room-centre' },
        steps: [{ inset: .6, drop: .15, fascia: 'ceiling-b3-step', lens: { module: 'ceiling-cove-b3-step', y: .14, facing: 'up', lumensPerMetre: 38, kelvin: B_WARM, proud: .03 } }],
    },
    profile: { panel: B_LOOK.gloss, backing: B_LOOK.black, step: B_LOOK.smoked },
});
const wetCeiling = ceilingPreset('B', 'b3-wet', {
    system: { grid: { pitch: [1.2, 1.2], block: 'ceiling-b3-wet-grid12', blockCells: [2, 2], joint: .004, phase: 'room-centre' }, steps: [] },
    profile: { panel: B_LOOK.stone, backing: B_LOOK.bronze },
});

export const B3_LEVEL: LevelProfile = {
    top: B_LOOK.walnut, riser: B_LOOK.smoked, nosing: B_LOOK.gold,
    guard: { glass: B_LOOK.glass, cap: B_LOOK.gold },
    lit: { kelvin: B_WARM, lumensPerMetre: 18 },
};

const BED: ReadonlySet<RoomKind> = new Set(['bedroom', 'storage']);
const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);

export const b3Style: StyleSpec = {
    id: 'b3', kind: 'B', tier: 'rich',
    finish(room: RoomKind, _floorKind, base: RoomFinish): RoomFinish {
        const wet = WET.has(room), bed = BED.has(room);
        return {
            ...base, family: 'luxury', frame: undefined, band: undefined, services: undefined,
            field: wet ? wetWall.system.id : bed ? bedWall.system.id : wall.system.id,
            floor: wet ? wetFloor.system.id : bed ? bedFloor.system.id : livingFloor.system.id,
            ceiling: wet ? wetCeiling.system.id : ceiling.system.id,
        };
    },
    lights: { plannedCoves: false, kelvin: B_WARM },
    entrance: 'luxury',
    dress: dressLoungePit,
};

/** The lounge pit's seating stands on the pit floor, below the room's walking level, where
 *  no furniture record may stand: the media console against the pit's wall side, the cream
 *  sectional facing it across the pit, a low table between. Placed as modules. */
function dressLoungePit(ctx: DressContext): LightFixture[] {
    for (const room of ctx.rooms) {
        const planned = ctx.uv.rooms.find(r => r.id === room.id);
        for (const zone of planned?.levels ?? []) {
            if (zone.delta >= 0) continue;
            const z = zoneRect(zone), open = exposedSides(z, [planned!.polygon!, ...(planned!.holes ?? [])]);
            // The wall side the pit leans on faces the sofa; else its longest side.
            const wall = (['u0', 'u1', 'v0', 'v1'] as const).find(side => !open[side].length) ?? (z.lu >= z.lv ? 'v0' : 'u0');
            const alongU = wall[0] === 'v', inward: Point = wall === 'u0' ? [1, 0] : wall === 'u1' ? [-1, 0] : wall === 'v0' ? [0, 1] : [0, -1];
            const across = alongU ? z.lv : z.lu, mid: Point = [z.u + z.lu / 2, z.v + z.lv / 2];
            const edge: Point = wall === 'u0' ? [z.u, mid[1]] : wall === 'u1' ? [z.u + z.lu, mid[1]] : wall === 'v0' ? [mid[0], z.v] : [mid[0], z.v + z.lv];
            const at = (d: number): [number, number, number] => {
                const [x, zz] = uvToWorld([edge[0] + inward[0] * d, edge[1] + inward[1] * d], ctx.frame);
                return [x, zone.delta, zz];
            };
            const toward = facingRotation(inward, ctx.frame), back = facingRotation([-inward[0], -inward[1]], ctx.frame);
            ctx.builder.module('fit-media-corpo', room.id, at(.3), [1, 1, 1], toward);
            if (across >= 3.2) {
                ctx.builder.module('fit-sofa-corpo', room.id, at(across - .75), [1, 1, 1], back);
                if (across >= 4) ctx.builder.module('fit-bedside-corpo', room.id, at(across - 1.75), [1.6, 1, 1.2], back);
            }
            void alongU;
        }
    }
    return [];
}

export const b3 = {
    styles: [b3Style],
    panels: [wall.system, bedWall.system, wetWall.system],
    floors: [livingFloor.system, bedFloor.system, wetFloor.system],
    ceilings: [ceiling.system, wetCeiling.system],
    recipes: [wall.recipes, bedWall.recipes, wetWall.recipes, livingFloor.recipes, bedFloor.recipes, wetFloor.recipes,
        ceiling.recipes, wetCeiling.recipes, levelRecipes('b3', B3_LEVEL)],
};
