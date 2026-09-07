import { describe, expect, it } from "vitest";
import { nineSlice } from "./nine-slice.js";
import { PanelMeshBuilder } from "./panel-mesh.js";
import { PanelPalette, styleForTier } from "./palette.js";
import { polygonArea, type Point } from "../../core/geom.js";

function surfaceArea(mesh: PanelMeshBuilder): number {
  let sum = 0;
  for (const material of mesh.materials()) {
    const { positions:p, indices:i } = mesh.getGroup(material)!;
    for(let n=0;n<i.length;n+=3){
      const a=i[n]!*3,b=i[n+1]!*3,c=i[n+2]!*3;
      const u=[p[b]!-p[a]!,p[b+1]!-p[a+1]!,p[b+2]!-p[a+2]!],v=[p[c]!-p[a]!,p[c+1]!-p[a+1]!,p[c+2]!-p[a+2]!];
      sum+=Math.hypot(u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!)/2;
    }
  }
  return sum;
}
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
      expect(surfaceArea(mesh)).toBeCloseTo(Math.abs(polygonArea(ring)),7);
      expect(mesh.materials()).toContain(palette.trim());
      for(const key of mesh.materials()){
        const group=mesh.getGroup(key)!;
        for(let n=1;n<group.positions.length;n+=3){expect(group.positions[n]).toBe(3);expect(group.normals[n]).toBe(1);}
        for(let n=0;n<group.uvs.length;n+=2){
          const i=n/2*3,x=group.positions[i]!,z=group.positions[i+2]!;
          expect(group.uvs[n]).toBeCloseTo(x*axes.cos+z*axes.sin,7);
          expect(group.uvs[n+1]).toBeCloseTo(-x*axes.sin+z*axes.cos,7);
        }
      }
    }
  });
  it("covers upright wall faces exactly with physical-scale UVs and maps all four tiers",()=>{
    const palette=new PanelPalette("cyberpunk","rich"),mesh=new PanelMeshBuilder(palette);
    mesh.addQuad(palette.surface("wall"),[[0,0,0],[0,3,0],[5.5,3,0],[5.5,0,0]]);
    expect(surfaceArea(mesh)).toBeCloseTo(16.5,8);
    expect(styleForTier("rich")).toBe("luxury");expect(styleForTier("high_rich")).toBe("luxury");
    expect(styleForTier("poor")).toBe("damaged");expect(styleForTier("mid")).toBe("capsule");
  });
});
