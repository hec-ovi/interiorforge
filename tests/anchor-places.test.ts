import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate } from '../src/index.js';
import type { Anchor, FloorPlacement } from '../src/index.js';
import { facingOf, floorAnchors } from '../src/npc/anchors.js';
import { WalkGrid } from '../src/core/grid.js';
import type { FloorInterior, Room } from '../src/core/types.js';

const plan = (id: string) => JSON.parse(readFileSync(new URL(`./kit-plans/${id}.blueprint.json`, import.meta.url), 'utf8'));
const apart = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const POSTS = new Set<Anchor['kind']>(['work_spot', 'counter_spot', 'toilet', 'machine_spot']);

/** Where a seat's body rests: on the piece it names, in the layout's plan coordinates. */
function seatBody(layout: FloorPlacement, seat: Anchor): number[] {
    const piece = layout.placements.find(p => p.id === seat.furniture)!;
    return [piece.position[0], piece.position[2]];
}

it('keeps every post whose place no body in its own room holds, and seats no body on another', { timeout: 120000 }, async () => {
    // General Average House: an office floor's desk faces the toilets behind its partition,
    // whose users stand 0.43 m from the desk's unsnapped approach across that wall.
    const built = await generate({
        seed: 'undertow-1000:p298', building: { id: 'p298', type: 'offices', tier: 'rich' },
        blueprint: plan('white-grid-commercial-rich-4x3x10f'), materialTheme: 'cyberpunk',
    });
    for (const [name, layout] of Object.entries(built.layouts)) {
        const anchored = new Set(layout.npc.anchors.map(a => a.furniture));
        for (const f of layout.floor.furniture) {
            // a wall parts two rooms: a desk or toilet always has its own place
            if (f.kind === 'desk' || f.kind === 'toilet') expect(anchored.has(f.id), `${name} ${f.id} ${f.kind}`).toBe(true);
        }
        const posts = layout.npc.anchors.filter(a => POSTS.has(a.kind));
        const seats = layout.npc.anchors.filter(a => a.kind === 'seat');
        for (const [i, a] of posts.entries()) for (const b of posts.slice(i + 1))
            if (a.room === b.room) expect(apart(a.position, b.position), `${name} ${a.id} ${b.id}`).toBeGreaterThanOrEqual(0.6);
        for (const seat of seats) for (const post of posts)
            expect(apart(seatBody(layout, seat), post.position), `${name} ${seat.id} ${post.id}`).toBeGreaterThanOrEqual(0.6);
        // a toilets room stands its toilets in a row, a stall apart, their users side by side
        for (const room of layout.floor.rooms.filter(r => r.kind === 'toilets')) {
            const toilets = layout.floor.furniture.filter(f => f.room === room.id && f.kind === 'toilet');
            expect(toilets.length, `${name} ${room.id}`).toBeGreaterThan(0);
            for (const [i, a] of toilets.entries()) for (const b of toilets.slice(i + 1)) {
                expect(a.rotationDeg, `${name} ${a.id} ${b.id}`).toBe(b.rotationDeg);
                expect(apart(a.position, b.position), `${name} ${a.id} ${b.id}`).toBeGreaterThanOrEqual(0.7 - 1e-6);
            }
        }
    }
    // The main quest starts at this desk: its guest waits on the lobby's seating, not in the
    // receptionist's chair.
    const lobby = built.layouts.ground!;
    const home = (role: string) => {
        const anchor = lobby.npc.anchors.find(a => a.id === lobby.npc.roles.find(r => r.role === role)!.homeAnchor)!;
        return anchor.kind === 'seat' ? seatBody(lobby, anchor) : anchor.position;
    };
    expect(apart(home('receptionist'), home('guest'))).toBeGreaterThanOrEqual(0.6);
});

it('keeps a desk\'s post whose approach falls among the users of the toilets behind its partition', () => {
    // The fixture above no longer stands that desk since the corporate fit-out, so the
    // two rooms are drawn here: a wall at x = 5 parts the office from the toilets.
    const office: Room = { id: 'office', kind: 'office_private', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], doors: [] };
    const toilets: Room = { id: 'toilets', kind: 'toilets', polygon: [[5, 0], [8, 0], [8, 4], [5, 4]], doors: [] };
    const desk = { id: 'desk', kind: 'desk', room: 'office', position: [4.1, 2], size: [1.6, .8, .75], rotationDeg: 90 };
    const toilet = { id: 'toilet', kind: 'toilet', room: 'toilets', position: [5.9, 2], size: [.4, .65, .75], rotationDeg: 270 };
    const deskFront = [desk.position[0]! + facingOf(90)[0] * .8, desk.position[1]!];
    const toiletFront = [toilet.position[0]! + facingOf(270)[0] * .725, toilet.position[1]!];
    expect(apart(deskFront, toiletFront)).toBeLessThan(0.6);
    const floor = { floor: 1, rooms: [office, toilets], furniture: [desk, toilet] } as unknown as FloorInterior;
    const grid = WalkGrid.forPolygon([[0, 0], [8, 0], [8, 4], [0, 4]], .25, { x: 0, z: 0, w: 8, d: 4 });
    const anchors = floorAnchors(floor, grid, new Uint8Array(grid.cols * grid.rows).fill(1));
    expect(anchors.find(a => a.furniture === 'desk')?.kind).toBe('work_spot');
    expect(anchors.find(a => a.furniture === 'toilet')?.kind).toBe('toilet');
});
