import type { LightFixture } from '../core/types.js';
import { InteriorError } from '../core/errors.js';
import { STAIR, WALL } from '../layout/constants.js';
import { planFlights, stairProfile } from '../layout/stair-plan.js';
import type { CorePlan } from '../layout/core-plan.js';
import { uvToWorld, type UvRect } from '../layout/uv.js';
import { baseLanding, computeStairSteps, entryAtLowEnd, stairClearWidth, stairRunHeadroom, type RunStep } from '../geometry/stairs.js';
import { surface } from './surfaces.js';
import type { Family } from './finish.js';
import type { PlacementBuilder } from './builder.js';
export function stairs(builder: PlacementBuilder, core: CorePlan, climb: number, slabModule: string, roofOnly = false, lowest = false, family?: Family, lighting?: { fixtures: LightFixture[]; elevation: number }): Map<string, RunStep[]> {
    const runs = new Map<string, RunStep[]>();
    for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
        const shaft = which === 'a' ? core.stairA : core.stairB!, id = `stair-${which}`, low = entryAtLowEnd(core, which);
        if (stairClearWidth(shaft) < STAIR.flightWidth - 1e-6)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} clear width below 1.2 m`);
        const { tread } = stairProfile(shaft);
        const landing = baseLanding(shaft, low, 0);
        // At ground level there is no lower flight: close and finish the entire shaft base.
        if (lowest) surface(builder, slabModule, id, shaft, 0, core.frame);
        // Every climb owns the landing it arrives on. Otherwise looking up a
        // streamed return flight loses the landing with the floor beyond it.
        if (!climb || roofOnly && which === 'b') {
            if (!lowest) terminalGuard(builder, core, shaft, low, id, 0, family);
            continue;
        }
        const plan = planFlights(climb);
        if (plan.rise < STAIR.riser.min - 1e-6 || plan.rise > STAIR.riser.max + 1e-6)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} cannot keep riser clearance`);
        const steps = computeStairSteps(shaft, low, 0, climb), slab = .32 * plan.rise / .17;
        const run = [landing, ...steps].map(s => ({ ...s, slab }));
        if (stairRunHeadroom(shaft, low, climb) < STAIR.headroom - 1e-6)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} headroom below 2.1 m`);
        runs.set(id, run);
        for (let flight = 0; flight < plan.flights; flight++) {
            const first = steps[flight * (plan.risersPerFlight + 1)]!, last = steps[flight * (plan.risersPerFlight + 1) + plan.risersPerFlight - 1]!;
            const alongU = shaft.lu >= shaft.lv;
            const sign = (alongU ? last.u - first.u : last.v - first.v) >= 0 ? 1 : -1;
            const forward: [
                number,
                number
            ] = alongU ? [sign, 0] : [0, sign], right: [
                number,
                number
            ] = [forward[1], -forward[0]];
            const width = (Math.min(shaft.lu, shaft.lv) - WALL) / 2;
            const start: [
                number,
                number
            ] = [first.u + first.lu / 2 - right[0] * width / 2 - forward[0] * tread / 2,
                first.v + first.lv / 2 - right[1] * width / 2 - forward[1] * tread / 2];
            const [x, z] = uvToWorld(start, core.frame);
            const rotation = Math.atan2(forward[0], forward[1]) - core.frame.angleDeg * Math.PI / 180;
            builder.module(`stair-flight-${plan.risersPerFlight}`, id, [x, first.y - plan.rise, z], [width / 1.45, plan.rise / .17, tread / .28], rotation);
            const crossStart = alongU ? start[1] : start[0], crossMin = alongU ? shaft.v : shaft.u;
            const outerAtZero = Math.abs(crossStart - crossMin - WALL / 2) < 1e-6
                || Math.abs(crossStart - crossMin - Math.min(shaft.lu, shaft.lv) + WALL / 2) < 1e-6;
            for (let i = 0; i < plan.risersPerFlight; i++) {
                const at: [number, number, number] = [x + Math.sin(rotation) * i * tread,
                    first.y - plan.rise + i * plan.rise, z + Math.cos(rotation) * i * tread];
                const scale: [number, number, number] = [width / 1.45, plan.rise / .17, tread / .28];
                builder.module(`stair-soffit-${i}`, id, at, scale, rotation);
                const edge = outerAtZero ? 0 : width;
                builder.module(`stair-soffit-return-${outerAtZero ? 'left' : 'right'}-${i}`, id,
                    [at[0] + Math.cos(rotation) * edge, at[1], at[2] - Math.sin(rotation) * edge], scale, rotation);
            }
            const profile = family ?? 'capsule';
            for (const side of [0, 1.375]) for (let i = 0; i < plan.risersPerFlight; i++) {
                const across = side * width / 1.45;
                builder.module(`stair-side-${profile}-piece-${i}${i === plan.risersPerFlight - 1 ? '-end' : ''}`, id,
                    [x + Math.cos(rotation) * across + Math.sin(rotation) * i * tread, first.y - plan.rise + i * plan.rise,
                        z - Math.sin(rotation) * across + Math.cos(rotation) * i * tread],
                    [width / 1.45, plan.rise / .17, tread / .28], rotation);
            }
            for (let i = 0; i < plan.risersPerFlight; i++) builder.module(`stair-tread-${profile}`, id,
                [x + Math.sin(rotation) * i * tread, first.y + i * plan.rise, z + Math.cos(rotation) * i * tread],
                [width / 1.45, plan.rise / .17, tread / .28], rotation);
            const wallLight = family === 'luxury' || family === 'corporate' || family === 'capsule' ? family
                : family === 'damaged' || family === 'industrial' ? 'service' : undefined;
            if (wallLight && lighting) for (let i = wallLight === 'service' || wallLight === 'capsule' ? 2 : 3; i < plan.risersPerFlight; i += wallLight === 'service' || wallLight === 'capsule' ? 4 : 7) {
                const at: [number, number, number] = [x + Math.sin(rotation) * (i + .5) * tread + Math.cos(rotation) * .045,
                    first.y + i * plan.rise + 1.2, z + Math.cos(rotation) * (i + .5) * tread - Math.sin(rotation) * .045];
                const fixture = builder.module(`stair-wall-lamp-${wallLight}`, id, at, [1, 1, 1], rotation);
                lighting.fixtures.push({ id: fixture.id, kind: 'strip', room: id,
                    position: [at[0], at[1] + lighting.elevation, at[2]], length: wallLight === 'service' || wallLight === 'capsule' ? .44 : .30,
                    angleDeg: 90 - rotation * 180 / Math.PI,
                    axis: wallLight === 'service' || wallLight === 'capsule' ? [Math.sin(rotation), 0, Math.cos(rotation)] : [0, 1, 0],
                    direction: [Math.cos(rotation), 0, -Math.sin(rotation)], intensity: 450,
                    colorTemperatureK: family === 'luxury' ? 2800 : 5000,
                    ...(family === 'damaged' ? { color: [.12, .85, 1] as [number, number, number] } : {}),
                    range: 3, beamDeg: 140, diffuse: .8, facing: 'down' });
            }
            {
                const turn = steps[(flight + 1) * (plan.risersPerFlight + 1) - 1]!;
                surface(builder, slabModule, id, stairLandingRect(shaft, turn), turn.y, core.frame);
            }
            if (flight === plan.flights - 1) {
                // The arrival landing's bearing continues below the first tread
                // of the next outgoing flight. Its recessed sides avoid coincident
                // fascia faces; its soffit closes the sightline at the landing seam.
                const firstTread = steps[0]!, bearing = { u: firstTread.u, v: firstTread.v, lu: firstTread.lu, lv: firstTread.lv };
                if (shaft.lu >= shaft.lv) { bearing.v += .01; bearing.lv -= .02; }
                else { bearing.u += .01; bearing.lu -= .02; }
                surface(builder, slabModule, id, bearing, steps.at(-1)!.y, core.frame);
            }
        }
        if (family === 'damaged' || family === 'industrial') {
            // Service risers occupy the enclosure corner, outside both walking lanes.
            const [px, pz] = uvToWorld([shaft.u + .09, shaft.v + .09], core.frame);
            builder.module('stair-service-pipe-damaged', id, [px, 0, pz], [1, climb / .5, 1]);
            for (const y of [.3, Math.max(.4, climb - .35)])
                builder.module('stair-service-collar-damaged', id, [px, y, pz]);
        }
        if (roofOnly && which === 'a') terminalGuard(builder, core, shaft, low, id, climb, family);
    }
    return runs;
}

/** The uppermost arrival has a descending lane, but no ascending flight beside it.
 * Close that unused half of the landing edge without narrowing the route downstairs.
 * The guard stands just beyond the landing, keeping the profile's full turning depth. */
function terminalGuard(builder: PlacementBuilder, core: CorePlan, shaft: UvRect, low: boolean, id: string, elevation: number, family?: Family): void {
    const alongU = shaft.lu >= shaft.lv;
    const width = (Math.min(shaft.lu, shaft.lv) - WALL) / 2;
    const { landing } = stairProfile(shaft);
    const start = (alongU ? shaft.u : shaft.v) + (low ? WALL / 2 + landing : (alongU ? shaft.lu : shaft.lv) - WALL / 2 - landing);
    const along = start + (low ? .03 : -.03);
    const across = (alongU ? shaft.v : shaft.u) + WALL / 2 + width / 2;
    const [x, z] = uvToWorld(alongU ? [along, across] : [across, along], core.frame);
    builder.module(family ? `stair-landing-guard-${family}` : 'stair-landing-guard', id, [x, elevation, z], [width / 1.4, 1, 1],
        (alongU ? Math.PI / 2 : 0) - core.frame.angleDeg * Math.PI / 180);
}

/** Structural slabs continue beneath the shaft wall, including recessed wall trim.
 * Flight-facing edges stay fixed so the landing never overlays the last tread. */
export function stairLandingRect(shaft: UvRect, landing: UvRect): UvRect {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const u = near(landing.u, shaft.u + WALL / 2) ? shaft.u : landing.u;
    const v = near(landing.v, shaft.v + WALL / 2) ? shaft.v : landing.v;
    const farU = near(landing.u + landing.lu, shaft.u + shaft.lu - WALL / 2) ? shaft.u + shaft.lu : landing.u + landing.lu;
    const farV = near(landing.v + landing.lv, shaft.v + shaft.lv - WALL / 2) ? shaft.v + shaft.lv : landing.v + landing.lv;
    return { u, v, lu: farU - u, lv: farV - v };
}
