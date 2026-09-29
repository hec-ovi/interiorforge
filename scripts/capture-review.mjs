/**
 * node interior/scripts/capture-review.mjs engine/out/reviews/<id> [--out <new-dir>] [--lifts]
 * Captures the real game in a disposable browser. --lifts rides each shaft to
 * every served floor through its normal selection/press/update paths. Placement
 * into a cab is explicit in the report; this is not an entrance traversal test.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Browser, browserPath, sleep } from './review-browser.mjs';
import { reviewApartments } from './review-apartments.mjs';
import { pressLiftPanel, reviewLiftPanel } from './review-lift-panel.mjs';

const { positionals, values } = parseArgs( { allowPositionals: true, options: {
  out: { type: 'string' }, browser: { type: 'string' },
  lifts: { type: 'boolean', default: false }, stairs: { type: 'boolean', default: false },
  'stairs-up-only': { type: 'boolean', default: false }, 'apartment-doors': { type: 'boolean', default: false },
  'lift-controls': { type: 'boolean', default: false }, quick: { type: 'boolean', default: false }, exposure: { type: 'string' }
} } );
if ( positionals.length !== 1 ) throw new Error( 'Name one generated review directory.' );
const directory = resolve( positionals[ 0 ] );
const review = JSON.parse( await readFile( join( directory, 'review.json' ), 'utf8' ) );
if ( review.buildings.length !== 1 ) throw new Error( 'Expected exactly one review building.' );
const building = review.buildings[ 0 ];
const out = resolve( values.out ?? join( directory, `captures-${Date.now()}` ) );
if ( existsSync( out ) ) throw new Error( `Capture output already exists: ${out}` );
await mkdir( out, { recursive: true } );
const url = new URL( review.playUrl );
for ( const [ key, value ] of Object.entries( { automation: '', crowd: '0', voice: 'off', backend: 'webgl', quality: url.searchParams.get( 'quality' ) ?? 'high', details: 'off', exposure: values.exposure ?? url.searchParams.get( 'exposure' ) ?? '0.04' } ) ) url.searchParams.set( key, value );
const report = { url: url.href, parcel: building.parcelId, screenshots: [], console: [], failedRequests: [], lifts: [], stairs: [] };
report.scope = values.quick ? 'Representative fresh-build check: entrance, first apartment, one lift trip, first stair storey, and indoor upward views.' : 'Full requested scenarios';
const browser = new Browser( browserPath( values.browser ) );
process.once( 'exit', () => browser.kill() );
try {
  await browser.started;
  const page = await browser.open();
  page.on( 'Fetch.requestPaused', async event => {
    await page.send( [ 'GET', 'HEAD' ].includes( event.request.method ) ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId: event.requestId, ...( [ 'GET', 'HEAD' ].includes( event.request.method ) ? {} : { errorReason: 'BlockedByClient' } )
    } );
  } );
  page.on( 'Runtime.exceptionThrown', event => report.console.push( event.exceptionDetails.exception?.description ?? event.exceptionDetails.text ) );
  page.on( 'Network.responseReceived', event => { if ( event.response.status >= 400 && ! event.response.url.endsWith( '/favicon.ico' ) ) report.failedRequests.push( { url: event.response.url, status: event.response.status } ); } );
  await page.send( 'Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false } );
  await page.navigate( url.href );
  let lastStep = '';
  await until( async () => {
    const state = await page.evaluate( `({probe:Boolean(window.urbe?.automation),draws:window.urbe?.stats?.drawCalls??0,hidden:document.querySelector('.hud-loading')?.hidden,step:document.querySelector('.hud-loading-step')?.textContent,error:document.querySelector('.hud-loading-error:not([hidden])')?.textContent,body:document.body.innerText.slice(0,700)})` );
    if ( JSON.stringify( state ) !== lastStep ) {
      lastStep = JSON.stringify( state ); console.log( `Loading: ${lastStep}` );
      await writeFile( join( out, 'loading.json' ), JSON.stringify( { state, console: report.console, failedRequests: report.failedRequests }, null, 2 ) );
      await page.screenshot( join( out, 'loading.png' ) );
    }
    if ( state.error ) throw new Error( state.error );
    return state.probe && state.draws && state.hidden;
  }, Boolean, 180000, 'game loading' );
  const evaluate = code => page.evaluate( `(async () => { const game = window.urbe; ${code} })()` );
  await evaluate( `if (!game.view.pause.element.hidden) game.view.pause.buttons.get('resume').click(); game.input.onLockChange(game.input.locked=true);` );
  const shot = async name => { await page.screenshot( join( out, `${name}.png` ) ); report.screenshots.push( `${name}.png` ); };
  await sleep( 500 );
  report.spawn = await evaluate( 'return game.automation.footing();' );
  await shot( 'spawn' );
  const { position, normal } = building.entrance;
  const street = position.map( ( value, i ) => value + normal[ i ] * 7 + ( i === 1 ? 0.05 : 0 ) );
  await evaluate( `return game.placePlayer(${JSON.stringify( xyz( street ) )}, ${JSON.stringify( xyz( [ position[ 0 ], position[ 1 ] + 3, position[ 2 ] ] ) )});` );
  await sleep( 3000 );
  await shot( 'exterior-entry' );
  const approach = building.entrance.outside.map( ( value, i ) => value + ( i === 1 ? .25 : 0 ) );
  await evaluate( `game.placePlayer(${JSON.stringify( xyz( approach ) )},${JSON.stringify( xyz( [ position[ 0 ], position[ 1 ] + 1.3, position[ 2 ] ] ) )});` );
  await sleep( 1000 );
  report.entryInteraction = await evaluate( 'return game.automation.press();' );
  await sleep( 1800 );
  await evaluate( `game.input.clear();game.input.runMultiplier=1;game.controller.turn=null;game.input.keys.add('KeyW');` );
  await sleep( 4200 );
  await evaluate( `game.input.keys.delete('KeyW');` );
  report.visit = await evaluate( `return {placed:game.standing?.parcelId===${JSON.stringify( building.parcelId )},room:game.standing?.parcelId??null,feet:game.body.feet.toArray(),footing:game.automation.footing()};` );
  await shot( 'ground-entry' );
  const manifest = JSON.parse( await readFile( join( directory, building.parcelId, 'interior/building.json' ), 'utf8' ) );
  const layouts = Object.fromEntries( await Promise.all( Object.entries( manifest.layouts ).map( async ( [ name, file ] ) => [ name,
    JSON.parse( await readFile( join( directory, building.parcelId, 'interior', file ), 'utf8' ) ) ] ) ) );
  const storeys = manifest.floors.filter( floor => layouts[ floor.layout ].floor.kind !== 'roof' );
  report.views = [];
  for ( const floor of values.quick ? [ storeys[ 0 ], storeys[ 1 ] ] : [ storeys[ 0 ], storeys[ 1 ], storeys.at( -1 ) ] ) {
    const layout = layouts[ floor.layout ];
    const stair = layout.floor.core.stairs[ 0 ];
    const floorSpot = xyz( [ stair.entry[ 0 ], floor.elevation + .025, stair.entry[ 1 ] ] );
    await evaluate( `game.body.beginCarry(${JSON.stringify( floorSpot )}); game.stream.requestFloor(${JSON.stringify( building.parcelId )},${floor.index});` );
    await until( () => evaluate( `return game.stream.floorShown(${JSON.stringify( building.parcelId )},${floor.index});` ), Boolean, 60000, `floor ${floor.index} streaming` );
    await evaluate( `game.body.endCarry(${JSON.stringify( floorSpot )});` );
    let rooms = floor.index === 0
      ? layout.floor.rooms.filter( room => ! [ 'corridor', 'elevator_lobby', 'concourse' ].includes( room.kind ) )
      : [ 'living', 'bedroom', 'kitchen', 'bathroom', 'lounge' ].map( kind => layout.floor.rooms.find( room => room.kind === kind ) ).filter( Boolean );
    if ( values.quick && floor.index === 0 ) rooms = rooms.filter( room => [ 'reception', 'lounge' ].includes( room.kind ) );
    for ( const room of rooms ) {
      const view = roomView( layout, room );
      if ( ! view ) continue;
      await evaluate( `game.placePlayer(${JSON.stringify( xyz( [ view.at[ 0 ], floor.elevation + .025, view.at[ 1 ] ] ) )},${JSON.stringify( xyz( [ view.aim[ 0 ], floor.elevation + 1.4, view.aim[ 1 ] ] ) )});` );
      await sleep( 900 );
      report.views.push( { floor: floor.index, room: room.id, ...view, footing: await evaluate( 'return game.automation.footing();' ) } );
      const duplicate = rooms.filter( other => other.kind === room.kind ).length > 1;
      await shot( `floor-${floor.index}-${room.kind}${duplicate ? `-${room.id}` : ''}` );
      const entrance = room.kind === 'reception' && room.doors.find( door => door.to === 'outside' );
      if ( entrance ) {
        const waiting = roomView( layout, room, 8 );
        await evaluate( `game.placePlayer(${JSON.stringify( xyz( [ waiting.at[ 0 ], floor.elevation + .025, waiting.at[ 1 ] ] ) )},${JSON.stringify( xyz( [ entrance.position[ 0 ], floor.elevation + 1.45, entrance.position[ 1 ] ] ) )});` );
        await sleep( 900 );
        await shot( `floor-${floor.index}-waiting-bays` );
      }
    }
    await evaluate( `game.placePlayer(${JSON.stringify( xyz( [ stair.entry[ 0 ], floor.elevation + .025, stair.entry[ 1 ] ] ) )},${JSON.stringify( xyz( [ stair.rect.x + stair.rect.w / 2, floor.elevation + 1.5, stair.rect.z + stair.rect.d / 2 ] ) )});` );
    await sleep( 900 );
    await shot( `floor-${floor.index}-stairs` );
    if ( values.quick ) {
      const flight = layout.placements.find( p => p.connector === stair.id && p.module?.startsWith( 'stair-flight-' ) );
      const local = ( x, z ) => { x *= flight.scale[ 0 ]; z *= flight.scale[ 2 ]; const c = Math.cos( flight.rotationY ), s = Math.sin( flight.rotationY ); return [ flight.position[ 0 ] + x*c+z*s, flight.position[ 2 ]-x*s+z*c ]; };
      const at = local( .725, -.15 ), aim = local( .9, 2 );
      await evaluate( `game.placePlayer(${JSON.stringify( xyz( [ at[ 0 ], floor.elevation + .025, at[ 1 ] ] ) )},${JSON.stringify( xyz( [ aim[ 0 ], floor.elevation + 7, aim[ 1 ] ] ) )});` );
      await sleep( 500 );
      ( report.enclosures ??= [] ).push( await evaluate( `return {floor:${floor.index},room:game.standing?.roomId,indoors:game.indoors,rainVisible:game.rain?.mesh.visible};` ) );
      await shot( `floor-${floor.index}-stairs-upward` );
    }
  }
  if ( values[ 'apartment-doors' ] ) report.apartments = await reviewApartments( { evaluate, shot, manifest, parcel: building.parcelId, until, limit: values.quick ? 1 : Infinity } );
  const shafts = await evaluate( `return (game.elevators.byBuilding.get(${JSON.stringify( building.parcelId )})??[]).map(s=>({id:s.id,centre:s.centre,stops:s.stops.map(t=>({floor:t.floor,elevation:t.elevation,leaves:t.leaves.length})),car:Boolean(s.car)}));` );
  report.shafts = shafts;
  report.stats = await evaluate( 'return { ...game.stats };' );
  if ( values.lifts && ! shafts.length ) throw new Error( 'No runtime elevator shafts were loaded for the review building.' );
  if ( values.lifts ) for ( const shaft of values.quick ? shafts.slice( 0, 1 ) : shafts ) {
    const selector = `game.elevators.shafts.find(s=>s.id===${JSON.stringify( shaft.id )})`;
    for ( const stop of values.quick ? shaft.stops.filter( stop => stop.floor === 1 ) : shaft.stops ) {
      await evaluate( `const s=${selector}; game.placePlayer({x:s.centre.x,y:s.at+.025,z:s.centre.z},{x:s.centre.x+.5,y:s.at+1.5,z:s.centre.z}); s.select(s.stops.findIndex(t=>t.floor===${stop.floor})-s.selected);` );
      if ( values[ 'lift-controls' ] ) await pressLiftPanel( evaluate, selector, 'go' );
      else await evaluate( `const s=${selector};s.press({inside:true});` );
      const arrival = await until( () => evaluate( `const s=${selector}; return {floor:${stop.floor},at:s.at,target:s.target,moving:s.moving,ready:s.ready,car:Boolean(s.car),floorReady:s.floorReady,carried:game.body.carried,feet:game.body.feet.toArray(),doors:s.stopAt(${stop.floor})?.open,leaves:s.stopAt(${stop.floor})?.leaves.length,footing:game.automation.footing()};` ),
        state => ! state.moving && state.ready && state.floorReady && state.doors > 0.99 && ! state.carried, 60000, `lift ${shaft.id} to ${stop.floor}` );
      arrival.ok = Math.abs( arrival.feet[ 1 ] - stop.elevation ) < 0.1 && arrival.leaves === 2 && arrival.car;
      arrival.enclosure = await evaluate( `return {room:game.standing?.roomId,indoors:game.indoors,rainVisible:game.rain?.mesh.visible};` );
      if ( values.quick ) await shot( 'lift-cab-arrival-controls' );
      if ( values[ 'lift-controls' ] && stop.floor === 0 ) {
        arrival.controls = await reviewLiftPanel( { evaluate, selector, shot, until, name: shaft.id.replace( /[^\w-]/g, '_' ) } );
        arrival.ok &&= arrival.controls.ok;
      }
      arrival.exit = await evaluate( `
        const s=${selector}, stop=s.stopAt(${stop.floor}), doorway=stop.pivot?.position;
        if(!doorway)return {ok:false,reason:'no landing doorway'};
        const dx=doorway.x-s.centre.x,dz=doorway.z-s.centre.z,length=Math.hypot(dx,dz),target={x:doorway.x+dx/length*.8,y:stop.elevation+1.3,z:doorway.z+dz/length*.8};
        const started=performance.now();game.input.clear();game.input.runMultiplier=1;game.controller.turn=null;game.controller.lookAt(target);game.controller.pitch=0;
        try {while(Math.hypot(game.body.feet.x-target.x,game.body.feet.z-target.z)>.16 && performance.now()-started<6000){game.input.keys.add('KeyW');await new Promise(requestAnimationFrame);}}
        finally{game.input.keys.delete('KeyW');}
        return {ok:!s.holds(game.body.feet)&&Math.abs(game.body.feet.y-stop.elevation)<.1,feet:game.body.feet.toArray(),footing:game.automation.footing()};` );
      arrival.ok &&= arrival.exit.ok;
      report.lifts.push( { shaft: shaft.id, ...arrival } );
      console.log( `Lift ${shaft.id}: floor ${stop.floor} ${arrival.ok ? 'pass' : 'FAIL'}` );
      if ( stop.floor === 0 || stop === shaft.stops.at( -1 ) ) await shot( `${shaft.id.replace( /[^\w-]/g, '_' )}-floor-${stop.floor}` );
    }
  }
  if ( values.stairs ) {
    for ( const stair of layouts[ manifest.floors[ 0 ].layout ].floor.core.stairs.slice( 0, values.quick ? 1 : undefined ) ) {
      const sections = stairRoute( manifest, layouts, stair.id ).slice( 0, values.quick ? 1 : undefined );
      const start = xyz( sections[ 0 ].points[ 0 ] ); start.y += .025;
      await evaluate( `game.body.beginCarry(${JSON.stringify( start )});game.stream.requestFloor(${JSON.stringify( building.parcelId )},0);` );
      await until( () => evaluate( `return game.stream.floorShown(${JSON.stringify( building.parcelId )},0);` ), Boolean, 60000, 'stair ground floor' );
      await evaluate( `game.body.endCarry(${JSON.stringify( start )});` );
      for ( const direction of values[ 'stairs-up-only' ] ? [ 'up' ] : [ 'up', 'down' ] ) for ( const section of direction === 'up' ? sections : [ ...sections ].reverse() ) {
        const points = direction === 'up' ? section.points : [ ...section.points ].reverse();
        const result = await evaluate( `
          const points=${JSON.stringify( points )}, started=performance.now();let reached=0;
          game.input.clear();game.input.runMultiplier=1;game.controller.turn=null;
          const trail=[];
          const frame=()=>new Promise(requestAnimationFrame);let failure=null;
          try {
            for(const target of points) {
              let attempt=performance.now(),progressAt=attempt,best=Infinity;
              for(;;) {
                const feet=game.body.feet, distance=Math.hypot(target[0]-feet.x,target[2]-feet.z);
                if(distance<.055)break;
                if(distance<best-.01){best=distance;progressAt=performance.now();}
                if(performance.now()-progressAt>6000||performance.now()-attempt>45000){failure={target,feet:feet.toArray(),reason:'no forward progress or overall waypoint limit',trail};break;}
                game.controller.lookAt({x:target[0],y:target[1]+1.3,z:target[2]});game.controller.pitch=0;
                if(game.interactor.target?.kind==='door' && game.interactor.target.door.wanted<.5)game.pressAction('interact');
                game.input.keys.add('KeyW');await frame();
                trail.push({feet:game.body.feet.toArray(),keys:[...game.input.keys],running:game.input.running,runMultiplier:game.input.runMultiplier,speed:game.controller.speed,frameMs:game.stats.frameMs,carried:game.body.carried});if(trail.length>10)trail.shift();
              }
              game.input.keys.delete('KeyW');
              if(failure)break;
              await frame();await frame();
              if(Math.abs(game.body.feet.y-target[1])>.28){failure={target,feet:game.body.feet.toArray(),reason:'wrong floor height'};break;}
              reached++;
            }
          }finally{game.input.keys.delete('KeyW');}
          return {ok:!failure,reached,total:points.length,failure,feet:game.body.feet.toArray(),seconds:(performance.now()-started)/1000};` );
        await sleep( 250 );
        result.enclosure = await evaluate( `return {room:game.standing?.roomId??null,indoors:game.indoors,rainVisible:game.rain?.mesh.visible};` );
        const roofAccess = layouts[ storeys.at( -1 ).layout ].npc.nav.roofAccess;
        if ( section.floor === storeys.at( -1 ).index && roofAccess?.stair === stair.id ) {
          result.roofDoor = await evaluate( `const door=game.interactor.doors.find(d=>d.parcelId===${JSON.stringify( building.parcelId )}&&d.role==='roof');return door?{floor:door.floor,open:door.open,wanted:door.wanted,shown:game.stream.floorShown(door.parcelId,door.floor)}:null;` );
          if ( result.ok && direction === 'up' ) await shot( 'roof-exit-walked' );
          if ( result.ok && direction === 'down' ) await shot( 'roof-return-top-landing' );
        }
        report.stairs.push( { stair: stair.id, direction, floor: section.floor, ...result } );
        console.log( `Stair ${stair.id} ${direction} floor ${section.floor}: ${result.ok ? 'pass' : JSON.stringify( result.failure )}` );
        await writeFile( join( out, 'stairs-progress.json' ), JSON.stringify( report.stairs, null, 2 ) );
        if ( ! result.ok ) { await shot( `${stair.id}-${direction}-${section.floor}-blocked` ); throw new Error( `Stair walk failed: ${stair.id} ${direction} floor ${section.floor}` ); }
      }
    }
  }
  report.complete = true;
  if ( ! report.visit.placed || report.failedRequests.length || report.lifts.some( item => ! item.ok ) || report.apartments?.some( item => ! item.ok ) ) process.exitCode = 1;
} catch ( error ) {
  report.error = error.stack;
  process.exitCode = 1;
  await browser.page?.screenshot( join( out, 'failed.png' ) ).catch( () => {} );
} finally {
  await writeFile( join( out, 'report.json' ), JSON.stringify( report, null, 2 ) + '\n' );
  await browser.close();
  console.log( `Review captures: ${out}` );
}

function xyz( point ) { return { x: point[ 0 ], y: point[ 1 ], z: point[ 2 ] }; }
function stairRoute( manifest, layouts, stairId ) {
  return manifest.floors.filter( floor => layouts[ floor.layout ].floor.kind !== 'roof' ).map( ( floor, index ) => {
    const layout = layouts[ floor.layout ], stair = layout.floor.core.stairs.find( stair => stair.id === stairId );
    const header = layout.placements.filter( p => p.module?.startsWith( 'door-header' ) ).sort( ( a, b ) =>
      Math.hypot( a.position[ 0 ] - stair.entry[ 0 ], a.position[ 2 ] - stair.entry[ 1 ] ) - Math.hypot( b.position[ 0 ] - stair.entry[ 0 ], b.position[ 2 ] - stair.entry[ 1 ] ) )[ 0 ];
    const threshold = [ header.position[ 0 ], floor.elevation, header.position[ 2 ] ];
    const entry = [ stair.entry[ 0 ], floor.elevation, stair.entry[ 1 ] ];
    const points = index ? [ threshold, entry, threshold ] : [ entry, threshold ];
    const flights = layout.placements.filter( p => p.connector === stairId && p.module?.startsWith( 'stair-flight-' ) ).sort( ( a, b ) => a.position[ 1 ] - b.position[ 1 ] );
    for ( const flight of flights ) {
      const count = Number( flight.module.split( '-' ).at( -1 ) );
      const point = ( x, y, z ) => { x *= flight.scale[ 0 ]; y *= flight.scale[ 1 ]; z *= flight.scale[ 2 ]; const c = Math.cos( flight.rotationY ), s = Math.sin( flight.rotationY ); return [ x*c+z*s+flight.position[ 0 ], y+floor.elevation+flight.position[ 1 ], -x*s+z*c+flight.position[ 2 ] ]; };
      points.push( point( .725, 0, -.55 ) );
      // Continuous W movement crosses every physical tread between these ends;
      // landings and floor heights are checked separately in both directions.
      points.push( point( .725, count*.17, count*.28+.55 ) );
    }
    const roof = layout.npc.nav.roofAccess;
    if ( roof?.stair === stairId ) {
      const { position, normal } = roof.door, y = floor.elevation + roof.elevation;
      points.push( [ position[ 0 ] - normal[ 0 ]*.45, y, position[ 1 ] - normal[ 1 ]*.45 ], [ position[ 0 ], y, position[ 1 ] ], [ roof.entry[ 0 ], y, roof.entry[ 1 ] ] );
    }
    return { floor: floor.index, points };
  } );
}
function roomView( layout, room, inset = room.kind === 'reception' ? 3 : 1.2 ) {
  const centre = room.polygon[ 0 ].map( ( _, axis ) => room.polygon.reduce( ( sum, point ) => sum + point[ axis ], 0 ) / room.polygon.length );
  const door = room.doors.find( door => door.to === 'outside' ) ?? room.doors[ 0 ];
  const from = door?.position ?? room.polygon[ 0 ];
  const length = Math.hypot( centre[ 0 ] - from[ 0 ], centre[ 1 ] - from[ 1 ] ) || 1;
  const desired = from.map( ( value, axis ) => value + ( centre[ axis ] - value ) / length * inset );
  const grid = layout.npc.nav.floors[ 0 ], bits = Buffer.from( grid.walkable, 'base64' ), candidates = [];
  for ( let index = 0; index < grid.cols * grid.rows; index++ ) {
    if ( ! ( bits[ index >> 3 ] & ( 1 << ( index & 7 ) ) ) ) continue;
    const point = [ grid.origin[ 0 ] + ( index % grid.cols + .5 ) * layout.npc.nav.cellSize, grid.origin[ 1 ] + ( Math.floor( index / grid.cols ) + .5 ) * layout.npc.nav.cellSize ];
    if ( inside( point, room.polygon ) && ! room.holes?.some( ring => inside( point, ring ) ) ) candidates.push( point );
  }
  candidates.sort( ( a, b ) => Math.hypot( a[ 0 ] - desired[ 0 ], a[ 1 ] - desired[ 1 ] ) - Math.hypot( b[ 0 ] - desired[ 0 ], b[ 1 ] - desired[ 1 ] ) );
  return candidates.length ? { at: candidates[ 0 ], aim: centre } : null;
}
function inside( [ x, z ], ring ) {
  let result = false;
  for ( let i = 0, j = ring.length - 1; i < ring.length; j = i++ ) {
    const [ ax, az ] = ring[ i ], [ bx, bz ] = ring[ j ];
    if ( ( az > z ) !== ( bz > z ) && x < ( bx - ax ) * ( z - az ) / ( bz - az ) + ax ) result = ! result;
  }
  return result;
}
async function until( read, accepts, milliseconds, label ) {
  const started = Date.now();
  do { const value = await read(); if ( accepts( value ) ) return value; await sleep( 300 ); } while ( Date.now() - started < milliseconds );
  throw new Error( `Timed out: ${label}` );
}
