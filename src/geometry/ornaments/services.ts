import type { Vec3 } from "../../glb/mesh-builder.js";
import { plantedBay } from "./vegetation.js";
import type { Assembly } from "./assembly.js";

export function serviceRack(a: Assembly): void {
  const hw = a.w / 2, hd = a.d / 2, metal = a.material("metal"), frame = a.keys.door();
  const paper = a.material("interior-paper", "poor");
  a.box(frame, -hw, hw, -hd, hd, 0, .18);
  a.box(frame, -hw, hw, -hd, -hd + .09, a.h - .15, a.h);
  for (const x of [-hw + .04, hw - .04]) a.box(metal, x - .04, x + .04, -hd, hd, .18, a.h);
  if (a.item.kind === "room_divider") plantedBay(a, -hw + .25, .2, .75);
  for (let x = -hw + .25, bay = 0; x <= hw - .25 + 1e-9; x += .5, bay++) {
    const radius = a.rng.range(.022, .04), offset = a.rng.range(-.12, .12);
    const bend = a.rng.range(.5, a.h - .45), z = a.rng.range(-.10, -.04);
    const pipe = bay % 3 === 0 ? frame : metal;
    routedPipe(a, pipe, [[x, .20, z], [x, bend - .08, z], [x + offset, bend + .08, z], [x + offset, a.h - .17, z]], radius);
    for (const [px, y] of [[x, .31], [x + offset, a.h - .28]]) {
      a.tube(frame, [px!, y! - .045, z], [px!, y! + .045, z], radius + .011);
    }
    if (bay % 3 === 1) a.box(frame, x - .09, x + .09, -.17, -.025, bend - .11, bend + .09);
    const start: Vec3 = [x - .16, a.h - a.rng.range(.2, .45), .1];
    const end: Vec3 = [x + .12, a.h - a.rng.range(.3, .55), .14];
    hangingCable(a, frame, start, end, a.rng.range(.2, .65) * (Math.min(start[1], end[1]) - .3));
    for (let n = 0; n < 5; n++) {
      const cx = x + a.rng.range(-.1, .1), cz = a.rng.range(-.12, .12), y = a.rng.range(.183, .23);
      const angle = a.rng.range(-Math.PI, Math.PI), width = a.rng.range(.07, .14), depth = a.rng.range(.07, .14);
      const point = (u: number, v: number, rise: number): Vec3 => [cx + u * Math.cos(angle) - v * Math.sin(angle), y + rise, cz + u * Math.sin(angle) + v * Math.cos(angle)];
      a.quad(n % 3 === 0 ? frame : paper, [point(-width / 2, -depth / 2, 0), point(-width * .4, depth / 2, .035),
        point(width / 2, depth * .35, .012), point(width * .4, -depth / 2, .004)], true);
    }
  }
  hangingCable(a, frame, [-hw + .12, a.h - .25, .16], [hw - .12, .46, .12], .1);
}

function hangingCable(a: Assembly, material: string, start: Vec3, end: Vec3, sag: number): void {
  let previous = start;
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const next: Vec3 = [start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t - sag * Math.sin(Math.PI * t),
      start[2] + (end[2] - start[2]) * t + .012 * Math.sin(Math.PI * t * 2)];
    a.tube(material, previous, next, .008, 6);
    previous = next;
  }
}

function routedPipe(a: Assembly, material: string, points: Vec3[], radius: number): void {
  let previous = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!, corner = points[i]!, after = points[i + 1]!;
    const incoming = Math.hypot(...corner.map((value, axis) => value - before[axis]!));
    const outgoing = Math.hypot(...after.map((value, axis) => value - corner[axis]!));
    const reach = Math.min(.06, incoming / 3, outgoing / 3);
    const start = corner.map((value, axis) => value + (before[axis]! - value) * reach / incoming) as Vec3;
    const end = corner.map((value, axis) => value + (after[axis]! - value) * reach / outgoing) as Vec3;
    a.tube(material, previous, start, radius);
    previous = start;
    for (let step = 1; step <= 6; step++) {
      const t = step / 6;
      const next = start.map((value, axis) => value * (1 - t) ** 2 + 2 * corner[axis]! * t * (1 - t) + end[axis]! * t ** 2) as Vec3;
      a.tube(material, previous, next, radius);
      previous = next;
    }
  }
  a.tube(material, previous, points.at(-1)!, radius);
}
