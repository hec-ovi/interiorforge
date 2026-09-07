import {expect,it} from "vitest";
import {fitLoft} from "./fit.js";
import {makeFrame} from "../uv.js";
import {makeFixture} from "../../blueprint/fixture.js";
import {planBuilding} from "../index.js";
import {buildNpcSupport,findPath} from "../../npc/index.js";
import {buildInteriorBands} from "../../geometry/index.js";

it("fits only inside the room with clear headroom and reserved support/stair space",()=>{
  const room={id:"room",kind:"studio_main" as const,rect:{u:0,v:0,lu:8,lv:12},doors:[]};
  const fit=fitLoft([room],[],makeFrame(27),1,2,3,6.2,9)!;
  expect(fit).not.toBeNull();expect(fit.plan.stair.rise).toBeLessThanOrEqual(.18);
  expect(fit.plan.stair.width-.2).toBeCloseTo(1.2);
  expect(fitLoft([room],[room.rect],makeFrame(0),1,2,3,6.2,9)).toBeNull();
  expect(fitLoft([room],[],makeFrame(0),1,2,3,5.2,7)).toBeNull();
});

it("exports a furnished upper platform reachable through public and private stairs",()=>{
  const {request}=makeFixture({seed:8,width:40,depth:32,floors:3,tier:"rich"});
  const plan=planBuilding(request,[{floor:0,kind:"lobby"},{floor:1,kind:"residence_studio",spans:2}]);
  const lower=plan.floors[1]!,upper=plan.floors[2]!;
  expect(lower.loft).toBeDefined();expect(upper.mezzanineOf).toBe(1);
  const npc=buildNpcSupport(plan,request),entrance=npc.anchors.find(a=>a.kind==="entrance")!,bed=npc.anchors.find(a=>a.floor===2&&a.kind==="bed")!;
  expect(bed).toBeDefined();
  const path=findPath(npc,{floor:entrance.floor,position:entrance.position},{floor:2,position:bed.position});
  expect(path?.filter(leg=>leg.kind==="ride")).toHaveLength(2);
  expect(npc.nav.connectors.filter(c=>c.id!==lower.loft!.id).every(c=>!c.floors.includes(2))).toBe(true);
  const wash=upper.lights.find(light=>light.id.endsWith("rear-wash"))!;
  expect(wash.direction).toEqual([0,1,0]);
  expect(wash.position[1]).toBeGreaterThan(lower.loft!.elevation+2.1);
  const bands=buildInteriorBands(plan,request);
  expect(bands.floorMeshes.get(2)!.isEmpty()).toBe(false);
},30000);
