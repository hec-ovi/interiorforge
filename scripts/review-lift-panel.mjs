import { sleep } from './review-browser.mjs';

export async function pressLiftPanel( evaluate, selector, action ) {
  const aimed = await evaluate( `const shaft=${selector};const panel=shaft.panels(game.body.feet,5).find(p=>p.action===${JSON.stringify( action )});if(!panel)return false;game.placePlayer(game.body.feet.clone(),panel.center);return true;` );
  if ( ! aimed ) throw new Error( `Lift panel has no ${action} target` );
  await sleep( 200 );
  const target = await evaluate( `const shaft=${selector},target=game.interactor.target;return{kind:target?.kind,shaft:target?.shaft?.id,action:target?.action,expected:shaft.id};` );
  if ( target.kind !== 'elevator' || target.shaft !== target.expected || target.action !== action ) throw new Error( `Lift ${action} aim resolved to ${JSON.stringify( target )}` );
  await evaluate( `return game.automation.press();` );
  await sleep( 150 );
  return evaluate( `const shaft=${selector};return{action:${JSON.stringify( action )},selected:shaft.stops[shaft.selected]?.floor,called:shaft.called,target:shaft.target,moving:shaft.moving};` );
}

export async function reviewLiftPanel( { evaluate, selector, shot, until, name } ) {
  const actions = [];
  for ( const action of [ 'up', 'down', 'cancel', 'close', 'open' ] ) {
    const result = await pressLiftPanel( evaluate, selector, action );
    if ( action === 'close' || action === 'open' ) {
      result.doors = await until( () => evaluate( `const shaft=${selector};return shaft.stops.find(s=>Math.abs(s.elevation-shaft.at)<.05)?.open;` ), amount => action === 'open' ? amount > .99 : amount < .01, 6000, `lift panel ${action}` );
    }
    actions.push( result );
  }
  await shot( `${name}-cab-controls` );
  const ok = actions[ 0 ].selected === actions[ 1 ].selected + 1
    && actions[ 2 ].selected === 0 && actions[ 3 ].doors < .01 && actions[ 4 ].doors > .99;
  return { ok, actions };
}
