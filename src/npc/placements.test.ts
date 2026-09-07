import {expect,it} from "vitest";
import {makeFixture} from "../blueprint/fixture.js";
import {planBuilding} from "../layout/index.js";
import {buildNpcSupport,findPath} from "./index.js";
import {occupy} from "./placement-grid.js";
import {standingBodyClear} from "./placement-clearance.js";

it("exports stable vendor and story placeholders while their occupied bodies preserve routes",()=>{
  const {request}=makeFixture({seed:8,width:36,depth:28,floors:2,tier:"rich",type:"commerce"});
  const plan=planBuilding(request,[{floor:0,kind:"lobby"},{floor:1,kind:"retail"}]);
  const npc=buildNpcSupport(plan,request),slots=npc.placements!;
  expect(slots.some(slot=>slot.purpose==="story")).toBe(true);
  expect(slots.some(slot=>slot.purpose==="vendor")).toBe(true);
  const occupied=new Map(plan.navGrids);
  for(const slot of slots){
    expect(standingBodyClear(plan.floors.find(f=>f.floor===slot.floor)!,slot.position,slot.radius)).toBe(true);
    occupied.set(slot.floor,occupy(occupied.get(slot.floor)!,slot.position,slot.radius));
  }
  const nav={...npc.nav,floors:npc.nav.floors.map(f=>({...f,walkable:occupied.get(f.floor)!.toBase64()}))};
  const entrance=npc.anchors.find(a=>a.kind==="entrance")!;
  for(const slot of slots)expect(findPath({...npc,nav},{floor:entrance.floor,position:entrance.position},{floor:slot.floor,position:slot.approach})).not.toBeNull();
  expect(buildNpcSupport(plan,request).placements).toEqual(slots);
},30000);


it("keeps every loft story approach reachable with all standing bodies present",()=>{
  for(const tier of ["rich","poor","mid"] as const){
    const {request}=makeFixture({seed:8,width:40,depth:32,floors:3,tier,rotationDeg:27});
    const plan=planBuilding(request,[{floor:0,kind:"lobby"},{floor:1,kind:"residence_studio",spans:2}]);
    const npc=buildNpcSupport(plan,request),slots=npc.placements!,occupied=new Map(plan.navGrids);
    expect(slots.some(slot=>slot.floor===2&&slot.purpose==="story")).toBe(true);
    for(const slot of slots)occupied.set(slot.floor,occupy(occupied.get(slot.floor)!,slot.position,slot.radius));
    const nav={...npc.nav,floors:npc.nav.floors.map(f=>({...f,walkable:occupied.get(f.floor)!.toBase64()}))};
    const entrance=npc.anchors.find(a=>a.kind==="entrance")!;
    for(const slot of slots)expect(findPath({...npc,nav},{floor:entrance.floor,position:entrance.position},
      {floor:slot.floor,position:slot.approach}),`${tier}: ${slot.id}`).not.toBeNull();
  }
},30000);
