import type { Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS } from "../layout/constants.js";

export function occupy(grid:WalkGrid,position:Point,radius:number):WalkGrid {
  const copy=WalkGrid.fromBase64(grid.toBase64(),grid.origin,grid.cellSize,grid.cols,grid.rows);
  const reach=radius+AGENT_RADIUS;
  for(let row=0;row<copy.rows;row++)for(let col=0;col<copy.cols;col++){
    const p=copy.center(col,row);
    if(Math.hypot(p[0]-position[0],p[1]-position[1])<reach)copy.set(col,row,false);
  }
  return copy;
}
