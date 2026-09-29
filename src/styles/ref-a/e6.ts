import type { FloorKind, Furniture, Room, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { StyleSpec } from '../systems/types.js';
import { sandraFurnitureFor } from '../sandra/furniture.js';
import { SANDRA_MATERIALS as M } from '../sandra/materials.js';

/** E6, the tower's second suite: dark timber wall bays on the metre, timber members over
 *  pale plaster fields in the ceiling, tatami in 0.9 x 1.8 m mats with dark borders, grey
 *  plaster bedrooms (the Sandra plaster and wet fields), a light stone kitchen and a marble bath. Its joinery (lattice screens,
 *  bamboo case, bookcase, writing desk, beds, wardrobe) is the Sandra furniture family. */
export const E6 = {
    wall: { pitch: 1, seam: .005, rows: 2.1 },
    ceiling: { field: [3, 1.5] as [number, number], member: .12, border: .16 },
    mat: { size: [1.8, .9] as [number, number], border: .004 },
} as const;

const PALE = 'cyberpunk/interior-luxury-ceiling/rich#field';

export const E6_PANEL = panelPreset('B', 'e6', {
    system: { pitch: [E6.wall.pitch], seam: E6.wall.seam, rows: E6.wall.rows, head: { height: .05, module: 'wall-panel-e6-backing' }, foot: null },
    profile: { skin: M.timber, backing: F.black, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095], head: { slot: F.black, depth: .097 } },
});

export const E6_CEILING = ceilingPreset('R', 'e6', {
    system: { grid: { pitch: E6.ceiling.field, block: 'ceiling-e6-fields', blockCells: [1, 1], joint: E6.ceiling.member, phase: 'room-centre' },
        perimeter: { width: E6.ceiling.border, drop: .04, edge: 'ceiling-e6-member', corner: 'ceiling-e6-member-corner' } },
    profile: { panel: PALE, backing: M.timber, perimeter: M.timber },
});

export const E6_FLOOR = floorPreset('A', 'e6', {
    system: { tile: { size: E6.mat.size, joint: E6.mat.border, block: 'floor-finish-e6-mat', blockTiles: [1, 2], phase: 'room' } },
    profile: { tile: M.mat, support: F.black },
});

const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);

export const E6_STYLE: StyleSpec = {
    id: 'e6', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        const field = WET.has(kind) ? 'wall-field-sandra-wet' : kind === 'bedroom' ? 'wall-field-sandra-plaster' : E6_PANEL.system.id;
        const floor = WET.has(kind) ? 'floor-slab-marble' : kind === 'kitchen' ? 'floor-slab-stone' : E6_FLOOR.system.id;
        return { ...plain, family: 'luxury', field, floor, ceiling: E6_CEILING.system.id, casing: 'e1' };
    },
    fit(item: Furniture, _room: Room): string | null {
        return sandraFurnitureFor(item.kind)?.module ?? null;
    },
    lights: { plannedCoves: false, kelvin: 2900 },
    entrance: 'luxury',
};
