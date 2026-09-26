import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate } from '../src/index.js';
import type { Anchor, FloorPlacement } from '../src/index.js';
import { facingOf } from '../src/npc/anchors.js';

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
    // The fixture still stands a desk whose unsnapped approach falls among the toilets' users.
    const middle = built.layouts.middle!;
    const toiletSpots = middle.npc.anchors.filter(a => a.kind === 'toilet');
    expect(middle.floor.furniture.some(desk => {
        if (desk.kind !== 'desk') return false;
        const facing = facingOf(desk.rotationDeg), reach = desk.size[1] / 2 + 0.4;
        const front = [desk.position[0] + facing[0] * reach, desk.position[1] + facing[1] * reach];
        return toiletSpots.some(spot => spot.room !== desk.room && apart(spot.position, front) < 0.6);
    })).toBe(true);
});
