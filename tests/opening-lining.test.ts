import { expect, it } from 'vitest';
import { generate } from '../src/index.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { assertDoorwaysClear } from '../src/geometry/door-clear.js';
import { edgeFrame, edgePoint } from '../src/geometry/shell-fit.js';

it('keeps the paired facade solid and its openings clear as volume and floor count change', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    for (const [width, depth, floors] of [[20.5, 37.5, 2], [37.5, 54.5, 5], [54.5, 20.5, 9]] as const) {
    const { blueprint } = await exterior.generate({
        seed: 'lining-clearance', buildingId: 'lining', theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [0, depth / 2], maxHeight: floors * 4.5 },
        building: { type: 'corpo', tier: 'high_rich', floors }, options: { architecture: 'balcony-grid', glb: 'merged' },
    }, { textures: { mode: 'keys' } });
    const original = JSON.stringify(blueprint);
    const result = await generate({ seed: 'lining-clearance', building: { id: 'lining', type: 'corpo', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' });
    expect(result.building.floors).toHaveLength(floors);
    expect(JSON.stringify(blueprint)).toBe(original);
    // One owner of the real frame and inner return, including curved glass: Interior
    // must not overlay a differently scaled ring on any floor or change its aperture.
    for (const ref of result.building.floors) {
        expect(ref.treatments ?? []).toEqual([]);
        const layout = result.layouts[ref.layout]!;
        expect(layout.placements.some(p => p.module === 'window-return')).toBe(false);
    }
    let checked = 0;
    for (const layout of Object.values(result.layouts)) {
        const index = layout.sourceFloor, floor = blueprint.floors[index];
        const lining = new PlacementBuilder();
        // The boundary lining may never stand across a source opening's inward sightline.
        const bounds = floor.roomEnvelope.corners;
        const x0 = Math.min(...bounds.map((p: number[]) => p[0]!)), x1 = Math.max(...bounds.map((p: number[]) => p[0]!));
        const z0 = Math.min(...bounds.map((p: number[]) => p[1]!)), z1 = Math.max(...bounds.map((p: number[]) => p[1]!));
        for (const p of layout.placements) {
            if (!p.module?.startsWith('wall-')) continue;
            if (Math.min(Math.abs(p.position[0]-x0), Math.abs(p.position[0]-x1), Math.abs(p.position[2]-z0), Math.abs(p.position[2]-z1)) > .12) continue;
            lining.module(p.module, p.room, p.position, p.scale, p.rotationY);
        }
        for (const opening of floor.openings) {
            const face = edgeFrame(floor.outline, opening.edge);
            if (Math.min(Math.abs(face.dir[0]), Math.abs(face.dir[1])) > 1e-6) continue;
            const field = opening.glazing ?? opening.door?.clearance ?? opening;
            const p = edgePoint(face, field.offset + field.width/2, 1.75);
            expect(() => assertDoorwaysClear(lining.mesh, [{id:opening.id,center:[p[0],2,p[1]],along:face.dir,half:[Math.min(.3,field.width/4),.4,1.7]}],index)).not.toThrow();
            checked++;
        }
    }
    expect(checked).toBeGreaterThan(8);
    }
});
