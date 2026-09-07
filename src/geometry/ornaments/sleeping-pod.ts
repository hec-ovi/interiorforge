import type { Assembly } from "./assembly.js";
import type { Vec3 } from "../../glb/mesh-builder.js";

/** Long-side entry, clipped upper corners and a full-depth insulated shell. */
export function sleepingPod(a: Assembly): void {
  const hw = a.w / 2, hd = a.d / 2;
  const shell = a.keys.panels.surface("wall"), lining = a.keys.panels.surface("ceiling");
  const metal = a.keys.door(), fabric = a.keys.key("fabric", "flat");
  const light = a.material("interior-led-cyan", "mid");
  a.box(metal, -hw, hw, -hd, hd, 0, .32);
  a.box(shell, -hw, hw, -hd, -hd + .09, .32, a.h);
  a.box(lining, -hw + .09, hw - .09, -hd + .09, -hd + .12, .38, a.h - .09);
  a.box(shell, -hw, hw, -hd + .09, hd, a.h - .1, a.h);
  for (const side of [-1, 1]) {
    const x = side * (hw - .055);
    a.box(shell, x - .055, x + .055, -hd + .09, hd, .32, a.h - .1);
    a.box(light, x - .012, x + .012, hd - .012, hd, .58, a.h - .38);
  }
  // Chamfer wedges join the side and ceiling around the open entrance.
  for (const side of [-1, 1]) {
    const x = side * (hw - .11), inner = x - side * .24;
    const profile: [Vec3, Vec3, Vec3] = [[x, a.h - .1, hd], [inner, a.h - .1, hd], [x, a.h - .34, hd]];
    const front: [Vec3, Vec3, Vec3] = side > 0 ? profile : [profile[0], profile[2], profile[1]];
    const rear = front.map(([px, py, pz]): Vec3 => [px, py, pz - .08]) as [Vec3, Vec3, Vec3];
    a.triangle(shell, front);
    a.triangle(lining, [rear[2], rear[1], rear[0]]);
    for (let edge = 0; edge < 3; edge++) {
      const next = (edge + 1) % 3;
      a.quad(shell, [front[edge]!, rear[edge]!, rear[next]!, front[next]!]);
    }
    a.tube(metal, [inner, a.h - .105, hd - .018], [x, a.h - .34, hd - .018], .018);
  }
  a.box(fabric, -hw + .14, hw - .14, -hd + .16, hd - .1, .32, .49);
  a.box(fabric, -hw + .23, -hw + .66, -hd + .25, hd - .24, .49, .59);
  a.box(a.keys.panels.surface("floor"), -hw + .83, hw - .2, -hd + .19, hd - .14, .49, .52);
  a.box(metal, hw - .53, hw - .12, -hd + .12, -hd + .34, .92, .97);
  a.box(a.material("ad-screen"), hw - .43, hw - .16, -hd + .12, -hd + .135, 1.08, 1.32);
  a.box(light, -hw + .3, hw - .3, -hd + .15, -hd + .17, a.h - .14, a.h - .12);
}
