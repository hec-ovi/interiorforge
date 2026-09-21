import { FINISH } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";
import type { Vector3 } from "../types.js";

interface Ring {
  y: number;
  rx: number;
  rz: number;
  z?: number;
  /** Two is an ellipse; larger powers round the corners of a rectangular section. */
  power?: number;
}

const unit = (v: Vector3): Vector3 => {
  const length = Math.hypot(...v) || 1;
  return v.map(n => n / length) as Vector3;
};
const minus = (a: Vector3, b: Vector3): Vector3 => a.map((n, i) => n - b[i]!) as Vector3;
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Closed ceramic profile: the rings travel up the outside, across the rim, then down
 *  the real bowl cavity. Smooth vertex normals retain highlights around the glaze. */
function vessel(k: Kit, slot: string, profile: Ring[], sides = 48): void {
  const point = (ring: Ring, angle: number): Vector3 => {
    const exponent = 2 / (ring.power ?? 2);
    const curve = (value: number) => Math.sign(value) * Math.abs(value) ** exponent;
    return [ring.rx * curve(Math.cos(angle)), ring.y, (ring.z ?? 0) + ring.rz * curve(Math.sin(angle))];
  };
  const rings = profile.map(ring => Array.from({ length: sides }, (_, side) => point(ring, side * 2 * Math.PI / sides)));
  const normals = rings.map((ring, i) => ring.map((at, j) => {
    const before = rings[(i + rings.length - 1) % rings.length]![j]!;
    const after = rings[(i + 1) % rings.length]![j]!;
    // Average the adjacent unit slopes, so a long bowl wall cannot flatten a tiny lip.
    const incoming = unit(minus(at, before)), outgoing = unit(minus(after, at));
    const along = incoming.map((n, axis) => n + outgoing[axis]!) as Vector3;
    const tangent = minus(ring[(j + 1) % sides]!, ring[(j + sides - 1) % sides]!);
    return unit(cross(along, tangent));
  }));
  for (let i = 0; i < rings.length; i++) {
    const next = (i + 1) % rings.length;
    for (let j = 0; j < sides; j++) {
      const end = (j + 1) % sides;
      k.mesh.addQuad(slot, [rings[i]![j]!, rings[next]![j]!, rings[next]![end]!, rings[i]![end]!]);
      const group = k.mesh.getGroup(slot)!;
      const smooth = [normals[i]![j]!, normals[next]![j]!, normals[next]![end]!, normals[i]![end]!].flat();
      for (let n = 0; n < 12; n++) group.normals[group.normals.length - 12 + n] = smooth[n]!;
    }
  }
}

/** Circular chrome pipe swept through its curved centreline. */
function pipe(k: Kit, path: Vector3[], radius: number): void {
  const sides = 12;
  const rings = path.map((point, i) => {
    const tangent = unit(minus(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(i - 1, 0)]!));
    const along: Vector3 = [1, 0, 0], across = unit(cross(along, tangent));
    return Array.from({ length: sides }, (_, j) => {
      const angle = j * 2 * Math.PI / sides;
      const normal = along.map((n, a) => n * Math.cos(angle) + across[a]! * Math.sin(angle)) as Vector3;
      return { at: point.map((n, a) => n + normal[a]! * radius) as Vector3, normal };
    });
  });
  for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    const corners = [rings[i]![j]!, rings[i + 1]![j]!, rings[i + 1]![next]!, rings[i]![next]!];
    k.mesh.addQuad(FINISH.chrome, corners.map(p => p.at) as [Vector3, Vector3, Vector3, Vector3]);
    const group = k.mesh.getGroup(FINISH.chrome)!;
    const normals = corners.flatMap(p => p.normal);
    for (let n = 0; n < 12; n++) group.normals[group.normals.length - 12 + n] = normals[n]!;
  }
}

/** Sanitary fixtures share the furniture convention: rear/tank/tap at -Z, user at +Z.
 *  Dimensions are the planner's 0.4 x 0.65 toilet and 0.5 x 0.45 basin envelopes. */
export const sanitaryRecipes: RecipeSet = (add) => {
  add("fit-toilet", k => {
    // A floor-standing skirt and an open bowl; the basin floor sits 15 cm below the seat.
    vessel(k, FINISH.ceramic, [
      { y: 0, rx: .004, rz: .004, z: -.025 },
      { y: 0, rx: .112, rz: .148, z: -.025 },
      { y: .015, rx: .123, rz: .158, z: -.025 },
      { y: .055, rx: .123, rz: .158, z: -.025 },
      { y: .13, rx: .121, rz: .17, z: -.005 },
      { y: .265, rx: .16, rz: .22, z: .035 },
      { y: .37, rx: .188, rz: .248, z: .062 },
      { y: .414, rx: .191, rz: .251, z: .064 },
      { y: .425, rx: .183, rz: .243, z: .064 },
      { y: .425, rx: .149, rz: .205, z: .06 },
      { y: .405, rx: .144, rz: .2, z: .06 },
      { y: .355, rx: .12, rz: .174, z: .043 },
      { y: .3, rx: .075, rz: .115, z: .024 },
      { y: .28, rx: .045, rz: .075, z: .008 },
      { y: .278, rx: .004, rz: .004, z: .008 },
    ]);
    // Rounded open seat, with a visible gap and rear hinges instead of a solid cap.
    vessel(k, FINISH.ceramic, [
      { y: .434, rx: .183, rz: .241, z: .064 },
      { y: .439, rx: .196, rz: .255, z: .064 },
      { y: .451, rx: .196, rz: .255, z: .064 },
      { y: .458, rx: .185, rz: .244, z: .064 },
      { y: .458, rx: .148, rz: .199, z: .064 },
      { y: .451, rx: .14, rz: .192, z: .064 },
      { y: .439, rx: .14, rz: .192, z: .064 },
      { y: .434, rx: .15, rz: .202, z: .064 },
    ]);
    for (const x of [-.09, .09]) k.cbox(FINISH.chrome, [x, .426, -.158], [.03, .014, .052]);
    // Cistern at the back, with a separate beveled lid and two flush buttons.
    vessel(k, FINISH.ceramic, [
      { y: .37, rx: .008, rz: .008, z: -.231 },
      { y: .37, rx: .16, rz: .078, z: -.231, power: 5 },
      { y: .39, rx: .175, rz: .09, z: -.231, power: 5 },
      { y: .71, rx: .175, rz: .09, z: -.231, power: 5 },
      { y: .726, rx: .163, rz: .079, z: -.231, power: 5 },
      { y: .726, rx: .008, rz: .008, z: -.231 },
    ]);
    vessel(k, FINISH.ceramic, [
      { y: .73, rx: .008, rz: .008, z: -.231 },
      { y: .73, rx: .176, rz: .091, z: -.231, power: 5 },
      { y: .736, rx: .18, rz: .094, z: -.231, power: 5 },
      { y: .747, rx: .171, rz: .085, z: -.231, power: 5 },
      { y: .747, rx: .008, rz: .008, z: -.231 },
    ]);
    for (const x of [-.022, .019]) k.cylinder(FINISH.chrome, [x, .747, -.226], x < 0 ? .023 : .016, .003, 24);
    // Water surface stays deep inside the trap and is distinct from a black plugged bowl.
    k.cylinder(FINISH.glass, [0, .282, .008], .044, .002, 32);
    for (const x of [-.095, .095]) k.cbox(FINISH.chrome, [x, .023, -.077], [.014, .012, .021]);
  });

  for (const [id, cabinet, trim, lit] of [
    ["fit-basin", FINISH.timber, FINISH.bronze, true],
    ["fit-basin-steel", FINISH.steel, FINISH.chrome, true],
    ["fit-basin-worn", FINISH.damagedSteel, FINISH.chrome, false],
  ] as const) add(id, k => {
    // Wall-hung vanity: the cabinet stops below the actual basin cavity.
    k.cbox(cabinet, [0, .39, -.015], [.472, .28, .405]);
    for (const x of [-.119, .119]) {
      k.cbox(cabinet, [x, .4, .19], [.232, .254, .02]);
      k.cbox(trim, [x, .612, .205], [.165, .013, .018]);
    }
    k.cbox(FINISH.black, [0, .657, .192], [.455, .008, .006]);
    // Outside, softened rim, sloping inner walls and low drain form a real open basin.
    vessel(k, FINISH.ceramic, [
      { y: .669, rx: .004, rz: .004, z: .022 },
      { y: .675, rx: .144, rz: .128, z: .022 },
      { y: .724, rx: .228, rz: .192, z: .008, power: 3 },
      { y: .823, rx: .249, rz: .224, power: 4 },
      { y: .843, rx: .25, rz: .225, power: 4 },
      { y: .85, rx: .241, rz: .216, power: 4 },
      { y: .85, rx: .208, rz: .164, z: .026, power: 2.8 },
      { y: .838, rx: .2, rz: .158, z: .026, power: 2.8 },
      { y: .785, rx: .177, rz: .144, z: .026, power: 2.5 },
      { y: .728, rx: .09, rz: .079, z: .026 },
      { y: .721, rx: .035, rz: .03, z: .026 },
      { y: .721, rx: .004, rz: .004, z: .026 },
    ]);
    k.cylinder(FINISH.chrome, [0, .722, .026], .024, .004, 32);
    k.cylinder(FINISH.black, [0, .726, .026], .005, .001, 12);
    // Back-wall overflow, a circular mixer and curved gooseneck with downward outlet.
    k.cbox(FINISH.chrome, [0, .799, -.124], [.037, .012, .005]);
    k.cylinder(FINISH.chrome, [0, .849, -.177], .026, .038, 24);
    const faucet: Vector3[] = [[0, .876, -.177], [0, .972, -.177]];
    for (let i = 1; i <= 8; i++) {
      const angle = i * Math.PI / 8;
      faucet.push([0, .972 + .05 * Math.sin(angle), -.127 - .05 * Math.cos(angle)]);
    }
    faucet.push([0, .956, -.077]);
    pipe(k, faucet, .011);
    k.cylinder(FINISH.black, [0, .954, -.077], .008, .002, 16);
    k.cbox(FINISH.chrome, [.037, .883, -.177], [.054, .012, .021]);
    // Framed mirror, keeping the established light position and furniture light record.
    k.cbox(trim, [0, 1.025, -.217], [.5, .675, .016]);
    k.cbox(FINISH.mirror, [0, 1.038, -.206], [.472, .648, .009]);
    if (lit) k.cbox(FINISH.lensWarm, [0, .971, -.165], [.4, .018, .03]);
  });
};
