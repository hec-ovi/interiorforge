import type { PanelRegion } from "./regions.js";
export interface FaceInsert { x: number; y: number; width: number; height: number; material: string }
export interface FacePart extends PanelRegion { insert?: FaceInsert }

/** Splits the receiving face at every insert edge without layering coincident surfaces. */
export function fitInsert(region: PanelRegion, insert?: FaceInsert): FacePart[] {
  if (!insert) return [region];
  const cuts = (a: number, length: number, b: number, size: number) =>
    [a, ...[b,b+size].filter(n=>n>a+1e-8&&n<a+length-1e-8),a+length].sort((x,y)=>x-y);
  const xs=cuts(region.x,region.width,insert.x,insert.width),ys=cuts(region.y,region.height,insert.y,insert.height);
  const out:FacePart[]=[];
  for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){
    const x0=xs[x]!,x1=xs[x+1]!,y0=ys[y]!,y1=ys[y+1]!;
    const inside=!region.joint&&x0>=insert.x-1e-8&&x1<=insert.x+insert.width+1e-8&&y0>=insert.y-1e-8&&y1<=insert.y+insert.height+1e-8;
    out.push({...region,x:x0,y:y0,width:x1-x0,height:y1-y0,...(inside?{insert}: {})});
  }
  return out;
}
