import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { generate, type InteriorRequest } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { LIFT_CAR } from '../src/geometry/lift-spec.js';
import { luxBand } from '../src/layout/lighting.js';
import { roomFootprintArea } from '../src/core/room-footprint.js';
import { planCore } from '../src/layout/core-plan.js';
import { baseLanding, computeStairSteps, entryAtLowEnd } from '../src/geometry/stairs.js';
import { uvToWorld } from '../src/layout/uv.js';
import { publishStairSpaces } from '../src/placements/stair-spaces.js';

it.each([0, 37])('publishes actual stair/lift volumes and keeps the roof outdoors at %s degrees', async degrees => {
    const [{ generate: exterior }, { roomsOf, floorOrphans }, { buildingFloors }, { RoomView }, { floorBoxes }] = await Promise.all([
        import(new URL('../../exterior/src/index.ts', import.meta.url).href),
        import(new URL('../../engine/src/game/city/InteriorRooms.js', import.meta.url).href),
        import(new URL('../../engine/src/game/city/InteriorLayouts.js', import.meta.url).href),
        import(new URL('../../engine/src/game/city/RoomView.js', import.meta.url).href),
        import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
    ]);
    const radians = degrees * Math.PI / 180;
    const rotate = (x: number, z: number) => [x * Math.cos(radians) - z * Math.sin(radians), x * Math.sin(radians) + z * Math.cos(radians)];
    const { blueprint } = await exterior({ seed: 'enclosed-stairs', buildingId: 'enclosed-stairs', theme: 'cyberpunk',
        parcel: { footprint: [rotate(0, 0), rotate(40, 0), rotate(40, 40), rotate(0, 40)], accessPoint: rotate(20, 0), maxHeight: 29 },
        building: { type: 'residential', tier: 'high_rich', floors: 6 }, options: { architecture: 'mirror-frame' } }, { textures: { mode: 'keys' } });
    const request: InteriorRequest = { seed: blueprint.seed, building: { id: blueprint.buildingId, type: 'residential', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' };
    const result = await generate(request), core = planCore(request, []);
    const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
    const modules = { boundsOf: (id: string) => catalog.get(id), slotsOf: (id: string) => catalog.get(id)?.mesh.materials() ?? [] };
    const floors = buildingFloors(request.building.id, result);
    const rooms = floors.flatMap((floor: unknown) => roomsOf(floor, modules));
    const view = new RoomView(rooms, 80), eye = new Vector3();
    const inside = (feet: Vector3) => view.update(feet, 1).find((room: { holds(feet: Vector3): boolean }) => room.holds(feet));
    let checked = 0;
    {
        for (const bp of blueprint.floors) for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
            const shaft = which === 'a' ? core.stairA : core.stairB!, low = entryAtLowEnd(core, which);
            const steps = [baseLanding(shaft, low, bp.elevation), ...computeStairSteps(shaft, low, bp.elevation, bp.height)];
            for (const step of steps) {
                // The highest stair B floor is a terminal landing, with no flight beyond it.
                if (which === 'b' && bp.index === blueprint.floors.at(-1).index && step !== steps[0]) continue;
                const [x, z] = uvToWorld([step.u + step.lu / 2, step.v + step.lv / 2], core.frame);
                const feet = new Vector3(x, step.y + .02, z), room = inside(feet);
                expect(room?.roomId, `stair-${which} floor ${bp.index} height ${step.y}`).toBe(`stair-${which}`);
                eye.copy(feet).add(new Vector3(0, 1.65, 0));
                expect(inside(eye)?.roomId, `eye above stair-${which} floor ${bp.index}`).toBe(`stair-${which}`);
                checked++;
            }
        }
        for (const bp of blueprint.floors) for (const elevator of core.elevators) {
            const { rect, id } = elevator;
            const [hx, hz] = uvToWorld([rect.u + rect.lu / 2, core.vFace - .6], core.frame);
            const hall = inside(new Vector3(hx, bp.elevation + .02, hz));
            expect(hall).toBeDefined();
            expect(hall.roomId).not.toBe(id);
            const heights = bp.index === blueprint.floors.at(-1).index ? [0] : [0, bp.height / 4, bp.height / 2, bp.height * .75];
            for (const height of heights) for (const offset of [-.7, 0, .7]) {
                const [x, z] = uvToWorld([rect.u + rect.lu / 2 + offset, rect.v + rect.lv / 2], core.frame);
                const feet = new Vector3(x, bp.elevation + height + .02, z);
                const room = inside(feet);
                expect(room?.roomId, `lift ${id} floor ${bp.index} height ${height}`).toBe(id);
                eye.copy(feet).add(new Vector3(0, 1.65, 0));
                expect(inside(eye)?.roomId).toBe(id);
            }
        }
        const roof = result.layouts.crown!.npc.nav.roofAccess!, crown = result.building.floors.find(ref => ref.layout === 'crown')!;
        const outside = new Vector3(roof.entry[0], crown.elevation + roof.elevation + .02, roof.entry[1]);
        expect(inside(outside)).toBeUndefined();
        expect(checked).toBeGreaterThan(200);
        for (const floor of floors.filter((floor: { floor: number }) => floor.floor < roof.floor)) {
            expect(floorOrphans(floor).rooms.filter((id: string) => id.startsWith('stair-'))).toEqual([]);
            for (const which of ['a', 'b']) expect(rooms.find((room: { floor: number; roomId: string }) => room.floor === floor.floor && room.roomId === `stair-${which}`)?.flux).toBeGreaterThan(0);
        }
        for (const layout of Object.values(result.layouts)) {
            if (layout.floor.kind !== 'roof') for (const room of layout.floor.rooms.filter(room => room.id.startsWith('stair-'))) {
                const own = layout.floor.lights.filter(light => light.room === room.id);
                const illuminance = own.reduce((sum, light) => sum + light.intensity, 0) / roomFootprintArea(room);
                const [low, high] = luxBand(room.kind, result.building.tier);
                expect(illuminance).toBeGreaterThanOrEqual(low);
                expect(illuminance).toBeLessThanOrEqual(high);
                expect(own.every(light => light.intensity <= 9000)).toBe(true);
            }
            if (layout.floor.kind === 'roof') expect(layout.floor.rooms.some(room => room.id.startsWith('elev-'))).toBe(false);
            else for (const elevator of core.elevators) {
                const car = layout.placements.find(placement => placement.connector === elevator.id && placement.module === 'lift-car')!;
                const own = layout.floor.lights.filter(light => light.room === elevator.id);
                expect(own).toHaveLength(1);
                expect(own[0]!.id).toBe(car.id);
                expect(own[0]!.intensity).toBe(LIFT_CAR.lens.lumens);
                const cabinArea = (LIFT_CAR.width - 2 * LIFT_CAR.wall) * car.scale[0]
                    * (LIFT_CAR.depth - 2 * LIFT_CAR.wall) * car.scale[2];
                const [low, high] = luxBand('corridor', result.building.tier);
                expect(own[0]!.intensity / cabinArea).toBeGreaterThanOrEqual(low);
                expect(own[0]!.intensity / cabinArea).toBeLessThanOrEqual(high);
            }
            expect(layout.floor.furniture.some(item => /^(stair-|elev-)/.test(item.room))).toBe(false);
            expect(layout.npc.anchors.some(anchor => anchor.room && /^(stair-|elev-)/.test(anchor.room))).toBe(false);
        }
        // Publication changes ownership only: no new geometry, collision slabs, nav or NPC work.
        const unpublished = structuredClone(result);
        for (const layout of Object.values(unpublished.layouts)) layout.floor.rooms = layout.floor.rooms.filter(room => !/^(stair-|elev-)/.test(room.id));
        const geometry = () => Object.values(unpublished.layouts).map(layout => layout.placements.map(({ room, ...placement }) => placement));
        const collisions = () => Object.values(unpublished.layouts).map(layout => floorBoxes(layout.placements, 0, modules.boundsOf));
        const beforeCollisions = collisions();
        const lights = () => Object.values(unpublished.layouts).map(layout => layout.floor.lights.map(({ room, ...light }) => light));
        const beforeLights = structuredClone(lights());
        const before = structuredClone(geometry()), npc = Object.values(unpublished.layouts).map(layout => structuredClone(layout.npc));
        publishStairSpaces(unpublished, request, core);
        expect(geometry()).toEqual(before);
        expect(collisions()).toEqual(beforeCollisions);
        expect(lights()).toEqual(beforeLights);
        expect(Object.values(unpublished.layouts).map(layout => layout.npc)).toEqual(npc);
    }
}, 180_000);
