import { expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { generate, expandBuilding, type InteriorRequest } from '../src/index.js';

it('publishes one roof navigation floor with only its enclosure volume, no duplicate geometry or elevator stop', async () => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = await exterior.generate({ seed: 'roof-band', buildingId: 'roof-band', theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [20.5, 0], [20.5, 37.5], [0, 37.5]], accessPoint: [0, 18.75], maxHeight: 18 },
        building: { type: 'residential', tier: 'rich', floors: 3 }, options: { architecture: 'balcony-grid', glb: 'merged' } }, { textures: { mode: 'keys' } });
    const request: InteriorRequest = { seed: 'roof-band', building: { id: 'roof-band', type: 'residential', tier: 'rich' }, blueprint, materialTheme: 'cyberpunk' };
    const result = await generate(request);
    const access = result.layouts.crown!.npc.nav.roofAccess!;
    const roof = result.building.floors.find(ref => ref.index === access.floor)!;
    const layout = result.layouts[roof.layout]!;
    expect(roof.elevation).toBe(blueprint.roof.elevation);
    expect(layout.floor.kind).toBe('roof');
    expect(layout.floor.rooms.map(room => room.id)).toEqual(['stair-a']);
    expect(layout.floor.core.elevators).toEqual([]);
    expect(layout.placements).toEqual([]);
    expect(expandBuilding(result).npc.nav.floors.filter(floor => floor.floor === access.floor)).toHaveLength(1);
    expect(result.building.connectors.filter(connector => connector.kind === 'elevator')
        .every(connector => !connector.floors.includes(access.floor))).toBe(true);

    // Exercise the actual unchanged streamer and interaction gate. The roof band owns
    // no interior mesh; its shell and neighbouring crown support it, so it can load
    // independently without a duplicate furnished storey at the roof elevation.
    const [{ InteriorStream }, { Interactor }, { doorFrames }] = await Promise.all([
        import(new URL('../../engine/src/game/city/InteriorStream.js', import.meta.url).href),
        import(new URL('../../engine/src/game/player/Interactor.js', import.meta.url).href),
        import(new URL('../../engine/src/game/city/DoorGeometry.js', import.meta.url).href),
    ]);
    const stream = new InteriorStream({ modules: { group: new Group(), boundsOf: () => null } });
    const roofOnly = { ...result, building: { ...result.building, floors: [roof] } };
    const [x, z] = access.entry, feet = new Vector3(x, roof.elevation + .02, z);
    stream.register(new Map([['roof-band', { blueprint, interior: roofOnly }]]), new Map([['roof-band', { x, z }]]));
    const door = doorFrames(blueprint).find((door: { role: string }) => door.role === 'roof');
    const controller = { body: { feet }, eye: feet.clone().add(new Vector3(0, 1.1, 0)), look: new Vector3(-access.door.normal[0], 0, -access.door.normal[1]) };
    const interactor = new Interactor({ crowd: { within: () => [] }, doors: [door], controller, interiors: stream });
    interactor.target = { kind: 'door', door };
    interactor.activate({ timeMin: 0 });
    expect(door.wanted).toBe(1);
    interactor.update(1);
    expect(door.open).toBe(0);
    try {
        for (let frame = 0; frame < 20 && !stream.floorShown('roof-band', access.floor); frame++) {
            stream.update(feet);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        expect(stream.floorShown('roof-band', access.floor)).toBe(true);
        interactor.update(1);
        expect(door.open).toBe(1);
    } finally { stream.dispose(); }
}, 180_000);
