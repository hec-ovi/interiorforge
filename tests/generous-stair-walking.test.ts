import { expect, it } from 'vitest';
import type { BuildingType, Tier, InteriorRequest } from '../src/core/types.js';
import type { Placement, PlacementResult } from '../src/placements/types.js';
import * as THREE from 'three';
import { generate as interior, makePlacementFixture } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { planCore, stairAccess } from '../src/layout/core-plan.js';
import { stairClearWidth } from '../src/geometry/stairs.js';
import { stairProfile } from '../src/layout/stair-plan.js';

const [{ generate: exterior }, { floorBoxes }, { floorPlacements, buildingFloors }, { BuildingsLoader },
    { cityGltfLoader }, { Physics }, { PlayerBody }, { DoorColliders }] = await Promise.all([
    import(new URL('../../exterior/src/index.ts', import.meta.url).href),
    import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
    import(new URL('../../engine/src/game/city/InteriorLayouts.js', import.meta.url).href),
    import(new URL('../../engine/src/game/city/BuildingsLoader.js', import.meta.url).href),
    import(new URL('../../engine/src/game/data/CityGltfLoader.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/DoorColliders.js', import.meta.url).href),
]);
const STEP = 1 / 60;
const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const bounds = (id: string) => catalog.get(id);
const factory = { resolver: { resolve: () => null }, build: () => new THREE.MeshBasicMaterial(), variant: () => new THREE.MeshBasicMaterial() };

it('keeps the smaller stair kit on narrow plates', () => {
    const request = makePlacementFixture({ width: 18, depth: 16, floors: 3, type: 'residential', tier: 'high_rich' });
    const core = planCore(request, []);
    expect(Math.min(core.stairA.lu, core.stairA.lv)).toBeLessThan(4.5);
    expect(stairProfile(core.stairA)).toMatchObject({ landing: 1.2, tread: .28 });
    expect(stairClearWidth(core.stairA)).toBeGreaterThanOrEqual(1.2);
});

it.each([0, 37])('walks broad stairs and open portals on both sides of each flight through every floor and roof at %s degrees', async angle => {
    const { source, physics, request } = await building('mirror-frame', 40, 40, 6, angle, 'residential', 'high_rich', 'meridian-stair-proof', 36);
    try {
        const core = planCore(request, []);
        expect(core.mode).toBe('compact');
        expect(stairClearWidth(core.stairA)).toBeGreaterThanOrEqual(1.9);
        expect(stairProfile(core.stairA)).toMatchObject({ landing: 2, tread: .3 });
        expect(stairAccess(core, 'a').width).toBeGreaterThan(4.2);
        expect(source.building.corePlacement!.stairA.width).toBeCloseTo(4.5);
        expect(Object.values(source.layouts).some(layout => layout.floor.kind === 'roof')).toBe(true);
        for (const stair of source.layouts.ground!.floor.core.stairs) for (const lateral of [-.3, .3]) {
            const route = walkingRoute(source, stair.id, lateral);
            const player = new PlayerBody(physics, route[0]!.clone().add(new THREE.Vector3(0, .025, 0)));
            for (const [index, point] of route.entries()) walkTo(physics, player, point, `${stair.id} ascent ${index} lateral ${lateral}`);
            for (const [index, point] of [...route].reverse().entries()) walkTo(physics, player, point, `${stair.id} descent ${index} lateral ${lateral}`);
            physics.world.removeCollider(player.collider, true);
        }
    } finally { physics.world.free(); }
}, 180_000);

it('repositions a small stair on a stepped plate to preserve eight floors and a reachable roof', async () => {
    const { source, physics, request } = await building('balcony-grid', 32, 24, 8, 0,
        'residential', 'high_rich', 'plans:balcony-grid-4x3x8f', 38);
    try {
        expect(source.building.floors).toHaveLength(9);
        const shaft = planCore(request, []).stairA;
        expect(Math.min(shaft.lu, shaft.lv)).toBe(3);
        expect(Object.values(source.layouts).some(layout => layout.npc.nav.roofAccess)).toBe(true);
        const route = walkingRoute(source, 'stair-a');
        const player = new PlayerBody(physics, route[0]!.clone().add(new THREE.Vector3(0, .025, 0)));
        for (const [index, point] of route.entries()) walkTo(physics, player, point, `small stair ascent ${index}`);
        for (const [index, point] of [...route].reverse().entries()) walkTo(physics, player, point, `small stair descent ${index}`);
    } finally { physics.world.free(); }
}, 180_000);

async function building( architecture: string, width: number, depth: number, floors: number, degrees: number, type: BuildingType, tier: Tier, seed: string, maxHeight: number ) {
	const angle = degrees * Math.PI / 180;
	const rotate = ( x: number, z: number ): [number, number] => [ x * Math.cos( angle ) - z * Math.sin( angle ), x * Math.sin( angle ) + z * Math.cos( angle ) ];
	const request = {
		seed, buildingId: `review-${architecture}`, theme: 'cyberpunk',
		parcel: { footprint: [ rotate( 0, 0 ), rotate( width, 0 ), rotate( width, depth ), rotate( 0, depth ) ],
			accessPoint: rotate( width / 2, 0 ), maxHeight },
		building: { type, tier, floors }, options: { architecture, glb: 'merged' }
	};
	const { blueprint, glb } = await exterior( request, { textures: { mode: 'keys' } } );
	const source = await interior( { seed: request.seed, building: { id: request.buildingId, type, tier }, blueprint, materialTheme: 'cyberpunk' } );
	const loader = { loadAsync: async (url: string) => {
		// Imported plants are decorative; this checks the real shell and room solids.
		if ( url !== '/walk-stairs.glb' ) throw new Error( 'Decorative models have no collision' );
		return cityGltfLoader().parseAsync( glb.buffer.slice( glb.byteOffset, glb.byteOffset + glb.byteLength ), '' );
	} };
	const city = await new BuildingsLoader( factory, loader ).load( new Map( [ [ request.buildingId, {
		parcelId: request.buildingId, blueprint, shellUrl: '/walk-stairs.glb', hasInterior: true, interior: source
	} ] ] ) );
	const physics = await Physics.create();
	physics.addHalfSpace( -.01 );
	for ( const geometry of city.shellColliders.values() ) if ( geometry ) physics.addTrimesh( geometry );
	for ( const floor of buildingFloors( request.buildingId, source ) ) physics.addBoxes( floorBoxes( floorPlacements( floor ), floor.elevation, bounds ) );
	const doors = new DoorColliders( physics, city.doors );
	for ( const door of city.doors ) { door.motion.apply( door.pivots, 1 ); doors.sync( door ); }
	physics.step( STEP );
	return { source, physics, city, request: { seed: request.seed, building: { id: request.buildingId, type, tier }, blueprint, materialTheme: 'cyberpunk' } satisfies InteriorRequest };
}

function walkingRoute( source: PlacementResult, stairId: string, lateral = 0 ) {
	const route = [];
	for ( const floor of source.building.floors ) {
		const layout = source.layouts[ floor.layout ]!;
        if (layout.floor.kind === 'roof') continue;
		const stair = layout.floor.core.stairs.find( entry => entry.id === stairId )!;
		const flights = layout.placements.filter( p => p.connector === stairId && p.module?.startsWith( 'stair-flight-' ) ).sort( ( a, b ) => a.position[ 1 ] - b.position[ 1 ] );
		const door = layout.placements.filter( p => p.module === 'door-header' ).sort( ( a, b ) =>
			Math.hypot( a.position[ 0 ] - stair.entry[ 0 ], a.position[ 2 ] - stair.entry[ 1 ] )
			- Math.hypot( b.position[ 0 ] - stair.entry[ 0 ], b.position[ 2 ] - stair.entry[ 1 ] ) )[ 0 ]!;
		const entry = new THREE.Vector3( stair.entry[ 0 ], floor.elevation, stair.entry[ 1 ] );
		const threshold = new THREE.Vector3( door.position[ 0 ], floor.elevation, door.position[ 2 ] );
		if ( route.length ) { route.push( threshold, entry, threshold ); } else route.push( entry, threshold );
		for ( const flight of flights ) {
			const count = Number( flight.module!.split( '-' ).at( - 1 ) );
			route.push( pointOnFlight( flight, floor.elevation, .725 + lateral, -.55, 0 ) );
			for ( let step = 0; step < count; step ++ ) route.push( pointOnFlight( flight, floor.elevation, .725 + lateral, ( step + .5 ) * .28, ( step + 1 ) * .17 ) );
			route.push( pointOnFlight( flight, floor.elevation, .725 + lateral, count * .28 + .55, count * .17 ) );
		}
		const roof = layout.npc.nav.roofAccess;
		if ( roof && stairId === roof.stair ) {
			const { position, normal } = roof.door;
			route.push( new THREE.Vector3( position[ 0 ] - normal[ 0 ] * .45, floor.elevation + roof.elevation, position[ 1 ] - normal[ 1 ] * .45 ),
				new THREE.Vector3( position[ 0 ], floor.elevation + roof.elevation, position[ 1 ] ),
				new THREE.Vector3( roof.entry[ 0 ], floor.elevation + roof.elevation, roof.entry[ 1 ] ) );
		}
	}
	return route;
}

function pointOnFlight( placement: Placement, elevation: number, x: number, z: number, y: number ) {
	return new THREE.Vector3( x * placement.scale[ 0 ], y * placement.scale[ 1 ], z * placement.scale[ 2 ] )
		.applyAxisAngle( new THREE.Vector3( 0, 1, 0 ), placement.rotationY )
		.add( new THREE.Vector3( placement.position[ 0 ], elevation + placement.position[ 1 ], placement.position[ 2 ] ) );
}

/** Every metre is character-controller movement: no teleport, lift carry, jump or height correction. */
function walkTo( physics: { step(dt: number): void }, player: { feet: THREE.Vector3; move(delta: THREE.Vector3, dt: number): void }, target: THREE.Vector3, label: string ) {
	for ( let step = 0; step < 600; step ++ ) {
		const movement = target.clone().sub( player.feet ); movement.y = 0;
		if ( movement.length() < .035 ) break;
		movement.clampLength( 0, 2.5 * STEP );
		physics.step( STEP ); player.move( movement, STEP );
	}
	const distance = new THREE.Vector2( target.x - player.feet.x, target.z - player.feet.z ).length();
	for ( let frame = 0; frame < 3; frame ++ ) { physics.step( STEP ); player.move( new THREE.Vector3(), STEP ); }
	expect( distance, `${label}: requested ${target.toArray()}, reached ${player.feet.toArray()}` ).toBeLessThan( .05 );
	expect( Math.abs( player.feet.y - target.y ), `${label}: floor height ${target.y}, feet ${player.feet.y}` ).toBeLessThan( .24 );
}
