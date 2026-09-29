import { sleep } from './review-browser.mjs';

/** Exercise the published private doors through E and normal player movement. */
export async function reviewApartments( { evaluate, shot, manifest, parcel, until, limit = Infinity } ) {
  const occupied = manifest.floors.filter( floor => floor.apartmentEntrances?.length );
  const chosen = [ occupied.find( floor => floor.index === 1 ), occupied.find( floor => floor.index === 2 ), occupied.at( -1 ) ].filter( Boolean );
  const results = [];
  for ( const floor of [ ...new Map( chosen.map( floor => [ floor.index, floor ] ) ).values() ].slice( 0, limit ) ) {
    const entrance = floor.apartmentEntrances[ 0 ], inward = entrance.inward;
    const point = distance => ( { x: entrance.position[ 0 ] + inward[ 0 ] * distance,
      y: floor.elevation + .025, z: entrance.position[ 1 ] + inward[ 1 ] * distance } );
    const outside = point( -1.7 ), inside = point( 1.3 );
    const aim = { x: entrance.position[ 0 ], y: floor.elevation + 1.4, z: entrance.position[ 1 ] };
    const id = `${parcel}:${floor.index}:${entrance.id}`;
    const get = `game.stream.apartmentDoors.doors.find(d=>d.id===${JSON.stringify( id )})`;
    await evaluate( `game.body.beginCarry(${JSON.stringify( outside )});game.stream.requestFloor(${JSON.stringify( parcel )},${floor.index});` );
    await until( () => evaluate( `return game.stream.floorShown(${JSON.stringify( parcel )},${floor.index});` ), Boolean, 60000, `apartment floor ${floor.index}` );
    await evaluate( `game.body.endCarry(${JSON.stringify( outside )});game.placePlayer(${JSON.stringify( outside )},${JSON.stringify( aim )});` );
    await sleep( 600 );
    const numbers = await evaluate( `return game.stream.apartmentDoors.doors.filter(d=>d.parcelId===${JSON.stringify( parcel )}&&d.floor===${floor.index}).map(d=>({id:d.id,number:d.number,open:d.open}));` );
    const result = { floor: floor.index, number: entrance.number, numbers, id };
    await shot( `floor-${floor.index}-apartment-closed-number` );
    result.open = await toggle( true );
    await shot( `floor-${floor.index}-apartment-open` );
    result.enter = await walk( inside );
    await evaluate( `game.controller.lookAt(${JSON.stringify( aim )});game.controller.pitch=0;` );
    await sleep( 250 );
    result.closeInside = await toggle( false );
    await shot( `floor-${floor.index}-apartment-inside-closed` );
    result.reopen = await toggle( true );
    result.exit = await walk( outside );
    await evaluate( `game.controller.lookAt(${JSON.stringify( aim )});game.controller.pitch=0;` );
    await sleep( 250 );
    result.closeOutside = await toggle( false );
    result.ok = result.enter.reached && result.exit.reached && [ result.open, result.closeInside, result.reopen, result.closeOutside ].every( state => state.ok )
      && numbers.some( door => door.id === id && door.number === entrance.number );
    results.push( result );
    console.log( `Apartment ${entrance.number}: ${result.ok ? 'pass' : 'FAIL'}` );
    if ( ! result.ok ) break;

    async function toggle( open ) {
      const state = await evaluate( `const door=${get};return {found:Boolean(door),open:door?.open,wanted:door?.wanted,target:game.interactor.target?.door?.id??null};` );
      if ( ! state.found || state.target !== id ) return { ...state, ok: false };
      if ( Boolean( state.wanted > .5 ) !== open ) await evaluate( `return game.automation.press();` );
      return until( () => evaluate( `const door=${get};return {open:door.open,wanted:door.wanted,ok:${open ? 'door.open>.999' : 'door.open<.001'}};` ), result => result.ok, 5000, `apartment ${entrance.number} ${open ? 'opens' : 'closes'}` );
    }
    async function walk( target ) {
      return evaluate( `const target=${JSON.stringify( target )},started=performance.now();
        game.input.clear();game.input.runMultiplier=1;game.controller.turn=null;
        game.controller.lookAt(target);game.controller.pitch=0;
        try {while(Math.hypot(game.body.feet.x-target.x,game.body.feet.z-target.z)>.10&&performance.now()-started<6000){game.input.keys.add('KeyW');await new Promise(requestAnimationFrame);}}
        finally{game.input.keys.delete('KeyW');}
        return {reached:Math.hypot(game.body.feet.x-target.x,game.body.feet.z-target.z)<.12,feet:game.body.feet.toArray(),room:game.standing?.roomId,footing:game.automation.footing()};` );
    }
  }
  if ( ! results.length ) throw new Error( 'No published apartment entrances were available to inspect.' );
  return results;
}
