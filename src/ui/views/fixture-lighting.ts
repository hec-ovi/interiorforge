import * as THREE from "three";
import type { LightFixture } from "../../core/types.js";

/** Preview translation of published physical light sources. */
export class FixtureLighting {
  readonly group = new THREE.Group();
  set(fixtures: readonly LightFixture[], eye: THREE.Vector3): void {
    for (const child of this.group.children) if (child instanceof THREE.SpotLight) child.dispose();
    this.group.clear();
    const closest = [...fixtures].sort((a,b) => eye.distanceToSquared(new THREE.Vector3(...a.position))
      - eye.distanceToSquared(new THREE.Vector3(...b.position))).slice(0,24);
    for (const fixture of closest) {
      const angle = fixture.angleDeg * Math.PI / 180;
      const axis = new THREE.Vector3(...(fixture.axis ?? [Math.cos(angle),0,Math.sin(angle)]));
      const normal = new THREE.Vector3(...(fixture.direction ?? [0,fixture.facing === "up" ? 1 : -1,0]));
      const count = fixture.length > 1 ? Math.min(3,Math.ceil(fixture.length)) : 1;
      for (let i=0;i<count;i++) {
        const light = new THREE.SpotLight(fixture.color ? new THREE.Color(...fixture.color) : whiteAt(fixture.colorTemperatureK),
          1,fixture.range*1.5,Math.min(85,fixture.beamDeg/2)*Math.PI/180,fixture.diffuse,2);
        light.intensity = fixture.intensity/count/(2*Math.PI*(1-Math.cos(light.angle)));
        const offset = count === 1 ? 0 : ((i+.5)/count-.5)*fixture.length;
        light.position.set(...fixture.position).addScaledVector(axis,offset).addScaledVector(normal,.012);
        light.target.position.copy(light.position).add(normal);
        light.castShadow = true;
        light.shadow.mapSize.set(512,512);
        light.shadow.normalBias = .008;
        light.shadow.camera.near = .02;
        this.group.add(light,light.target);
      }
    }
  }
}

function whiteAt(kelvin: number): THREE.Color {
  const t = Math.max(1800,Math.min(8000,kelvin))/100;
  const r = t<=66 ? 255 : 329.7*(t-60)**-.1332;
  const g = t<=66 ? 99.47*Math.log(t)-161.12 : 288.12*(t-60)**-.0755;
  const b = t>=66 ? 255 : t<=19 ? 0 : 138.52*Math.log(t-10)-305.04;
  return new THREE.Color(...[r,g,b].map(v=>Math.max(0,Math.min(1,v/255))) as [number,number,number]).convertSRGBToLinear();
}
