import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate } from '../src/index.js';
import type { FloorPlacement, InteriorRequest } from '../src/index.js';
import { mergeHoles, wallCuts } from '../src/geometry/walls.js';
import { expectBuildingLevels } from './building-levels.js';

/** Exterior kit plans whose 2 m balcony doors once walled themselves shut, as the undertow
 *  city requested them for p5, p19 and p90 (consumed keys only). */
const plan = (id: string) => JSON.parse(readFileSync(new URL(`./kit-plans/${id}.blueprint.json`, import.meta.url), 'utf8'));
const poorHome = (parcel: string, id: string): InteriorRequest => ({
    seed: `undertow-1000:${parcel}`, building: { id: parcel, type: 'residential', tier: 'poor' }, blueprint: plan(id), materialTheme: 'cyberpunk',
});

/** Pairs of wall fields standing on one plane, facing one way, whose faces overlap. */
function coplanarFields(layout: FloorPlacement): string[] {
    const fields = layout.placements.filter(p => /^wall-(panel-)?field/.test(p.module ?? '')).map(p => {
        const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY), half = p.scale[0] * .25;
        const along = p.position[0] * c - p.position[2] * s;
        return { id: p.id, turn: Math.round(p.rotationY * 1e4), plane: p.position[0] * s + p.position[2] * c,
            a: along - half, b: along + half, y0: p.position[1], y1: p.position[1] + p.scale[1] * .5 };
    });
    const pairs: string[] = [];
    for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
        const p = fields[i]!, q = fields[j]!;
        if (p.turn !== q.turn || Math.abs(p.plane - q.plane) > 1e-3) continue;
        if (Math.min(p.b, q.b) - Math.max(p.a, q.a) > 1e-3 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 1e-3) pairs.push(`${p.id}/${q.id}`);
    }
    return pairs;
}

it('cuts each stretch of a wall line once, however its door, shell passage and windows overlap', () => {
    // A room door and the wider shell passage it lands on are one opening: one head over both.
    expect(wallCuts([{ at: 5, width: 1.95, y0: 0, y1: 2 }, { at: 5.025, width: 2.12, y0: 0, y1: 2 }]))
        .toEqual([{ a: 5.025 - 1.06, b: 5.025 + 1.06, open: [[0, 2]] }]);
    // Floors sharing a layout put windows at different sills: the lining opens their union and
    // keeps one sill and one head beneath and above it.
    const cuts = wallCuts([{ at: 2, width: 2, y0: 0.5, y1: 3.5 }, { at: 2, width: 2, y0: 1, y1: 4 }]);
    expect(cuts).toEqual([{ a: 1, b: 3, open: [[0.5, 4]] }]);
    // A window whose cut crosses a door leaves the doorway open to its head, no sill across it.
    const mixed = wallCuts([{ at: 1, width: 2, y0: 0, y1: 2.2 }, { at: 2.5, width: 2, y0: 0.9, y1: 2.4 }]);
    expect(mixed.map(c => [c.a, c.b, c.open])).toEqual([[0, 1.5, [[0, 2.2]]], [1.5, 2, [[0, 2.4]]], [2, 3.5, [[0.9, 2.4]]]]);
    // Casings that would touch frame one opening; stair and lift holes apart stay apart.
    const [framed, ...rest] = mergeHoles([{ at: 1, width: 1, y0: 0, y1: 2.5 }, { at: 2.1, width: 1, y0: 0, y1: 2.1 }], 0.08);
    expect(rest).toEqual([]);
    expect([framed!.at, framed!.width, framed!.y0, framed!.y1].map(v => Math.round(v * 1e6) / 1e6)).toEqual([1.55, 2.1, 0, 2.5]);
    expect(mergeHoles([{ at: 1, width: 1, y0: 0, y1: 2.5 }, { at: 3, width: 1, y0: 0, y1: 2.5 }], 0.08)).toHaveLength(2);
});

it('opens the poor balcony-door plans, each 2 m door under its own head, with no field on another', { timeout: 120000 }, async () => {
    for (const [parcel, id] of [['p5', 'plain-residential-poor-3x4x4f'], ['p19', 'plain-residential-poor-3x4x4f'], ['p90', 'plain-residential-poor-4x3x4f']] as const) {
        const request = poorHome(parcel, id);
        // Generation proves every doorway clear up to the passage its shell opening publishes.
        const built = await generate(request);
        expectBuildingLevels(built, request.blueprint.floors.length);
        for (const [name, layout] of Object.entries(built.layouts).filter(([, layout]) => layout.floor.kind !== 'roof')) {
            expect(coplanarFields(layout), `${parcel} ${name}`).toEqual([]);
            expect(layout.floor.rooms.flatMap(r => r.doors).filter(d => d.to === 'outside').length, `${parcel} ${name}`).toBeGreaterThan(0);
        }
    }
});
