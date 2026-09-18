import { validateRequest, resolveAssignments } from '../blueprint/validate.js';
import { InteriorError } from '../core/errors.js';
import { planBuilding } from '../layout/index.js';
import { buildNpcSupport } from '../npc/index.js';
import { planRoofAccess } from '../layout/roof-access.js';
import type { BlueprintFloor, NpcSupport } from '../core/types.js';
import { placeLayout } from './layout.js';
import type { LayoutId, PlacementResult, FloorPlacement } from './types.js';
import version from '../../package.json' with { type: 'json' };
export async function generate(input: unknown): Promise<PlacementResult> {
    const request = validateRequest(input), floors = request.blueprint.floors;
    if (floors.length < 3 || floors[0]!.index !== 0)
        throw new InteriorError('E_BLUEPRINT_INVALID', 'placement buildings require at least three floors starting at zero');
    const assignments = resolveAssignments(request), samples = [floors[0]!, floors[1]!, floors.at(-1)!], names: LayoutId[] = ['ground', 'middle', 'crown'];
    if (assignments.some(a => (a.spans ?? 1) !== 1))
        throw new InteriorError('E_ASSIGNMENT_INVALID', 'placement layouts require single storey assignments');
    for (const floor of floors.slice(2, -1)) {
        if (signature(floor) !== signature(samples[1]!))
            throw new InteriorError('E_BLUEPRINT_INVALID', `floor ${floor.index} differs from the reusable middle layout`, floor.index);
        if (request.assignments && assignments.find(a => a.floor === floor.index)?.kind !== assignments.find(a => a.floor === 1)?.kind)
            throw new InteriorError('E_ASSIGNMENT_INVALID', 'middle floors must share one program');
    }
    const plan = planBuilding(request, assignments, new Set(samples.map(f => f.index)));
    const roof = planRoofAccess(request, plan.core);
    const tables = samples.map((bp, i) => placeLayout(plan, bp, request, i < 2 ? bp.height : roof ? roof.access.elevation - bp.elevation : 0, i === 2 ? roof : undefined));
    const npc = buildNpcSupport(plan, request);
    const layouts = {} as Record<LayoutId, FloorPlacement>;
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
        if (i === 2 && npc.nav.roofAccess) {
            localNpc.nav.roofAccess = structuredClone(npc.nav.roofAccess);
            localNpc.nav.roofAccess.elevation -= bp.elevation;
            localNpc.nav.roofAccess.door.thresholdElevation -= bp.elevation;
            localNpc.nav.floors.push(...npc.nav.floors.filter(f => f.floor === npc.nav.roofAccess!.floor));
        }
        layouts[names[i]!] = { version: 1, id: names[i]!, sourceFloor: bp.index, floor, openings: structuredClone(bp.openings), placements: tables[i]!.placements, npc: localNpc };
    });
    const refs = floors.map((floor, i) => {
        const layout: LayoutId = i === 0 ? 'ground' : i === floors.length - 1 ? 'crown' : 'middle', source = layouts[layout].openings;
        const changes = plan.uvFloors.get(layouts[layout].sourceFloor)!.programChanges;
        return { index: floor.index, layout, elevation: floor.elevation, openings: Object.fromEntries(source.map((o, n) => [o.id, floor.openings[n]!.id])),
            ...(changes?.length ? { program: { kind: assignments.find(a => a.floor === layouts[layout].sourceFloor)!.kind,
                changes: structuredClone(changes) } } : {}) };
    });
    const connectors = npc.nav.connectors.map(c => {
        const served = floors.map(f => f.index), entries = Object.fromEntries(served.map(f => [f, c.entryByFloor[String(f === 0 ? 0 : f === floors.length - 1 ? f : 1)]!]));
        if (npc.nav.roofAccess && c.id === 'stair-a') {
            served.push(npc.nav.roofAccess.floor);
            entries[npc.nav.roofAccess.floor] = npc.nav.roofAccess.entry;
        }
        return { ...c, floors: served, entryByFloor: entries };
    });
    return {
        building: {
            version: 1, generatorVersion: version.version, buildingId: request.building.id, modules: 'modules.json', props: 'catalog.json',
            materialTheme: request.materialTheme, tier: request.building.tier, layouts: { ground: 'layouts/ground.json', middle: 'layouts/middle.json', crown: 'layouts/crown.json' }, floors: refs, connectors
        }, layouts
    };
}
function signature(floor: BlueprintFloor): string {
    return JSON.stringify({
        outline: floor.outline, height: floor.height, kind: floor.kind,
        openings: floor.openings.map(({ id, ...opening }) => opening)
    }, (_, value) => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value);
}
