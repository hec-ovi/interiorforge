import type { Vec3 } from "../../glb/mesh-builder.js";
import { Assembly } from "../ornaments/assembly.js";

/** Faceted refuse sacks and loose paper inside a reserved ground footprint. */
export function debris(a: Assembly): void {
  const plastic = a.keys.door(), paper = a.material("interior-paper", "poor");
  for (const [cx, cz, radius, height] of [[-.14, -.08, .21, .51], [.18, .12, .15, .37]]) {
    const levels = [[.01, .68], [.12, 1], [.6, .95], [.86, .55], [1, .12]];
    const rings = levels.map(([y, r]) => Array.from({ length: 8 }, (_, i): Vec3 => {
      const angle = i * Math.PI / 4, radial = radius! * r! * a.rng.range(.89, 1);
      return [cx! + radial * Math.cos(angle), y! * height!, cz! + radial * Math.sin(angle)];
    }));
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < 8; i++) a.quad(plastic, [rings[j]![i]!, rings[j + 1]![i]!, rings[j + 1]![(i + 1) % 8]!, rings[j]![(i + 1) % 8]!]);
    }
    for (let i = 0; i < 8; i++) a.triangle(plastic, [[cx!, height!, cz!], rings.at(-1)![(i + 1) % 8]!, rings.at(-1)![i]!]);
    a.tube(plastic, [cx!, height! - .01, cz!], [cx! + .045, height! + .06, cz! - .03], .023, 6);
  }
  a.quad(paper, [[-.3, .012, .17], [-.2, .02, .35], [.03, .04, .28], [-.04, .012, .15]], true);
  a.quad(paper, [[.08, .012, -.35], [.13, .016, -.15], [.31, .06, -.11], [.27, .028, -.33]], true);
}
