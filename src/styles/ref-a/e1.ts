import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { StyleSpec } from '../systems/types.js';
import { E1_SLOT } from './e1-slots.js';
import { E6_PANEL } from './e6.js';

/** E1, the high-tech suite of the kind A tower. Every number here is a construction value
 *  of the suite, in metres: the wall panel rhythm and its seams, the dark gloss ceiling
 *  grid and its reveal, the stone floor, the glass rock pit of the lounge, the portals and
 *  the built-ins the rooms name. */
export const E1 = {
    /** storey the suite stands in: 3.6 m pitch, clear 3.1 m (ceiling datum 3.25 m) */
    pitch: 3.6,
    wall: {
        /** cream full-height panels on the metre, phased to the half-metre grid */
        pitch: 1,
        /** thin dark seam between columns */
        seam: .006,
        /** horizontal seams: the pill-fixing course at 1.2 m and the head course at 2.15 m */
        seams: [1.2, 2.15],
        /** black recessed band under the ceiling, no lens */
        head: .22,
                /** pill fixings: 10 x 22.5 mm plates 35 mm in from the column edge, 45 mm off each seam */
        fixing: { inset: [.035, .045] as [number, number], radius: .005 },
        bevel: .01,
        depth: [.088, .095] as [number, number],
    },
    ceiling: {
        /** dark gloss squares on the metre, 2 x 2 per baked block, 8 mm black joints, symmetric in the room */
        pitch: 1, block: 2, joint: .008,
        /** black reveal band along the walls, recessed 34 mm */
        reveal: { width: .22, rise: .034 },
    },
    floor: {
        /** dark polished stone in 1.5 m squares with 3 mm joints, laid from the room corner, 2 x 2 per baked block */
        tile: 1.5, joint: .003, block: 2,
        /** walk-on glass pit of the lounge: 2.4 x 4.0 m stadium, 0.8 m ends, cyan lit; 0.32 m deep,
         *  inside the 0.35 m between the finished floor and the ceiling of the storey below */
        pit: { size: [2.4, 4] as [number, number], radius: .8, depth: .32, lumensPerMetre: 120 },
    },
    /** portal opening of the suite (two leaves, head 2.5 m): e1-inner R 0.26 with the e1-outer step R 0.5 */
    portal: { width: 2.7, head: 2.5 },
    cyan: [.08, .78, 1] as [number, number, number],
} as const;

/** Living, kitchen, bedroom and circulation walls: cream panels with the two fixed seams. */
export const E1_PANEL = panelPreset('A', 'e1', {
    system: { pitch: [E1.wall.pitch], seam: E1.wall.seam, rows: E1.wall.seams[1], head: { height: E1.wall.head, module: 'wall-field-meridian-backing' }, foot: null },
    profile: {
        skin: E1_SLOT.cream, bevel: { radius: E1.wall.bevel, segments: 3 }, depth: [...E1.wall.depth],
        seams: E1.wall.seams.map(y => ({ y, width: E1.wall.seam, slot: F.black })),
        fixings: { inset: [...E1.wall.fixing.inset], radius: E1.wall.fixing.radius, slot: F.black, pairs: 1 },
    },
});

export const E1_CEILING = ceilingPreset('A', 'e1', {
    system: {
        grid: { pitch: [E1.ceiling.pitch, E1.ceiling.pitch], block: 'ceiling-e1-grid1x1', blockCells: [E1.ceiling.block, E1.ceiling.block], joint: E1.ceiling.joint, phase: 'room-centre' },
        perimeter: { width: E1.ceiling.reveal.width, drop: -E1.ceiling.reveal.rise, edge: 'ceiling-e1-backing', corner: 'ceiling-e1-backing' },
    },
    profile: { panel: E1_SLOT.gloss, backing: F.black, bevel: .004 },
});

const floorSystem = { tile: { size: [E1.floor.tile, E1.floor.tile] as [number, number], joint: E1.floor.joint, block: 'floor-finish-e1-stone', blockTiles: [E1.floor.block, E1.floor.block] as [number, number], phase: 'room' as const } };
export const E1_FLOOR = floorPreset('A', 'e1', { system: floorSystem, profile: { tile: E1_SLOT.stone } });
/** The lounge floor: the same stone round the glass rock pit. Its stone blocks are E1's. */
export const E1_LOUNGE_FLOOR = floorPreset('A-pit', 'e1-lounge', {
    system: {
        ...floorSystem, support: 'floor-slab-e1-support',
        pit: { size: E1.floor.pit.size, radius: E1.floor.pit.radius, depth: E1.floor.pit.depth,
            straight: 'floor-slab-e1-lounge-pit-straight', end: 'floor-slab-e1-lounge-pit-end', rim: 'floor-slab-e1-lounge-pit',
            lens: { color: E1.cyan, lumensPerMetre: E1.floor.pit.lumensPerMetre } },
    },
    profile: { tile: E1_SLOT.stone },
});

/** Rooms whose wide openings take the suite portal on both sides. */
const PORTAL_ROOMS: ReadonlySet<RoomKind> = new Set(['living', 'kitchen', 'bedroom', 'dining_area', 'studio_main', 'lounge']);
const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);

export const E1_STYLE: StyleSpec = {
    id: 'e1', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        const field = kind === 'storage' ? E6_PANEL.system.id : E1_PANEL.system.id;
        const floor = kind === 'living' ? E1_LOUNGE_FLOOR.system.id : WET.has(kind) ? 'floor-slab-marble' : E1_FLOOR.system.id;
        return { ...plain, family: 'luxury', field, floor, ceiling: E1_CEILING.system.id, casing: 'e1',
            ...(PORTAL_ROOMS.has(kind) ? { portal: 'e1-inner' } : {}) };
    },
    // A cove record of the suite's own lenses (the pit) takes the style's cove module where
    // the placements lay one per cove record: the pit lens itself, so nothing new shows.
    lights: { plannedCoves: false, kelvin: 3800, cove: 'ceiling-cove-e1-lounge-pit' },
    entrance: 'luxury',
    housings: ['housing-e1-ac', 'housing-e1-portal'],
};
