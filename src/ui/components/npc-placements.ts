import type { NpcPlacement } from "../../core/types.js";
import { svgEl } from "./dom.js";

/** Inspection markers use the exported body envelope and approach, without inventing poses. */
export function npcPlacements(slots:readonly NpcPlacement[]):SVGElement {
  const group=svgEl("g",{class:"npc-placements"});
  for(const slot of slots){
    const color=slot.purpose==="story"?"#dd91ff":slot.purpose==="vendor"?"#ffd36b":"#91d9ff";
    const marker=svgEl("rect",{x:slot.position[0]-slot.radius,y:slot.position[1]-slot.radius,
      width:slot.radius*2,height:slot.radius*2,fill:"none",stroke:color,"stroke-width":.07,class:"npc-slot"});
    marker.setAttribute("data-npc-slot",slot.id);marker.setAttribute("data-purpose",slot.purpose);
    const title=svgEl("title",{});title.textContent=`${slot.purpose}: ${slot.id}`;marker.append(title);
    group.append(marker,svgEl("line",{x1:slot.position[0],y1:slot.position[1],x2:slot.approach[0],y2:slot.approach[1],
      stroke:color,"stroke-width":.05,"stroke-dasharray":".12 .08",class:"npc-approach"}));
  }
  return group;
}
