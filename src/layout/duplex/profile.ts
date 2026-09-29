/** Diagnostic producer timings, not a replacement for full generated-output
 * tests. Run with tsx; no artifacts or Engine sources are changed. */
import { RigidFrame2D } from '../../core/rigid-frame.js';
import { validateRequest, resolveAssignments } from '../../blueprint/validate.js';
import { planBuilding } from '../index.js';
import { planRoofAccess } from '../roof-access.js';
import { duplexAssignments } from './assignments.js';
import { applyDuplexPairs } from './apply.js';
import { placeLayout } from '../../placements/layout.js';
import { buildNpcSupport } from '../../npc/index.js';

const width = Number(process.argv[2] ?? 60), angle = Number(process.argv[3] ?? 37);
const { generate: exterior } = await import(new URL('../../../../exterior/src/index.ts', import.meta.url).href);
const frame = new RigidFrame2D(angle, [19, -11]);
let time = performance.now();
const mark = (label: string, detail: Record<string, unknown> = {}) => {
    const now = performance.now(); console.log(JSON.stringify({ stage: label, ms: Math.round(now - time), ...detail })); time = now;
};
const shell = await exterior({ buildingId: 'duplex-profile', seed: 'duplex-1702', theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [width, 0], [width, 40], [0, 40]].map(p => frame.toWorld(p as [number, number])),
        accessPoint: frame.toWorld([width / 2, 0]), maxHeight: 28 },
    building: { type: 'residential', tier: 'high_rich', floors: 5 },
    options: { architecture: 'balcony-grid', glb: 'named', roofArtifacts: 'off', facadeServices: 'off' } }, { textures: { mode: 'keys' } });
mark('exterior');
const request = validateRequest({ seed: 'duplex-1702', building: { id: 'duplex-profile', type: 'residential', tier: 'high_rich', interiorStyle: 'apartment-1702' },
    blueprint: shell.blueprint, materialTheme: 'cyberpunk', assignments: [{ floor: 0, kind: 'lobby' }, { floor: 1, kind: 'apartment', spans: 2 }, { floor: 3, kind: 'apartment', spans: 2 }] });
const { assignments, pairs } = duplexAssignments(request, resolveAssignments(request));
const plan = planBuilding(request, assignments); mark('ordinary-plan');
applyDuplexPairs(plan, pairs, request); mark('duplex-plan');
const roof = planRoofAccess(request, plan.core), models = { present: new Set<string>(), missing: new Set<string>() };
for (const [i, bp] of request.blueprint.floors.entries()) {
    const last = i === request.blueprint.floors.length - 1;
    const placed = placeLayout(plan, bp, request, models, last ? roof ? roof.access.elevation - bp.elevation : 0 : bp.height, last ? roof : undefined);
    mark(`placements-${bp.index}`, { count: placed.placements.length,
        triangles: placed.mesh.materials().reduce((sum, key) => sum + placed.mesh.getGroup(key)!.indices.length / 3, 0) });
}
buildNpcSupport(plan, request); mark('npc');
