import type { MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import type { Frame } from "../../layout/uv.js";
import type { MaterialKeys } from "../materials.js";
import { sleepingPod } from "./sleeping-pod.js";
import { Assembly } from "./assembly.js";
import { plantedCase } from "./cases.js";
import { hologramCase } from "./hologram.js";
import { serviceRack } from "./services.js";
import { validateEnvelope } from "./validate.js";
export function emitOrnament(mesh:MeshBuilder,keys:MaterialKeys,item:PlanFurniture,frame:Frame,elevation:number):void{
  validateEnvelope(item);
  const a=new Assembly(mesh,keys,item,frame,elevation),open=item.kind==="room_divider";
  if(item.kind === "sleeping_pod") { sleepingPod(a); return; }
  switch(keys.panels.style){
    case "luxury":plantedCase(a,open,!open&&a.rng.next()<.65);break;
    case "capsule":hologramCase(a,open);break;
    case "damaged":serviceRack(a);break;
  }
}
