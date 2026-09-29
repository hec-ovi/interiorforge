import { LIFT_CAR } from './lift-spec.js';
import type { CorePlan } from '../layout/core-plan.js';
import type { UvRect } from '../layout/uv.js';
import type { UvWallHole } from './walls.js';
const DOOR_H = 2.2;
export function elevatorDoorHole(core: CorePlan, elevatorIndex: number, elevation: number): UvWallHole {
    const rect = core.elevators[elevatorIndex]!.rect;
    return {
        axis: "H",
        c: core.vFace,
        hole: { at: rect.u + rect.lu / 2, width: LIFT_CAR.doorWidth * (rect.lu - 0.2) / LIFT_CAR.width, y0: elevation, y1: elevation + DOOR_H },
    };
}
export function coreRects(core: CorePlan): UvRect[] {
    const rects: UvRect[] = [core.stairA, core.riser, ...core.elevators.map((e) => e.rect)];
    if (core.stairB)
        rects.push(core.stairB);
    return rects;
}
