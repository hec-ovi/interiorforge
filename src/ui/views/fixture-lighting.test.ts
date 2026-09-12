import { expect,it } from "vitest";
import * as THREE from "three";
import { FixtureLighting } from "./fixture-lighting.js";
import type { LightFixture } from "../../core/types.js";

it("renders colored vertical lenses with shadowed directed sources and conserved flux",()=>{
  const fixture:LightFixture={id:"pod",kind:"strip",room:"bedroom",position:[2,1,3],length:.5,angleDeg:0,
    axis:[0,1,0],direction:[1,0,0],color:[.025,.72,1],intensity:42,colorTemperatureK:6500,
    range:2.5,beamDeg:170,diffuse:.95,facing:"down"};
  const renderer=new FixtureLighting(32);renderer.set([fixture],new THREE.Vector3(2,1,3));
  const light=renderer.group.children.find(item=>item instanceof THREE.SpotLight) as THREE.SpotLight;
  expect(light.color.toArray()).toEqual(fixture.color);
  expect(light.target.position.clone().sub(light.position).toArray()).toEqual([1,0,0]);
  expect(light.intensity*2*Math.PI*(1-Math.cos(light.angle))).toBeCloseTo(42);
  expect(light.castShadow).toBe(true);expect(light.decay).toBe(2);
  renderer.set([],new THREE.Vector3());expect(renderer.group.children).toHaveLength(0);
});

it("fits nearest shadowed sources within the GPU budget and shares spare lens samples",()=>{
  const fixtures:LightFixture[]=Array.from({length:20},(_,index)=>({
    id:`strip-${index}`,kind:"strip",room:"room",position:[0,20-index,0],length:4,angleDeg:0,
    axis:[1,0,0],direction:[0,0,-1],intensity:120,colorTemperatureK:3000,
    range:5,beamDeg:150,diffuse:.9,facing:"down",
  }));
  for(const [maxTextures,quantity,expectedSources] of [[32,20,12],[16,20,4],[16,2,4],[12,20,0]] as const){
    const renderer=new FixtureLighting(maxTextures);
    const published=fixtures.slice(-quantity);
    renderer.set(published,new THREE.Vector3());
    const lights=renderer.group.children.filter((item):item is THREE.SpotLight=>item instanceof THREE.SpotLight);
    expect(lights).toHaveLength(expectedSources);
    expect(lights.length+12).toBeLessThanOrEqual(maxTextures);
    expect(lights.every(light=>light.castShadow)).toBe(true);
    const selected=Math.min(quantity,expectedSources);
    for(let y=1;y<=selected;y++){
      const samples=lights.filter(light=>light.position.y===y);
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.reduce((flux,light)=>flux+light.intensity*2*Math.PI*(1-Math.cos(light.angle)),0)).toBeCloseTo(120);
    }
    expect(lights.every(light=>light.position.y<=selected)).toBe(true);
  }
});
