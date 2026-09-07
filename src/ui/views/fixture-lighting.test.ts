import { expect,it } from "vitest";
import * as THREE from "three";
import { FixtureLighting } from "./fixture-lighting.js";
import type { LightFixture } from "../../core/types.js";

it("renders colored vertical lenses with shadowed directed sources and conserved flux",()=>{
  const fixture:LightFixture={id:"pod",kind:"strip",room:"bedroom",position:[2,1,3],length:.5,angleDeg:0,
    axis:[0,1,0],direction:[1,0,0],color:[.025,.72,1],intensity:42,colorTemperatureK:6500,
    range:2.5,beamDeg:170,diffuse:.95,facing:"down"};
  const renderer=new FixtureLighting();renderer.set([fixture],new THREE.Vector3(2,1,3));
  const light=renderer.group.children.find(item=>item instanceof THREE.SpotLight) as THREE.SpotLight;
  expect(light.color.toArray()).toEqual(fixture.color);
  expect(light.target.position.clone().sub(light.position).toArray()).toEqual([1,0,0]);
  expect(light.intensity*2*Math.PI*(1-Math.cos(light.angle))).toBeCloseTo(42);
  expect(light.castShadow).toBe(true);expect(light.decay).toBe(2);
  renderer.set([],new THREE.Vector3());expect(renderer.group.children).toHaveLength(0);
});
