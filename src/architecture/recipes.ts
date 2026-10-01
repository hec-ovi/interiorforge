import type { BlueprintFloor, InteriorRequest, RoomKind } from '../core/types.js';
import type { Family, RoomFinish } from '../placements/finish.js';
import { damagedArchitectureFinish } from '../styles/damaged/profile.js';
import { capsuleProfile } from '../styles/capsule/profile.js';
import { capsuleProfileFinish } from '../styles/capsule/finish.js';
import { sandraRoomFinish } from '../styles/sandra/finish.js';

/** Each exterior architecture owns its interior proportions and finish recipe.
 * Geometry, circulation and furnishing remain shared, with the shell's reservations authoritative. */
export interface InteriorRecipe {
    id: string;
    frontage: [number, number];
    field: 'ivory' | 'dark' | 'mineral' | 'charcoal' | 'graphite';
    frame: 'timber' | 'ivory' | 'steel' | 'graphite';
    floor: 'stone' | 'plank' | 'obsidian' | 'marble' | 'meridian-stone';
}

export const INTERIOR_RECIPES: readonly InteriorRecipe[] = [
    { id: 'balcony-grid', frontage: [9, 11], field: 'mineral', frame: 'graphite', floor: 'meridian-stone' },
    { id: 'corporate-sectors', frontage: [10, 14], field: 'charcoal', frame: 'steel', floor: 'obsidian' },
    { id: 'faceted-bays', frontage: [8, 10], field: 'ivory', frame: 'timber', floor: 'stone' },
    { id: 'mirror-frame', frontage: [8, 12], field: 'graphite', frame: 'ivory', floor: 'marble' },
    { id: 'mirror-shutters', frontage: [6, 9], field: 'charcoal', frame: 'steel', floor: 'stone' },
    { id: 'white-grid', frontage: [7, 9], field: 'ivory', frame: 'steel', floor: 'marble' },
    { id: 'garden-taper', frontage: [10, 12], field: 'ivory', frame: 'timber', floor: 'plank' },
    { id: 'rounded-corner', frontage: [8, 12], field: 'ivory', frame: 'timber', floor: 'marble' },
    { id: 'chamfered-corners', frontage: [8, 10], field: 'dark', frame: 'steel', floor: 'stone' },
    { id: 'terrace-blocks', frontage: [7, 11], field: 'ivory', frame: 'timber', floor: 'plank' },
    { id: 'paired-rounded', frontage: [9, 11], field: 'ivory', frame: 'timber', floor: 'stone' },
    { id: 'paired-rectangular', frontage: [9, 11], field: 'dark', frame: 'ivory', floor: 'stone' },
];

export function interiorRecipe(request: InteriorRequest): InteriorRecipe | null {
    const assembly = request.blueprint.assembly as { architecture?: string } | undefined;
    return INTERIOR_RECIPES.find(recipe => recipe.id === assembly?.architecture) ?? null;
}

/** This paired shell already owns closed inner walls, frames and finished window returns.
 * Its room envelope bounds partitions, not a second facade inside the real one. */
export function shellOwnsFacade(request: InteriorRequest, floor: BlueprintFloor): boolean {
    return !!floor.roomEnvelope && [
        'balcony-grid', 'corporate-sectors', 'faceted-bays', 'white-grid',
        'mirror-shutters', 'mirror-frame', 'garden-taper',
    ].includes(interiorRecipe(request)?.id ?? '');
}

/** Walls and ceilings in the architecture's palette; the selected floor keeps its room
 *  and venue role. A room wearing a registered reference
 *  style keeps the family base untouched: its style finishes it, and the recipe palette must
 *  not overwrite the reference surfaces. */
export function architectureFinish(request: InteriorRequest, family: Family, room: RoomKind, base: RoomFinish, styled = false): RoomFinish {
    if (styled) return base;
    if (family === 'capsule') return request.building.interiorStyle === 'sandra-dorsett'
        ? sandraRoomFinish(room, 'apartment', base) : capsuleProfileFinish(capsuleProfile(request), room, base);
    if (family === 'damaged') {
        const architecture = (request.blueprint.assembly as { architecture?: string } | undefined)?.architecture;
        return damagedArchitectureFinish(architecture, base);
    }
    const recipe = interiorRecipe(request);
    if (!recipe || family !== 'luxury') return base;
    const service = ['bathroom', 'toilets', 'locker_room', 'storage', 'mechanical_room', 'parking_area'].includes(room);
    // Balcony-grid's glass shell pairs with honed stone and calm mineral joinery.
    // Preserve room-specific timber and wet/service finishes from the luxury family.
    if (recipe.id === 'balcony-grid') return { ...base, frame: undefined };
    const cool = recipe.frame === 'steel' || recipe.frame === 'graphite';
    return { ...base,
        ...(!service ? { field: `wall-field-${recipe.field}`,
            ceiling: `ceiling-field-${['dark', 'charcoal', 'graphite'].includes(recipe.field) ? 'dark' : 'light'}` } : {}),
        ...(base.band ? {band: `ceiling-band-${recipe.frame}`} : {}),
        cove: `ceiling-cove-${recipe.frame === 'graphite' ? 'graphite' : cool ? 'steel' : 'timber'}`,
        spot: cool ? 'ceiling-spot-cool' : base.spot,
        ...(base.frame ? {frame: {
            corner: `wall-panel-corner-${recipe.frame}`, rail: `wall-panel-rail-${recipe.frame}`,
            stile: `wall-panel-stile-${recipe.frame}`, field: service ? base.frame.field : `wall-panel-field-${recipe.field}`,
            line: cool ? 'wall-light-line-cool' : 'wall-light-line', kelvin: cool ? 4000 : 2700,
        }} : {}),
    };
}
