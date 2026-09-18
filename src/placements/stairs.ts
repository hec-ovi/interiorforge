import { InteriorError } from '../core/errors.js';
import { STAIR, WALL } from '../layout/constants.js';
import { planFlights } from '../layout/stair-plan.js';
import type { CorePlan } from '../layout/core-plan.js';
import { uvToWorld } from '../layout/uv.js';
import { baseLanding, computeStairSteps, entryAtLowEnd, minHeadroom, stairClearWidth, type RunStep } from '../geometry/stairs.js';
import { surface } from './surfaces.js';
import type { PlacementBuilder } from './builder.js';
export function stairs(builder: PlacementBuilder, core: CorePlan, climb: number, roofOnly = false): Map<string, RunStep[]> {
    const runs = new Map<string, RunStep[]>();
    for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
        const shaft = which === 'a' ? core.stairA : core.stairB!, id = `stair-${which}`, low = entryAtLowEnd(core, which);
        if (stairClearWidth(shaft) < STAIR.flightWidth - 1e-6)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} clear width below 1.2 m`);
        const landing = baseLanding(shaft, low, 0);
        surface(builder, 'floor-tile', id, landing, 0, core.frame);
        if (!climb || roofOnly && which === 'b')
            continue;
        const plan = planFlights(climb);
        if (plan.rise < STAIR.riser.min - 1e-6 || plan.rise > STAIR.riser.max + 1e-6)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} cannot keep riser clearance`);
        const steps = computeStairSteps(shaft, low, 0, climb), slab = .15 * plan.rise / .17;
        const run = [landing, ...steps].map(s => ({ ...s, slab }));
        const repeated = [...run, ...run.map(s => ({ ...s, y: s.y + climb }))];
        if (minHeadroom(repeated) < STAIR.headroom - 1e-6)
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
            ] = [first.u + first.lu / 2 - right[0] * width / 2 - forward[0] * STAIR.tread / 2,
                first.v + first.lv / 2 - right[1] * width / 2 - forward[1] * STAIR.tread / 2];
            const [x, z] = uvToWorld(start, core.frame);
            const rotation = Math.atan2(forward[0], forward[1]) - core.frame.angleDeg * Math.PI / 180;
            builder.module(`stair-flight-${plan.risersPerFlight}`, id, [x, first.y - plan.rise, z], [width / 1.45, plan.rise / .17, 1], rotation);
            if (flight < plan.flights - 1) {
                const turn = steps[(flight + 1) * (plan.risersPerFlight + 1) - 1]!;
                surface(builder, 'floor-tile', id, turn, turn.y, core.frame);
            }
        }
    }
    return runs;
}
