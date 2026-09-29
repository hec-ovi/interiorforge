import { polygonArea, polygonBounds, type Point } from '../../core/geom.js';
import type { BlueprintFloor, InteriorRequest, RoomKind } from '../../core/types.js';
import type { CorePlan } from '../../layout/core-plan.js';
import type { FloorFrame, PlanRoom } from '../../layout/plan-types.js';
import type { ResidentialGround } from '../../layout/ground-program.js';
import { coreRectsOf } from '../../layout/pier-align.js';
import { partitionConflicts } from '../../layout/openings.js';
import { roomArea, roomCoversRect, sharedRoomEdges } from '../../layout/room-shape.js';
import { doorBetween, type IdGen } from '../../layout/rooms.js';
import { toWorldPolygon, uvRectCorners, worldToUv, type UvRect } from '../../layout/uv.js';

/** 3.5m allocation leaves more than3m between the two finished wall faces.
 * The four-metre arrival spine tolerates the shell's independent door centre. */
const PUBLIC = 3.5, ARRIVAL = 4, MAX_BAY = 9, MIN_BAY = 3.5;
interface Bay { rect: UvRect; band: 'front' | 'core' | 'rear' }
export interface DamagedGroundRoomSummary { room: string; role: string; kind: RoomKind; area: number }

/** Entry/corridor/service grammar adapts William Hare, No-Tell public circulation
 * and the captured street-service fronts. Community workrooms and retail are
 * declared programme adaptations, not claimed Hare/No-Tell private interiors. */
export function planDamagedGround(request: InteriorRequest, floor: BlueprintFloor, core: CorePlan,
  frame: FloorFrame, corridor: PlanRoom, plate: Point[], _outline: Point[], approaches: UvRect[], ids: IdGen): ResidentialGround | null {
  if (request.building.type !== 'residential' || request.building.tier !== 'poor') return null;
  const b = polygonBounds(plate), whole: UvRect = { u:b.x, v:b.z, lu:b.w, lv:b.d };
  if (b.w < 26 || b.d < 24 || Math.abs(polygonArea(plate)) < b.w * b.d * .98) return null;
  const entrance = floor.openings.find(opening => opening.kind === 'door' && opening.doorRole === 'main')
    ?? floor.openings.find(opening => opening.kind === 'door' || opening.kind === 'openFront');
  if (!entrance) return null;
  const a = worldToUv(floor.outline[entrance.edge]!, core.frame), z = worldToUv(floor.outline[(entrance.edge + 1) % floor.outline.length]!, core.frame);
  const length = Math.hypot(z[0]-a[0], z[1]-a[1]);
  if ((z[0]-a[0])/length < .95 || Math.abs((a[1]+z[1])/2-b.z) > 2) return null;
  const entryU = a[0] + (z[0]-a[0]) * (entrance.offset + entrance.width/2)/length;
  const center = Math.round(entryU*2)/2;
  const cross: UvRect = { u:b.x, v:core.vFace-PUBLIC, lu:b.w, lv:PUBLIC };
  const frontDepth = cross.v-b.z;
  if (frontDepth < 10) return null;
  // Leave a three-metre mail-bank bay beside the four-metre arrival spine,
  // including door approaches and the furnished wall lining on both sides.
  const hallWidth = 12;
  const hallDepth = Math.round(Math.max(7,Math.min(10,frontDepth*.45))*2)/2;
  const hall: UvRect = {u:center-hallWidth/2,v:b.z,lu:hallWidth,lv:hallDepth};
  const spine: UvRect = {u:center-ARRIVAL/2,v:b.z+hallDepth,lu:ARRIVAL,lv:cross.v-b.z-hallDepth};
  const cores = coreRectsOf(core), coreBack = Math.max(...cores.map(rect=>rect.v+rect.lv));
  const inside = (rect:UvRect)=>roomCoversRect({rect:whole,polygon:plate},rect);
  const conflict = (rect:UvRect)=>partitionConflicts({rooms:[{id:'ground-check',kind:'corridor',polygon:toWorldPolygon(uvRectCorners(rect),core.frame),doors:[]}]},
    floor,request.blueprint.facade,toWorldPolygon(plate,core.frame)).length>0;
  if (!inside(hall)||!inside(cross)||spine.lv<1||!inside(spine)
    || cores.some(rect=>overlap(hall,rect)||overlap(spine,rect)) || conflict(hall)||conflict(cross)||conflict(spine)) return null;

  // These free lanes are reserved before room subdivision; every row is entered
  // from a public cross aisle, and both sides of the stable shafts remain clear.
  const lanes: UvRect[] = [cross,spine];
  for(const u of [hall.u-PUBLIC,hall.u+hall.lu]) {
    const lane={u,v:b.z+MIN_BAY,lu:PUBLIC,lv:cross.v-b.z-MIN_BAY};
    if(inside(lane))lanes.push(lane);
  }
  for(const u of [core.u0-PUBLIC,core.u1]) {
    const lane={u,v:core.vFace,lu:PUBLIC,lv:b.z+b.d-core.vFace};
    if(inside(lane)) lanes.push(lane);
  }
  if(coreBack+PUBLIC<b.z+b.d) lanes.push({u:b.x,v:coreBack,lu:b.w,lv:PUBLIC});
  // An authored service/fire-escape entrance stays public along its actual side.
  if(floor.openings.some(opening=>opening.id!==entrance.id&&(opening.kind==='door'||opening.kind==='openFront')))
    lanes.push({u:b.x,v:b.z,lu:PUBLIC,lv:b.d});
  const rows: {low:number;high:number;band:Bay['band']}[]=[];
  const splitBand=(low:number,high:number,band:Bay['band'])=>{
    const depth=high-low;if(depth<MIN_BAY)return;
    const count=Math.max(1,Math.ceil((depth+PUBLIC)/(MAX_BAY+PUBLIC)));
    const available=depth-(count-1)*PUBLIC;
    let from=low;
    for(let i=0;i<count;i++) {
      const to=i===count-1?high:Math.round((low+available*(i+1)/count+PUBLIC*i)*2)/2;
      if(to-from>=MIN_BAY)rows.push({low:from,high:to,band});
      if(i<count-1)lanes.push({u:b.x,v:to,lu:b.w,lv:PUBLIC});
      from=to+PUBLIC;
    }
  };
  splitBand(b.z,cross.v,'front');
  splitBand(core.vFace,Math.min(coreBack,b.z+b.d),'core');
  splitBand(coreBack+PUBLIC,b.z+b.d,'rear');
  const columnCount=Math.max(1,Math.ceil(b.w/MAX_BAY));
  const cuts=Array.from({length:columnCount+1},(_,i)=>i===columnCount?b.x+b.w:Math.round((b.x+b.w*i/columnCount)*2)/2);
  const bays:Bay[]=[];
  const reserved=[...cores,...lanes,hall,...approaches];
  for(const row of rows)for(let i=0;i<cuts.length-1;i++) {
    const cell={u:cuts[i]!,v:row.low,lu:cuts[i+1]!-cuts[i]!,lv:row.high-row.low};
    let pieces=[cell];for(const cut of reserved)pieces=pieces.flatMap(piece=>subtract(piece,cut));
    for(const rect of pieces)if(rect.lu>=MIN_BAY&&rect.lv>=MIN_BAY&&rect.lu*rect.lv>=16&&inside(rect)&&!conflict(rect))bays.push({rect,band:row.band});
  }
  if(bays.length<5)return null;

  // Commit only a complete useful programme. The core face never moves; widening
  // toward the street updates the same rectangle already owned by facade-plan.
  const rooms:PlanRoom[]=[],occupied:UvRect[]=[];
  const add=(role:string,kind:RoomKind,rect:UvRect)=>{
    const room:PlanRoom={id:`${ids.room()}-damaged-${role}`,kind,rect:{...rect},polygon:uvRectCorners(rect),doors:[]};
    rooms.push(room);occupied.push({...rect});return room;
  };
  const reception=add('entry-mail-hall','reception',hall);
  const arrival=add('arrival-spine','corridor',spine);
  const distance=(rect:UvRect,at:UvRect)=>Math.hypot(Math.max(0,rect.u-at.u-at.lu,at.u-rect.u-rect.lu),
    Math.max(0,rect.v-at.v-at.lv,at.v-rect.v-rect.lv));
  const available=[...bays];
  const take=(role:string,kind:RoomKind,maxWidth:number,maxDepth:number,near:UvRect,minSide=MIN_BAY)=>{
    available.sort((x,y)=>distance(x.rect,near)-distance(y.rect,near)||x.rect.lu*x.rect.lv-y.rect.lu*y.rect.lv);
    const index=available.findIndex(bay=>bay.rect.lu>=minSide&&bay.rect.lv>=minSide);
    if(index<0)return;
    const [bay]=available.splice(index,1);
    if(!bay)return;
    const rect={...bay.rect,lu:Math.min(maxWidth,bay.rect.lu),lv:Math.min(maxDepth,bay.rect.lv)};
    add(role,kind,rect);
  };
  take('resident-waiting','lounge',8,6,hall,4.5);
  take('caretaker-office','office_private',5.5,5.5,hall);
  take('public-washroom','toilets',4.5,5,cross);
  take('parcel-store','storage',6,5,cross);
  take('shared-kitchen','kitchen',4.5,4.5,cross);
  for(let i=0;i<(b.w>=45?2:1);i++)take(`residents-room-${i+1}`,'meeting',8,7,cross,4.5);
  let front=0,work=0,service=0;
  available.sort((x,y)=>x.rect.v-y.rect.v||x.rect.u-y.rect.u);
  for(const bay of available) {
    if(bay.band==='front'&&front<4) { add(`corner-shop-${++front}`,'sales_floor',bay.rect);continue; }
    if(work<(b.w>=45?4:2)) { add(`resident-workroom-${++work}`,'office_private',
      {...bay.rect,lu:Math.min(6,bay.rect.lu),lv:Math.min(6,bay.rect.lv)});continue; }
    const maintenance=service%2===1;
    add(`${maintenance?'maintenance':'shared-storage'}-${++service}`,maintenance?'mechanical_room':'storage',bay.rect);
  }
  if(['resident-waiting','caretaker-office','public-washroom','parcel-store','shared-kitchen']
    .some(role=>!rooms.some(room=>room.id.endsWith(`-damaged-${role}`))))return null;
  Object.assign(corridor.rect,cross);corridor.polygon=uvRectCorners(cross);
  doorBetween(arrival,reception.id,reception,ids,4,3.2);
  doorBetween(arrival,corridor.id,corridor,ids,4,3.2);
  return{rooms,occupied};
}

/** The generic connector pass uses 1.8m doors. Major public ground-to-core
 * passages need their own full3.2m openings, while workshop/service room doors
 * retain normal usable widths. Internal passages are real doors, never outside portals. */
export function fitDamagedGroundPublicDoors(rooms:PlanRoom[]):void {
  const byId=new Map(rooms.map(room=>[room.id,room]));
  const publicRoom=(room:PlanRoom)=>room.kind==='corridor'||room.kind==='reception'||room.kind==='lounge';
  for(const owner of rooms)for(const door of owner.doors) {
    const target=byId.get(door.to);
    if(!target||door.openFront||!publicRoom(owner)||!publicRoom(target))continue;
    const edges=sharedRoomEdges(owner,target).sort((a,b)=>
      Number(b.edge===door.edge&&door.at>=b.lo&&door.at<=b.hi)-Number(a.edge===door.edge&&door.at>=a.lo&&door.at<=a.hi)
      ||(b.hi-b.lo)-(a.hi-a.lo));
    for(const edge of edges) {
      if(edge.hi-edge.lo<3.4)continue;
      const at=(edge.lo+edge.hi)/2,horizontal=edge.edge.startsWith('v'),inward=edge.edge.endsWith('0')?1:-1;
      const approach=(sign:number):UvRect=>horizontal
        ?{u:at-1.6,v:edge.c+(sign*inward>0?0:-1.25),lu:3.2,lv:1.25}
        :{u:edge.c+(sign*inward>0?0:-1.25),v:at-1.6,lu:1.25,lv:3.2};
      if(!roomCoversRect(owner,approach(1))||!roomCoversRect(target,approach(-1)))continue;
      door.width=3.2;door.leaves=4;door.clearDepth=0;door.edge=edge.edge;door.at=at;
      door.position=horizontal?[at,edge.c]:[edge.c,at];break;
    }
  }
}

export function damagedGroundSummary(rooms:readonly PlanRoom[]):DamagedGroundRoomSummary[] {
  return rooms.filter(room=>room.id.includes('-damaged-')).map(room=>({room:room.id,
    role:room.id.split('-damaged-')[1]!,kind:room.kind,area:Math.round(roomArea(room)*100)/100}));
}
function overlap(a:UvRect,b:UvRect):boolean {
  return Math.min(a.u+a.lu,b.u+b.lu)-Math.max(a.u,b.u)>1e-6&&Math.min(a.v+a.lv,b.v+b.lv)-Math.max(a.v,b.v)>1e-6;
}
function subtract(a:UvRect,b:UvRect):UvRect[] {
  if(!overlap(a,b))return[a];
  const x0=Math.max(a.u,b.u),x1=Math.min(a.u+a.lu,b.u+b.lu),z0=Math.max(a.v,b.v),z1=Math.min(a.v+a.lv,b.v+b.lv);
  const out:UvRect[]=[];
  if(z0>a.v)out.push({u:a.u,v:a.v,lu:a.lu,lv:z0-a.v});
  if(z1<a.v+a.lv)out.push({u:a.u,v:z1,lu:a.lu,lv:a.v+a.lv-z1});
  if(x0>a.u)out.push({u:a.u,v:z0,lu:x0-a.u,lv:z1-z0});
  if(x1<a.u+a.lu)out.push({u:x1,v:z0,lu:a.u+a.lu-x1,lv:z1-z0});
  return out;
}
