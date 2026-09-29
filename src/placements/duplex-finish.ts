import type { UvRect, Frame } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import { LOFT1702_FINISH as L } from '../styles/luxury/loft-finish.js';
import type { PlacementBuilder } from './builder.js';
import { subtractRect } from './thresholds.js';

/** Seating sits on a broad timber inset in the pale circulation floor. Each
 * visible finish owns disjoint rectangles over one continuous structural slab. */
export function duplexFloorRegions(rect: UvRect, carpets: readonly UvRect[]): { stone: UvRect[]; timber: UvRect[] } {
    const timber: UvRect[] = [];
    for (const rug of carpets) {
        const u = Math.max(rect.u, rug.u - .75), v = Math.max(rect.v, rug.v - .75);
        const endU = Math.min(rect.u + rect.lu, rug.u + rug.lu + .75);
        const endV = Math.min(rect.v + rect.lv, rug.v + rug.lv + .75);
        if (endU - u < .01 || endV - v < .01) continue;
        let parts = [{ u, v, lu: endU - u, lv: endV - v }];
        for (const previous of timber) parts = parts.flatMap(part => subtractRect(part, previous));
        timber.push(...parts);
    }
    let stone = [rect];
    for (const inset of timber) stone = stone.flatMap(part => subtractRect(part, inset));
    return { stone, timber };
}

export function placeDuplexLivingFloor(builder: PlacementBuilder, room: string, rect: UvRect, carpets: readonly UvRect[], frame: Frame): void {
    const put = (module: string, part: UvRect) => {
        const [x, z] = uvToWorld([part.u + part.lu / 2, part.v + part.lv / 2], frame);
        builder.module(module, room, [x, 0, z], [part.lu / .5, 1, part.lv / .5], -frame.angleDeg * Math.PI / 180);
    };
    put(L.floorSupport, rect);
    const regions = duplexFloorRegions(rect, carpets);
    for (const part of regions.stone) put(L.stoneSkin, part);
    for (const part of regions.timber) put(L.timberSkin, part);
}

/** A cove may only run beside an actual ceiling. The private void is open all
 * the way through the lower storey, so its wall cannot carry a false mid-air
 * ceiling fixture. Inputs and holes share the building's construction axes. */
export function duplexCoveSpans(a: number, b: number, axis: 'H' | 'V', cross: number, side: 1 | -1,
    holes: readonly UvRect[]): [number, number][] {
    let spans: [number, number][] = [[a, b]];
    const inside = cross + side * .16;
    for (const hole of holes) {
        const lowCross = axis === 'H' ? hole.v : hole.u;
        const highCross = lowCross + (axis === 'H' ? hole.lv : hole.lu);
        if (inside < lowCross - 1e-6 || inside > highCross + 1e-6) continue;
        const lo = axis === 'H' ? hole.u : hole.v, hi = lo + (axis === 'H' ? hole.lu : hole.lv);
        spans = spans.flatMap(([from, to]): [number, number][] => hi <= from || lo >= to ? [[from, to]]
            : [[from, Math.max(from, lo)], [Math.min(to, hi), to]].filter(([x, y]) => y! - x! > 1e-6) as [number, number][]);
    }
    return spans;
}
