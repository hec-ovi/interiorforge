import { expect, it } from 'vitest';
import { balanceIllumination, luxBand, planLights } from '../src/layout/lighting.js';
import type { CorePlan } from '../src/layout/core-plan.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { idGen } from '../src/layout/rooms.js';
import { roomArea, roomClearance } from '../src/layout/room-shape.js';
import { makeFrame, uvRectCorners, worldToUv } from '../src/layout/uv.js';

it.each(['ring', 'u'])('lights a narrow %s lounge when its regular fixture grid misses the usable floor', shape => {
    const rect = { u: 0, v: 0, lu: 16, lv: 16 };
    const room: PlanRoom = { id: 'perimeter-lounge', kind: 'lounge', rect,
        polygon: shape === 'ring' ? uvRectCorners(rect)
            : [[0, 0], [16, 0], [16, 16], [14, 16], [14, 2], [2, 2], [2, 16], [0, 16]],
        ...(shape === 'ring' ? { holes: [uvRectCorners({ u: 2, v: 2, lu: 12, lv: 12 })] } : {}), doors: [] };
    const core: CorePlan = { frame: makeFrame(27), mode: 'standard', vFace: 6, u0: 5, u1: 11,
        depth: 4, stairStyle: 'u_return', stairDepth: 6, elevatorCount: 0, elevators: [],
        stairA: { u: 5, v: 6, lu: 6, lv: 3 }, riser: { u: 5, v: 9, lu: 1, lv: 1 },
        stub: { u: 6, v: 9, lu: 1, lv: 1 } };
    const lights = planLights([room], core, room.polygon!, 3.5, 3.7, idGen(0), 'mid');
    balanceIllumination([{ id: room.id, kind: room.kind, area: roomArea(room) }], lights, 'mid');
    const own = lights.filter(light => light.room === room.id);
    const [low, high] = luxBand(room.kind, 'mid');
    const lux = own.reduce((sum, light) => sum + light.intensity, 0) / roomArea(room);
    expect(lux).toBeGreaterThanOrEqual(low);
    expect(lux).toBeLessThanOrEqual(high);
    for (const light of own) {
        expect(light.intensity).toBeLessThanOrEqual(9000);
        expect(light.colorTemperatureK).toBe(2900);
        expect(roomClearance(room, worldToUv([light.position[0], light.position[2]], core.frame))).toBeGreaterThan(0.05);
    }
    expect(new Set(own.map(light => light.position.join(','))).size).toBe(own.length);
});
