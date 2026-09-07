import { describe, expect, it } from "vitest";
import { nineSlice } from "./nine-slice.js";
import { PanelMeshBuilder } from "./panel-mesh.js";
import { PanelPalette, styleForTier } from "./palette.js";
import { polygonArea, type Point } from "../../core/geom.js";
import type { Vec3 } from "../../glb/mesh-builder.js";

interface SurfaceCheck {
  project: (point:Vec3) => Vec3;
  depth: (u:number,v:number) => number;
  outward: Vec3;
  area: number;
  maxDepth: number;
  uv?: (u:number,v:number) => Point;
}

function assertSurface(mesh:PanelMeshBuilder,check:SurfaceCheck):void {
  let area=0,bevels=0;
  const seams=new Map<string,number>();
  for(const material of mesh.materials()){
    const {positions:p,normals:n,indices,uvs}=mesh.getGroup(material)!;
    const vertices:Vec3[]=[];
    for(let i=0;i<p.length;i+=3){
      const point:Vec3=[p[i]!,p[i+1]!,p[i+2]!];
      const [u,v,depth]=check.project(point);
      vertices.push(point);
      expect(depth).toBeGreaterThanOrEqual(-1e-9);
      expect(depth).toBeLessThanOrEqual(check.maxDepth+1e-9);
      expect(depth).toBeCloseTo(check.depth(u,v),8);
      const normal:Vec3=[n[i]!,n[i+1]!,n[i+2]!];
      expect(Math.hypot(...normal)).toBeCloseTo(1,8);
      const outward=normal.reduce((sum,value,j)=>sum+value*check.outward[j]!,0);
      expect(outward).toBeGreaterThan(0);
      expect(Math.min(Math.abs(outward-1),Math.abs(outward-Math.SQRT1_2))).toBeLessThan(1e-7);
      if(outward<.9)bevels++;
      const key=`${u.toFixed(8)},${v.toFixed(8)}`;
      if(seams.has(key))expect(depth).toBeCloseTo(seams.get(key)!,8);
      else seams.set(key,depth);
      if(check.uv){
        const uv=check.uv(u,v);
        expect(uvs[i/3*2]).toBeCloseTo(uv[0],8);
        expect(uvs[i/3*2+1]).toBeCloseTo(uv[1],8);
      }
    }
    for(let i=0;i<indices.length;i+=3){
      const ids=[indices[i]!,indices[i+1]!,indices[i+2]!];
      const [a,b,c]=ids.map(index=>vertices[index]!) as [Vec3,Vec3,Vec3];
      const ab=b.map((value,j)=>value-a[j]!),ac=c.map((value,j)=>value-a[j]!);
      const cross=[ab[1]!*ac[2]!-ab[2]!*ac[1]!,ab[2]!*ac[0]!-ab[0]!*ac[2]!,ab[0]!*ac[1]!-ab[1]!*ac[0]!];
      const length=Math.hypot(...cross);
      expect(length).toBeGreaterThan(1e-14);
      for(const id of ids)for(let j=0;j<3;j++)expect(n[id*3+j]).toBeCloseTo(cross[j]!/length,7);
      area+=cross.reduce((sum,value,j)=>sum+value*check.outward[j]!,0)/2;
      const center=a.map((value,j)=>(value+b[j]!+c[j]!)/3) as Vec3;
      const [u,v,depth]=check.project(center);
      // A triangle crossing a corner ridge gives the wrong interpolated depth here.
      expect(depth).toBeCloseTo(check.depth(u,v),8);
    }
  }
  expect(area).toBeCloseTo(check.area,7);
  if(check.maxDepth)expect(bevels).toBeGreaterThan(0);
}

const inset=(u:number,v:number,w:number,h:number,joint:number,depth:number):number=>
  Math.max(0,Math.min(depth,u-joint/2,w-joint/2-u,v-joint/2,h-joint/2-v));
const wrap=(value:number,pitch:number):number=>((value%pitch)+pitch)%pitch;

describe("fitted panel contract",()=>{
  it("keeps every corner half a metre and closes expanded and two-row assemblies",()=>{
    for(const [w,h] of [[1,1],[2,3],[5.2,2.8]]){
      const assembly=nineSlice(w!,h!);
      expect(assembly.pieces.reduce((s,p)=>s+p.width*p.height,0)).toBeCloseTo(w!*h!,8);
      for(const p of assembly.pieces.filter(p=>p.role.includes("-"))){expect(p.width).toBe(.5);expect(p.height).toBe(.5);}
      expect(assembly.pieces.every(p=>p.x>=0&&p.y>=0&&p.x+p.width<=w!+1e-8&&p.y+p.height<=h!+1e-8)).toBe(true);
    }
    expect(nineSlice(.4,2).pieces[0]!.role).toBe("field");
    expect(()=>nineSlice(0,2)).toThrow(RangeError);
  });
  it("retains irregular floor coverage and normals after rotation, in each style",()=>{
    const ring:Point[]=[[0,0],[5.3,0],[5.3,2.8],[3.2,2.8],[3.2,4.1],[0,4.1]];
    const angle=.47,axes={cos:Math.cos(angle),sin:Math.sin(angle)};
    const world=ring.map(([u,v]):Point=>[u*axes.cos-v*axes.sin,u*axes.sin+v*axes.cos]);
    for(const tier of ["rich","poor","mid"]){
      const palette=new PanelPalette("cyberpunk",tier),mesh=new PanelMeshBuilder(palette,axes);
      mesh.addHorizontalPolygon(palette.surface("floor"),world,3,"up");
      assertSurface(mesh,{project:([x,y,z])=>[x*axes.cos+z*axes.sin,-x*axes.sin+z*axes.cos,y-3],
        depth:()=>0,outward:[0,1,0],area:Math.abs(polygonArea(ring)),maxDepth:0,uv:(u,v)=>[u,v]});
      expect(mesh.materials()).toContain(palette.trim());
    }
  });
  it("closes rotated wall fields with 45-degree corners, fixed seams and physical UVs",()=>{
    const angle=.47,cos=Math.cos(angle),sin=Math.sin(angle),width=5.5,height=3;
    for(const tier of ["rich","poor","mid"]){
      const palette=new PanelPalette("cyberpunk",tier),mesh=new PanelMeshBuilder(palette);
      const point=(u:number,v:number):Vec3=>[4+u*cos,1.3+v,-2+u*sin];
      mesh.addQuad(palette.surface("wall"),[point(0,0),point(0,height),point(width,height),point(width,0)]);
      const [pitch]=palette.pitch("wall"),count=Math.max(1,Math.floor(width/pitch));
      assertSurface(mesh,{
        project:([x,y,z])=>[(x-4)*cos+(z+2)*sin,y-1.3,-(x-4)*sin+(z+2)*cos],
        depth:(u,v)=>{
          const bay=Math.min(count-1,Math.max(0,Math.floor(u/pitch)));
          return inset(u-bay*pitch,v,bay===count-1?width-bay*pitch:pitch,height,palette.data.joint,.012);
        },outward:[sin,0,-cos],area:width*height,maxDepth:.012,
        ...(tier==="rich"?{uv:(u:number,v:number):Point=>[u,v]}:{}),
      });
    }
    expect(styleForTier("rich")).toBe("luxury");expect(styleForTier("high_rich")).toBe("luxury");
    expect(styleForTier("poor")).toBe("damaged");expect(styleForTier("mid")).toBe("capsule");
  });
  it("clips recessed ceilings across corner ridges without gaps, folds or texture shifts",()=>{
    const ring:Point[]=[[.107,.203],[5.3,.203],[5.3,2.8],[3.217,2.8],[3.217,4.1],[.107,4.1]];
    const angle=.47,axes={cos:Math.cos(angle),sin:Math.sin(angle)},grid:Point=[.1,.2];
    const world=ring.map(([u,v]):Point=>[u*axes.cos-v*axes.sin,u*axes.sin+v*axes.cos]);
    for(const tier of ["rich","poor","mid"]){
      const palette=new PanelPalette("cyberpunk",tier),mesh=new PanelMeshBuilder(palette,axes,grid);
      mesh.addHorizontalPolygon(palette.surface("ceiling"),world,3,"down");
      const [px,pz]=palette.pitch("ceiling");
      assertSurface(mesh,{
        project:([x,y,z])=>[x*axes.cos+z*axes.sin,-x*axes.sin+z*axes.cos,y-3],
        depth:(u,v)=>inset(wrap(u-grid[0],px),wrap(v-grid[1],pz),px,pz,palette.data.joint,.008),
        outward:[0,-1,0],area:Math.abs(polygonArea(ring)),maxDepth:.008,
        uv:(u,v)=>[u-grid[0],v-grid[1]],
      });
    }
  });
});
