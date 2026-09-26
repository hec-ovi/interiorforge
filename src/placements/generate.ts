import { validateRequest, resolveAssignments } from '../blueprint/validate.js';
import { InteriorError } from '../core/errors.js';
import { coreFeasibility, planBuilding } from '../layout/index.js';
import { buildNpcSupport } from '../npc/index.js';
import { planRoofAccess } from '../layout/roof-access.js';
import type { BlueprintFloor, InteriorRequest, NpcSupport, Opening } from '../core/types.js';
import { corePlacement } from '../layout/core-plan.js';
import { placeLayout } from './layout.js';
import { windowTreatments } from './treatments.js';
import type { GeneratedInterior, LayoutId, LayoutMap, FloorPlacement } from './types.js';
import version from '../../package.json' with { type: 'json' };
import { architectureAssignments, interiorRecipe } from '../architecture/recipes.js';
import { presentModels } from '../assets/availability.js';
export interface GenerateOptions {
    /** catalog ids whose model file the consumer holds; default presentModels() */
    models?: ReadonlySet<string>;
}
export async function generate(input: unknown, options: GenerateOptions = {}): Promise<GeneratedInterior> {
    const present = options.models ?? await presentModels();
    const published = validateRequest(input);
    // Basements stay closed, and the lowest above-ground floor is the ground layout even
    // when the published indices start above zero.
    const above = published.blueprint.floors.filter(floor => floor.index >= 0);
    if (!above.length)
        throw new InteriorError('E_BLUEPRINT_INVALID', 'placement buildings require a floor at or above index zero');
    const request: InteriorRequest = above.length === published.blueprint.floors.length ? published
        : { ...published, blueprint: { ...published.blueprint, floors: above },
            ...(published.assignments ? { assignments: published.assignments.filter(a => a.floor >= 0) } : {}) };
    const floors = request.blueprint.floors;
    // Two floors are ground and crown; the middle layout exists only where a floor repeats it.
    const assignments = architectureAssignments(request, resolveAssignments(request)), alone = floors.length === 1;
    if (assignments.some(a => (a.spans ?? 1) !== 1))
        throw new InteriorError('E_ASSIGNMENT_INVALID', 'placement layouts require single storey assignments');
    // Reuse only genuinely identical construction plates. Tapered wings, connection
    // floors and explicit programmes keep their own geometry and navigation.
    const samples: BlueprintFloor[] = [], names: LayoutId[] = [], layoutByFloor = new Map<number, LayoutId>();
    const reusable = new Map<string, LayoutId>();
    for (const [index, floor] of floors.entries()) {
        const key = signature(floor, assignments.find(a => a.floor === floor.index)!.kind);
        let name: LayoutId;
        if (index === 0) name = 'ground';
        else if (index === floors.length - 1) name = 'crown';
        else name = reusable.get(key) ?? (reusable.size ? `floor-${floor.index}` : 'middle');
        layoutByFloor.set(floor.index, name);
        if (!names.includes(name)) { samples.push(floor); names.push(name); }
        if (index > 0 && index < floors.length - 1) reusable.set(key, name);
    }
    let plan;
    try {
        plan = planBuilding(request, assignments, new Set(samples.map(f => f.index)));
    }
    catch (error) {
        // No core stands on this stack's plates: the building opens as its ground floor.
        // Anything a floor itself failed on is that floor's business, not the stack's.
        if (alone || !(error instanceof InteriorError) || error.code !== 'E_FLOOR_TOO_SMALL'
            || coreFeasibility(request.blueprint).fits)
            throw error;
        return generate({ ...request, blueprint: { ...request.blueprint, floors: [floors[0]!], roof: undefined },
            ...(request.assignments ? { assignments: request.assignments.filter(a => a.floor === 0) } : {}) }, { models: present });
    }
    const roof = planRoofAccess(request, plan.core);
    const crown = samples.length - 1;
    // A layout lines the shell for every floor that reuses it, so one lining clears the
    // windows of all of them.
    const sharing = (i: number): BlueprintFloor[] => floors.filter(floor => layoutByFloor.get(floor.index) === names[i]);
    const models = { present, missing: new Set<string>() };
    const tables = samples.map((bp, i) => placeLayout(plan, bp, request, models,
        i < crown ? bp.height : roof ? roof.access.elevation - bp.elevation : 0, i === crown ? roof : undefined, sharing(i)));
    const npc = buildNpcSupport(plan, request);
    const layouts: LayoutMap<FloorPlacement> = {};
    samples.forEach((bp, i) => {
        const floor = structuredClone(plan.floors[i]!);
        floor.ceilingElevation -= floor.elevation;
        for (const light of floor.lights)
            light.position[1] -= floor.elevation;
        floor.elevation = 0;
        const localNpc: NpcSupport = {
            buildingId: request.building.id,
            anchors: npc.anchors.filter(a => a.floor === bp.index), roles: npc.roles.filter(a => a.floor === bp.index),
            routines: npc.routines.filter(r => npc.roles.some(role => role.id === r.role && role.floor === bp.index)),
            placements: npc.placements?.filter(p => p.floor === bp.index),
            nav: { cellSize: npc.nav.cellSize, floors: npc.nav.floors.filter(f => f.floor === bp.index), connectors: [] }
        };
        if (i === crown && npc.nav.roofAccess) {
            localNpc.nav.roofAccess = structuredClone(npc.nav.roofAccess);
            localNpc.nav.roofAccess.elevation -= bp.elevation;
            localNpc.nav.roofAccess.door.thresholdElevation -= bp.elevation;
            localNpc.nav.floors.push(...npc.nav.floors.filter(f => f.floor === npc.nav.roofAccess!.floor));
        }
        layouts[names[i]!] = { version: 1, id: names[i]!, sourceFloor: bp.index, floor, openings: structuredClone(bp.openings), placements: tables[i]!.placements, npc: localNpc };
    });
    const refs = floors.map((floor, i) => {
        const layout = layoutByFloor.get(floor.index)!;
        const table = layouts[layout]!;
        const source = doorOpenings(table.openings), mine = doorOpenings(floor.openings);
        const changes = plan.uvFloors.get(table.sourceFloor)!.programChanges;
        const treatments = windowTreatments(floor, table, request);
        return { index: floor.index, layout, elevation: floor.elevation, openings: Object.fromEntries(source.map((o, n) => [o.id, mine[n]!.id])),
            ...(treatments.length ? { treatments } : {}),
            ...(changes?.length ? { program: { kind: assignments.find(a => a.floor === table.sourceFloor)!.kind,
                changes: structuredClone(changes) } } : {}) };
    });
    const connectors = alone ? [] : npc.nav.connectors.map(c => {
        const served = floors.map(f => f.index);
        const entries = Object.fromEntries(floors.map(floor => [floor.index,
            c.entryByFloor[String(layouts[layoutByFloor.get(floor.index)!]!.sourceFloor)]!]));
        if (npc.nav.roofAccess && c.id === 'stair-a') {
            served.push(npc.nav.roofAccess.floor);
            entries[npc.nav.roofAccess.floor] = npc.nav.roofAccess.entry;
        }
        return { ...c, floors: served, entryByFloor: entries };
    });
    return {
        building: {
            version: 1, generatorVersion: version.version, buildingId: request.building.id, modules: 'modules.json', props: 'catalog.json',
            ...(interiorRecipe(request) ? { architecture: interiorRecipe(request)!.id } : {}),
            materialTheme: request.materialTheme, tier: request.building.tier, layouts: Object.fromEntries(names.map(name => [name, `layouts/${name}.json`])), floors: refs, connectors, corePlacement: corePlacement(plan.core),
            ...(plan.core.reservationCrossing ? { reservationCrossing: plan.core.reservationCrossing } : {})
        }, layouts, missingModels: [...models.missing].sort()
    };
}
/** Geometry and program only. Windows and exterior dressing (material, panes, glazing,
 *  scenery, section ids) vary per floor by design; doors and portals hold the layout. */
const openingSignatureFields = ['kind', 'doorRole', 'edge', 'offset', 'width', 'height', 'sill', 'leaves', 'door'] as const;
export function doorOpenings(openings: readonly Opening[]): Opening[] {
    return openings.filter(opening => opening.kind !== 'window');
}
function signature(floor: BlueprintFloor, program: string): string {
    return JSON.stringify({
        outline: floor.outline, roomEnvelope: floor.roomEnvelope?.corners, height: floor.height, program,
        openings: doorOpenings(floor.openings).map(opening => openingSignatureFields.map(field => opening[field]))
    }, (_, value) => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value);
}
