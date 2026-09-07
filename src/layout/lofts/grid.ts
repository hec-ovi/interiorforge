import type { WalkGrid } from "../../core/grid.js";
import { AGENT_RADIUS } from "../constants.js";
import { worldToUv, type Frame, type UvRect } from "../uv.js";

export function blockLoftSolids(grid: WalkGrid, solids: readonly UvRect[], frame: Frame): void {
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++){
    if(!grid.isWalkable(col,row))continue;
    const [u,v]=worldToUv(grid.center(col,row),frame);
    if(solids.some(r=>u>=r.u-AGENT_RADIUS && u<=r.u+r.lu+AGENT_RADIUS && v>=r.v-AGENT_RADIUS && v<=r.v+r.lv+AGENT_RADIUS))grid.set(col,row,false);
  }
}
