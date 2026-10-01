#!/usr/bin/env -S node --import tsx
/**
 * A single generated building in a native Atlas city. Run from the repository:
 * docker compose exec --user 1000:1000 -T engine node --import tsx /work/interior/scripts/review-building.mjs
 *   --architecture residential-megablock --tier poor --type residential
 *   --width 40 --depth 40 --floors 6 --out poor-review-01
 *
 * --plan-only selects/validates the request without generating or writing anything.
 * --blueprint, --seed, --name, --theme and --entrance south|west are optional.
 * --interiorStyle apartment-1702 --duplexFloors 1,3 requests private paired homes
 * on storeys 1/2 and 3/4. Omit --duplexFloors to pair eligible storeys above ground.
 * Output is published atomically under engine/out/reviews. Existing worlds and
 * review directories are never replaced. All unselected lots are marked empty.
 * Imports public Engine assembly APIs; makes no Engine source changes.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';
import { BuildingPipeline } from '../../engine/src/assembly/BuildingPipeline.js';
import { ExteriorWorkers } from '../../engine/src/assembly/ExteriorWorkers.js';
import { InteriorModules } from '../../engine/src/assembly/InteriorModules.js';
import { OutDir } from '../../engine/src/assembly/OutDir.js';
import { StandingBuildings } from '../../engine/src/assembly/StandingBuildings.js';
import { ConnectionsArtifact } from '../../engine/src/assembly/ConnectionsArtifact.js';
import { collectShellArtifacts } from '../../engine/src/assembly/ShellArtifacts.js';
import { runConnections, runRooftopSpans } from '../../engine/src/assembly/connectionsRunner.js';
import { validateExteriorRequest } from '../../engine/src/assembly/validators.js';
import { annotateReview } from '../../engine/scripts/review-report.mjs';

const engineRoot = fileURLToPath( new URL( '../../engine/', import.meta.url ) );
const args = process.argv.slice( 2 );
const options = {
	blueprint: join( engineRoot, 'out/cities/sluice/blueprint.json' ),
	architecture: 'residential-megablock', tier: 'poor', type: 'residential',
	width: 40, depth: 40, floors: 6, entrance: 'south', theme: 'cyberpunk',
	seed: 'interior-reference-review', name: 'Ashcourt House', exposure: 0.04, interiorStyle: null, duplexFloors: null,
	clearHeight: null, floorHeight: null, out: null, planOnly: false, neighbours: 0
};
while ( args.length ) {
	const flag = args.shift();
	if ( flag === '--plan-only' ) { options.planOnly = true; continue; }
	const key = flag.replace( /^--/, '' );
	if ( ! flag.startsWith( '--' ) || ! Object.hasOwn( options, key ) || key === 'planOnly' || ! args.length ) throw new Error( `Unknown or incomplete option: ${flag}` );
	const value = args.shift();
	options[ key ] = [ 'width', 'depth', 'floors', 'exposure', 'clearHeight', 'floorHeight', 'neighbours' ].includes( key ) ? Number( value ) : value;
}
for ( const key of [ 'width', 'depth', 'floors', 'exposure' ] ) {
	if ( ! Number.isFinite( options[ key ] ) || options[ key ] <= 0 ) throw new Error( `${key} must be positive.` );
}
if ( ! Number.isInteger( options.floors ) ) throw new Error( 'floors must be an integer.' );
for ( const key of [ 'clearHeight', 'floorHeight' ] ) if ( options[ key ] !== null && ( ! Number.isFinite( options[ key ] ) || options[ key ] <= 0 ) ) throw new Error( `${key} must be positive.` );
// Basic dwellings use their source-like domestic section; rich public/suite
// sets retain the architecture's authored defaults unless explicitly selected.
if ( [ 'poor', 'mid' ].includes( options.tier ) && [ 'residential', 'hotel' ].includes( options.type ) ) {
	options.clearHeight ??= 3;
	options.floorHeight ??= 3.5;
}
if ( ! [ 'south', 'west' ].includes( options.entrance ) ) throw new Error( 'entrance must be south or west.' );
if ( options.duplexFloors !== null && ( typeof options.duplexFloors !== 'string' || ! /^[1-9]\d*(?:,[1-9]\d*)*$/.test( options.duplexFloors ) ) ) {
	throw new Error( 'duplexFloors must be a comma-separated list of positive integer lower storeys, for example 1,3.' );
}
if ( options.duplexFloors !== null && options.interiorStyle !== 'apartment-1702' ) throw new Error( 'duplexFloors requires interiorStyle apartment-1702.' );
const duplexFloors = options.duplexFloors !== null ? options.duplexFloors.split( ',' ).map( Number )
	: options.interiorStyle === 'apartment-1702' ? Array.from( { length: Math.floor( ( options.floors - 1 ) / 2 ) }, ( _, index ) => 1 + index * 2 ) : [];
if ( options.interiorStyle === 'apartment-1702' && ! duplexFloors.length ) throw new Error( 'apartment-1702 needs a special ground storey and at least one complete duplex pair.' );
const duplexOccupied = new Set();
for ( const floor of duplexFloors ) {
	if ( ! Number.isSafeInteger( floor ) || floor < 1 || floor + 1 >= options.floors ) throw new Error( `Duplex pair ${floor}/${floor + 1} lies outside the requested occupied storeys.` );
	if ( duplexOccupied.has( floor ) || duplexOccupied.has( floor + 1 ) ) throw new Error( `Duplex pair ${floor}/${floor + 1} overlaps another pair.` );
	duplexOccupied.add( floor ); duplexOccupied.add( floor + 1 );
}
options.blueprint = resolve( options.blueprint );
options.out ??= `${options.architecture}-${options.tier}-${new Date().toISOString().replace( /[^0-9]/g, '' )}`;
if ( ! /^[a-z0-9][a-z0-9._-]*$/.test( options.out ) || basename( options.out ) !== options.out ) throw new Error( 'Output must be one safe folder name.' );
process.env.URBE_ASSEMBLY_WORKERS = '2';
process.env.URBE_ASSEMBLY_MAX_TEMP = '88';
const atlas = JSON.parse( await readFile( options.blueprint, 'utf8' ) );
const root = join( engineRoot, 'out/reviews' );
const target = join( root, options.out );
if ( existsSync( target ) ) throw new Error( `Output exists: ${target}. Choose a new --out; existing review worlds are preserved.` );
// `--neighbours n` stands n more buildings of the same request on the nearest free lots, each
// with a seed of its own, to compare neighbours' interiors side by side.
if ( ! Number.isInteger( options.neighbours ) || options.neighbours < 0 ) throw new Error( 'neighbours must be a whole number.' );
const fixtures = [ options, ...Array.from( { length: options.neighbours }, ( _, index ) =>
	( { ...options, seed: `${options.seed}-${index + 2}`, name: `${options.name} ${index + 2}` } ) ) ];
const used = new Set();
const selection = fixtures.map( fixture => select( atlas, fixture, used ) );
const requests = new Map( selection.map( entry => [ entry.parcelId, entry.request ] ) );
// This is a new review set, not a hospital merely wearing a residential shell.
// Keep native land and access unchanged, and publish the chosen building's use.
for ( const [ index, entry ] of selection.entries() ) {
	const parcel = atlas.parcels.find( parcel => parcel.id === entry.parcelId );
	Object.assign( parcel, { type: options.type, tier: options.tier, name: fixtures[ index ].name,
		footprint: entry.request.parcel.footprint } );
}
const report = {
	format: 'urbe-building-review-v1', kind: 'single', source: options.blueprint, seed: atlas.meta.seed,
	buildings: selection.map( ( { request, ...entry } ) => entry ),
	...( options.interiorStyle ? { interiorStyle: options.interiorStyle } : {} ),
	...( options.clearHeight !== null ? { minimumClearHeight: options.clearHeight } : {} ),
	...( options.floorHeight !== null ? { preferredFloorHeight: options.floorHeight } : {} ),
	...( duplexFloors.length ? { duplexFloors } : {} ),
	playUrl: `http://localhost:5306/?mode=game&out=/out/reviews/${options.out}&hour=12&backend=webgl&quality=high&exposure=${options.exposure}&crowd=0&cars=0&voice=off&details=off`,
	// The Atlas preview includes its planned massing on deliberately empty lots.
	// The game link above shows only the single building actually built.
	landPlanUrl: `http://localhost:5306/?mode=city&out=/out/reviews/${options.out}`
};
console.log( JSON.stringify( report, null, 2 ) );
if ( options.planOnly ) process.exit( 0 );
await mkdir( root, { recursive: true } );
const staged = await mkdtemp( join( root, `.${options.out}-` ) );
const exterior = new ExteriorWorkers( 2 );
try {
	// The adapter supplies explicit valid producer requests; the pipeline retains
	// its normal validation, generation, core gate and interior publication.
	const pipeline = new BuildingPipeline( {
		assemble: ( id, { floorCap } = {} ) => {
			const request = structuredClone( requests.get( id ) );
			if ( floorCap !== undefined ) request.building.floors = Math.min( request.building.floors, floorCap );
			return request;
		},
		assembleInterior: ( id, { blueprint, shellGlb } ) => {
			const request = requests.get( id );
			return { seed: request.seed, building: { id, type: request.building.type, tier: request.building.tier,
				...( options.interiorStyle ? { interiorStyle: options.interiorStyle } : {} ) },
				blueprint, materialTheme: request.theme, ...( shellGlb ? { shellGlb } : {} ),
				...( duplexFloors.length ? { assignments: pairedAssignments( blueprint ) } : {} ) };
		}
	}, { exterior } );
	const standing = new StandingBuildings();
	for ( const parcel of atlas.parcels ) standing.empty( parcel.id );
	// Use the normal producer pipeline with two workers and its thermal governor.
	for ( const entry of selection ) {
		const { blueprint } = await pipeline.build( entry.parcelId, join( staged, entry.parcelId ), { interior: true } );
		if ( blueprint.floors.filter( floor => floor.index >= 0 ).length !== entry.floors ) throw new Error( `Producer changed requested floor count: ${entry.parcelId}` );
		const actualArchitecture = blueprint.assembly?.architecture ?? 'ordinary';
		if ( actualArchitecture !== entry.architecture ) throw new Error( `Requested ${entry.architecture}, but producer selected ${actualArchitecture}: ${entry.parcelId}` );
		const published = report.buildings.find( building => building.parcelId === entry.parcelId );
		Object.assign( published, { actualArchitecture,
			floorSchedule: blueprint.floors.map( floor => ( { index: floor.index, kind: floor.kind,
				elevation: floor.elevation, height: floor.height, outline: floor.outline } ) ) } );
		standing.place( entry.parcelId, blueprint.bounds.footprint, blueprint.roof.elevation );
		const parcel = atlas.parcels.find( parcel => parcel.id === entry.parcelId );
		parcel.footprint = blueprint.bounds.footprint;
		parcel.envelope = { ...parcel.envelope, minFloors: entry.floors, maxFloors: entry.floors, maxHeight: blueprint.roof.elevation };
		const massing = atlas.volumetric.buildings.find( building => building.parcelId === entry.parcelId );
		if ( massing ) Object.assign( massing, { footprint: blueprint.bounds.footprint, height: blueprint.roof.elevation } );
		console.log( `Built ${entry.architecture}: ${entry.parcelId}, ${entry.rotationDegrees} degrees, ${entry.floors} floors` );
	}
	const ids = selection.map( entry => entry.parcelId );
	// Standalone review requests have no interbuilding cut reservations. Use the
	// Connections public toggles so no later bridge/tunnel can meet an uncut wall.
	const connections = await runConnections( standing.atlas( atlas ), {
		seed: atlas.meta.seed, buildings: standing.roofs,
		toggles: { bridges: false, acTubes: false, tunnels: false, wires: false }
	} );
	const resources = await new InteriorModules().publish();
	const { catalog, rooftopRequest } = await collectShellArtifacts( staged, ids, { seed: atlas.meta.seed } );
	const rooftopSpans = await runRooftopSpans( rooftopRequest );
	const sources = Object.fromEntries( atlas.parcels.map( parcel => [ parcel.id, used.has( parcel.id ) ? 'shell' : 'empty' ] ) );
	const out = new OutDir( staged );
	await out.publishManifest( atlas, ids, ids, {
		catalog, rooftopSpans, connectionsArtifact: new ConnectionsArtifact( atlas, connections ), sources,
		interiorModules: resources.modules, interiorProps: resources.props, streets: true
	} );
	await writeFile( join( staged, 'review.json' ), JSON.stringify( report, null, 2 ) + '\n' );
	await annotateReview( staged );
	await rename( staged, target );
	console.log( `Published ${report.playUrl}` );
} finally {
	await exterior.close();
	await rm( staged, { recursive: true, force: true } );
}

/** Keep the actual shared storeys; only private dwellings consume each pair. */
function pairedAssignments( blueprint ) {
	const floors = blueprint.floors.filter( floor => floor.index >= 0 );
	const indices = new Set( floors.map( floor => floor.index ) );
	const ground = Math.min( ...indices );
	for ( const lower of duplexFloors ) {
		if ( lower === ground || ! indices.has( lower ) || ! indices.has( lower + 1 ) ) throw new Error( `Actual Exterior has no eligible duplex pair ${lower}/${lower + 1}.` );
	}
	const lower = new Set( duplexFloors ), upper = new Set( duplexFloors.map( floor => floor + 1 ) );
	return floors.filter( floor => ! upper.has( floor.index ) ).map( floor => ( {
		floor: floor.index, kind: floor.index === ground ? 'lobby' : 'apartment',
		...( lower.has( floor.index ) ? { spans: 2 } : {} )
	} ) );
}

function select( city, fixture, occupied ) {
	const center = city.meta.bounds.min.map( ( v, i ) => ( v + city.meta.bounds.max[ i ] ) / 2 );
	const candidates = [];
	for ( const parcel of city.parcels ) {
		if ( occupied.has( parcel.id ) || ! parcel.envelope || parcel.envelope.maxFloors < fixture.floors ) continue;
		const bounds = box( parcel.lot );
		const face = entranceFace( city, parcel, bounds );
		for ( const quarter of fixture.quarter === undefined ? [ 0, 1, 2, 3 ] : [ fixture.quarter ] ) {
			const local = [ [ 0, 0 ], [ fixture.width, 0 ], [ fixture.width, fixture.depth ], [ 0, fixture.depth ] ];
			const rotated = local.map( point => turn( point, quarter ) );
			const sourceBox = box( rotated );
			const normal = turn( fixture.entrance === 'west' ? [ -1, 0 ] : [ 0, -1 ], quarter );
			if ( normal[ 0 ] !== face[ 0 ] || normal[ 1 ] !== face[ 1 ] ) continue;
			const width = sourceBox.max[ 0 ] - sourceBox.min[ 0 ], depth = sourceBox.max[ 1 ] - sourceBox.min[ 1 ];
			if ( width > bounds.max[ 0 ] - bounds.min[ 0 ] - 1 || depth > bounds.max[ 1 ] - bounds.min[ 1 ] - 1 ) continue;
			const min = [ width, depth ].map( ( size, i ) => normal[ i ] < 0
				? Math.ceil( ( bounds.min[ i ] + 0.5 ) * 2 ) / 2
				: normal[ i ] > 0 ? Math.floor( ( bounds.max[ i ] - size - 0.5 ) * 2 ) / 2
					: Math.ceil( ( ( bounds.min[ i ] + bounds.max[ i ] - size ) / 2 ) * 2 ) / 2 );
			if ( min.some( ( v, i ) => v + [ width, depth ][ i ] > bounds.max[ i ] - 0.25 ) ) continue;
			const origin = min.map( ( v, i ) => v - sourceBox.min[ i ] );
			const move = point => turn( point, quarter ).map( ( v, i ) => v + origin[ i ] );
			const accessPoint = move( fixture.entrance === 'west' ? [ 0, fixture.depth / 2 ] : [ fixture.width / 2, 0 ] );
			const request = {
				seed: fixture.seed, buildingId: parcel.id,
				parcel: { footprint: local.map( move ), accessPoint, maxHeight: parcel.envelope.maxHeight,
					buildingGrid: { origin, angle: -quarter * Math.PI / 2, spacing: city.meta.buildingGrid?.spacing ?? 0.5 }, streetAccess: { edgeId: parcel.access.edgeId,
						path: city.streets.edges.find( edge => edge.id === parcel.access.edgeId ).path } },
				building: { type: fixture.type, tier: fixture.tier ?? 'rich', floors: fixture.floors }, theme: fixture.theme,
				options: { architecture: fixture.architecture, glb: 'merged',
					...( fixture.clearHeight !== null ? { minimumClearHeight: fixture.clearHeight } : {} ),
					...( fixture.floorHeight !== null ? { preferredFloorHeight: fixture.floorHeight } : {} ) }
			};
			const errors = validateExteriorRequest( request );
			if ( errors.length ) throw new Error( JSON.stringify( errors ) );
			const distance = min.reduce( ( sum, value, i ) => sum + ( value - center[ i ] ) ** 2, 0 );
			candidates.push( { parcelId: parcel.id, architecture: fixture.architecture, width: fixture.width,
				depth: fixture.depth, floors: fixture.floors, tier: fixture.tier, type: fixture.type, seed: fixture.seed, rotationDegrees: quarter * 90, accessPoint, request,
				distance } );
		}
	}
	candidates.sort( ( a, b ) => a.distance - b.distance || a.parcelId.localeCompare( b.parcelId, undefined, { numeric: true } ) );
	const selected = candidates[ 0 ];
	if ( ! selected ) throw new Error( `No street-facing lot fits ${fixture.architecture} ${fixture.width}x${fixture.depth}x${fixture.floors} at ${fixture.quarter ?? 'any'} quarter turn.` );
	occupied.add( selected.parcelId );
	delete selected.distance;
	return selected;
}

function box( ring ) {
	return { min: [ 0, 1 ].map( i => Math.min( ...ring.map( p => p[ i ] ) ) ), max: [ 0, 1 ].map( i => Math.max( ...ring.map( p => p[ i ] ) ) ) };
}

function entranceFace( city, parcel, bounds ) {
	// Match assembly's street-facing convention using the named source path,
	// including parcels whose access point lies at a corner.
	const path = city.streets.edges.find( edge => edge.id === parcel.access.edgeId ).path;
	const faces = [ [ -1, 0 ], [ 0, -1 ], [ 1, 0 ], [ 0, 1 ] ];
	return faces.sort( ( a, b ) => distance( a ) - distance( b ) )[ 0 ];
	function distance( normal ) {
		const middle = normal.map( ( value, i ) => value < 0 ? bounds.min[ i ] : value > 0 ? bounds.max[ i ] : ( bounds.min[ i ] + bounds.max[ i ] ) / 2 );
		return Math.min( ...path.slice( 1 ).map( ( b, index ) => {
			const a = path[ index ], delta = b.map( ( v, i ) => v - a[ i ] );
			const square = delta.reduce( ( sum, v ) => sum + v * v, 0 );
			const t = Math.max( 0, Math.min( 1, delta.reduce( ( sum, v, i ) => sum + v * ( middle[ i ] - a[ i ] ), 0 ) / square ) );
			return middle.reduce( ( sum, v, i ) => sum + ( v - a[ i ] - delta[ i ] * t ) ** 2, 0 );
		} ) );
	}
}

function turn( [ x, z ], quarter ) {
	return [ [ x, z ], [ z, -x ], [ -x, -z ], [ -z, x ] ][ quarter ];
}
