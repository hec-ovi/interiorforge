import { MeshBuilder, type UvMode, type UvScale, type Vec3, type BoxFace } from "../glb/mesh-builder.js";
import type { Point } from "../core/geom.js";
import { triangulate } from "../core/triangulate.js";
import { tube, turned } from "../styles/luxury/model-geometry.js";
import type { Vector3 } from "./types.js";

/** How a material wants its map laid on a face. */
export type Alignment = (slot: string) => "tile" | "exact";

const TILED: Alignment = () => "tile";

/** One authored module: geometry in metres, XZ centred where the placement table puts it,
 *  Y up from the surface it stands on. One UV convention: a tiled material wears tile-unit
 *  UVs (one unit per map repeat, at its published metre size) and an exact material wears
 *  its map once over the face. `uv` overrides that only where a face wants the other. */
export class Kit {
  readonly mesh: MeshBuilder;

  constructor(tile: UvScale, private readonly alignment: Alignment = TILED) {
    this.mesh = new MeshBuilder(undefined, null, tile);
  }

  /** The convention for this slot, unless the face asked for the other one. */
  private mode(slot: string, uv?: UvMode): UvMode {
    return uv ?? (this.alignment(slot) === "exact" ? "unit" : "world");
  }

  /** Box from its minimum corner. */
  box(slot: string, [x, y, z]: Vector3, [w, h, d]: Vector3, uv?: UvMode, faces?: readonly BoxFace[]): void {
    this.mesh.addBox(slot, { x, z, w, d }, y, y + h, faces, this.mode(slot, uv));
  }

  /** Box centred in XZ, standing on y. */
  cbox(slot: string, [cx, y, cz]: Vector3, [w, h, d]: Vector3, uv?: UvMode, faces?: readonly BoxFace[]): void {
    this.box(slot, [cx - w / 2, y, cz - d / 2], [w, h, d], uv, faces);
  }

  /** Upright cylinder around (cx, cz): smooth sides (one normal per ring vertex) under flat
   *  caps, so a round object reads round at any side count. Sixteen sides by default. */
  cylinder(slot: string, [cx, y, cz]: Vector3, radius: number, height: number, sides = 16, uv?: UvMode): void {
    const corners: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      corners.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
    }
    const unitUv = this.mode(slot, uv) === "unit", positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const around = 2 * Math.PI * radius;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [yy, v] of [[y, 0], [y + height, 1]] as const) {
        positions.push(cx + c * radius, yy, cz + s * radius);
        normals.push(c, 0, s);
        uvs.push(unitUv ? 1 - i / sides : around * (1 - i / sides), unitUv ? 1 - v : v * height);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = i * 2, b = a + 2;
      // The side quad as a prism draws it: bottom a, top a, top b, bottom b.
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
    this.mesh.addSurface(slot, { positions, normals, uvs, indices });
    this.mesh.addHorizontalPolygon(slot, corners, y + height, "up", this.mode(slot, uv));
    this.mesh.addHorizontalPolygon(slot, corners, y, "down", this.mode(slot, uv));
  }

  /** Box from its minimum corner with every edge rounded to `radius` (two facets per quarter
   *  round, normals of the true round, so edges catch light like a machined or moulded
   *  part). 108 triangles; a radius under a millimetre falls back to a plain box. */
  bevelBox(slot: string, [x, y, z]: Vector3, [w, h, d]: Vector3, radius = .004, uv?: UvMode): void {
    const half: Vec3 = [w / 2, h / 2, d / 2], centre: Vec3 = [x + w / 2, y + h / 2, z + d / 2];
    const r = Math.min(radius, w * .45, h * .45, d * .45);
    if (r < .0008) { this.box(slot, [x, y, z], [w, h, d], uv); return; }
    const unitUv = this.mode(slot, uv) === "unit";
    const axis = half.map(a => a - r > 1e-6 ? [-a, -(a - r), a - r, a] : [-a, 0, a]);
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    // Face axes are ordered so du x dv points outward (as the upholstered soft box).
    for (const [fixed, sign, a, b] of [[1, 1, 2, 0], [1, -1, 0, 2], [0, 1, 1, 2], [0, -1, 2, 1], [2, 1, 0, 1], [2, -1, 1, 0]] as const) {
      const us = axis[a]!, vs = axis[b]!, base = positions.length / 3;
      for (const v of vs) for (const u of us) {
        const p: Vec3 = [0, 0, 0]; p[fixed] = half[fixed]! * sign; p[a] = u; p[b] = v;
        const inner = p.map((c, j) => Math.max(-half[j]! + r, Math.min(half[j]! - r, c))) as Vec3;
        const n = unit(p.map((c, j) => c - inner[j]!) as Vec3);
        positions.push(...inner.map((c, j) => c + n[j]! * r + centre[j]!));
        normals.push(...n);
        uvs.push(unitUv ? (u + half[a]!) / (2 * half[a]!) : u + half[a]!, unitUv ? 1 - (v + half[b]!) / (2 * half[b]!) : v + half[b]!);
      }
      for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < us.length - 1; i++) {
        const q = base + j * us.length + i;
        indices.push(q, q + 1, q + us.length + 1, q, q + us.length + 1, q + us.length);
      }
    }
    this.mesh.addSurface(slot, { positions, normals, uvs, indices });
  }

  /** `bevelBox` centred in XZ, standing on y. */
  cbevel(slot: string, [cx, y, cz]: Vector3, [w, h, d]: Vector3, radius = .004, uv?: UvMode): void {
    this.bevelBox(slot, [cx - w / 2, y, cz - d / 2], [w, h, d], radius, uv);
  }

  /** A constant (y, z) section swept along x from x0 to x1: worktop noses, trims, housings.
   *  Consecutive section edges meeting under `crease` degrees share a normal (a rounded nose
   *  reads round); sharper corners stay crisp. UVs: u along the sweep, v along the section,
   *  in metres (tiled) or 0..1 (exact), so a stretched sweep keeps its section. `axis: 'z'`
   *  sweeps an (x, y) section along z instead (an end nose). */
  sweep(slot: string, section: readonly Point[], x0: number, x1: number, options: { caps?: boolean; crease?: number; uv?: UvMode; axis?: "x" | "z" } = {}): void {
    // The z sweep is the x sweep with its axes turned cyclically (x, y, z) -> (z, x, y).
    const along = options.axis === "z", put = (s: number, a: number, b: number): Vec3 => along ? [a, b, s] : [s, a, b];
    const area = section.reduce((s, p, i) => { const q = section[(i + 1) % section.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const p = area < 0 ? [...section].reverse() : [...section], n = p.length;
    const unitUv = this.mode(slot, options.uv) === "unit", cos = Math.cos((options.crease ?? 40) * Math.PI / 180);
    // Outward normal of edge i (p[i] -> p[i+1]) in (y, z): the quad order below faces it.
    const edge = (i: number): [number, number] => {
      const a = p[i]!, b = p[(i + 1) % n]!, dy = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dy, dz) || 1;
      return [dz / l, -dy / l];
    };
    const at = (i: number, e: number): [number, number] => {
      // The normal at vertex i seen from edge e: averaged with the neighbour edge when smooth.
      const self = edge(e), other = edge(e === i ? (i - 1 + n) % n : (i + 1) % n);
      if (self[0] * other[0] + self[1] * other[1] < cos) return self;
      const s = [self[0] + other[0], self[1] + other[1]], l = Math.hypot(s[0]!, s[1]!) || 1;
      return [s[0]! / l, s[1]! / l];
    };
    const perimeter: number[] = [0];
    for (let i = 0; i < n; i++) perimeter.push(perimeter[i]! + Math.hypot(p[(i + 1) % n]![0] - p[i]![0], p[(i + 1) % n]![1] - p[i]![1]));
    const total = perimeter[n]! || 1, length = x1 - x0 || 1;
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, base = positions.length / 3, na = at(i, i), nb = at(j, i);
      for (const [x, pt, nn, s] of [[x0, p[i]!, na, perimeter[i]!], [x0, p[j]!, nb, perimeter[i + 1]!], [x1, p[j]!, nb, perimeter[i + 1]!], [x1, p[i]!, na, perimeter[i]!]] as const) {
        positions.push(...put(x, pt[0], pt[1])); normals.push(...put(0, nn[0], nn[1]));
        uvs.push(unitUv ? (x - x0) / length : x - x0, unitUv ? s / total : s);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.mesh.addSurface(slot, { positions, normals, uvs, indices });
    if (options.caps === false) return;
    const triangles = triangulate(p);
    for (const [x, sign] of [[x0, -1], [x1, 1]] as const) this.mesh.addSurface(slot, {
      positions: p.flatMap(([yy, zz]) => put(x, yy, zz)), normals: p.flatMap(() => put(sign, 0, 0)),
      uvs: p.flatMap(([yy, zz]) => [zz, yy]), indices: triangles.flatMap(([a, b, c]) => sign > 0 ? [a, b, c] : [a, c, b]),
    });
  }

  /** A plan outline (x, z) standing from y0 to y1 with its top edge rounded to `radius`
   *  and its bottom edge eased by `bottom` (two facets per quarter round each): tabletops,
   *  nightstands, seats, plinths of any plan shape. Sides meeting under 35 degrees share a
   *  normal, so a curved plan reads round and a corner stays crisp. */
  slab(slot: string, outline: readonly Point[], y0: number, y1: number, radius = .006, bottom = 0): void {
    const area = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const p = area < 0 ? [...outline].reverse() : [...outline], n = p.length;
    const r = Math.min(radius, (y1 - y0) * .45), b = Math.min(bottom, (y1 - y0) * .45);
    const edge = (i: number): [number, number] => {
      const a = p[i]!, c = p[(i + 1) % n]!, dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [dz / l, -dx / l];
    };
    const cosCrease = Math.cos(35 * Math.PI / 180);
    // Miter direction at a vertex (for insets) and the side normal seen from edge e.
    const miter = (i: number): [number, number] => {
      const e0 = edge((i - 1 + n) % n), e1 = edge(i), m = [e0[0] + e1[0], e0[1] + e1[1]], l = Math.hypot(m[0]!, m[1]!) || 1;
      const u: [number, number] = [m[0]! / l, m[1]! / l], c = Math.max(.35, u[0] * e1[0] + u[1] * e1[1]);
      return [u[0] / c, u[1] / c];
    };
    const sideNormal = (i: number, e: number): [number, number] => {
      const self = edge(e), other = edge(e === i ? (i - 1 + n) % n : (i + 1) % n);
      if (self[0] * other[0] + self[1] * other[1] < cosCrease) return self;
      const m = [self[0] + other[0], self[1] + other[1]], l = Math.hypot(m[0]!, m[1]!) || 1;
      return [m[0]! / l, m[1]! / l];
    };
    // Rings from the bottom: (height, inset, lift of the normal towards +y).
    const s45 = Math.SQRT1_2;
    const rings: [number, number, number][] = [
      ...(b > 0 ? [[y0, b, -1], [y0 + b * (1 - s45), b * (1 - s45), -s45], [y0 + b, 0, 0]] as [number, number, number][] : [[y0, 0, 0]] as [number, number, number][]),
      ...(r > 0 ? [[y1 - r, 0, 0], [y1 - r * (1 - s45), r * (1 - s45), s45], [y1, r, 1]] as [number, number, number][] : [[y1, 0, 0]] as [number, number, number][]),
    ];
    const at = (i: number, inset: number): [number, number] => { const m = miter(i); return [p[i]![0] - m[0] * inset, p[i]![1] - m[1] * inset]; };
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    let along = 0;
    for (let e = 0; e < n; e++) {
      const i = e, j = (e + 1) % n, length = Math.hypot(p[j]![0] - p[i]![0], p[j]![1] - p[i]![1]);
      for (let k = 0; k + 1 < rings.length; k++) {
        const base = positions.length / 3;
        for (const [v, ring] of [[i, rings[k]!], [j, rings[k]!], [j, rings[k + 1]!], [i, rings[k + 1]!]] as const) {
          const [x, z] = at(v, ring[1]), side = sideNormal(v, e), lift = ring[2], flat = Math.sqrt(Math.max(0, 1 - lift * lift));
          positions.push(x, ring[0], z); normals.push(side[0] * flat, lift, side[1] * flat);
          uvs.push(along + (v === j ? length : 0), ring[0] - y0);
        }
        // Wound like a prism's side (bottom a, top a, top b, bottom b), outward.
        indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
      }
      along += length;
    }
    this.mesh.addSurface(slot, { positions, normals, uvs, indices });
    const top = p.map((_, i) => at(i, r > 0 ? r : 0)), foot = p.map((_, i) => at(i, b > 0 ? b : 0));
    this.mesh.addHorizontalPolygon(slot, top, y1, "up", this.mode(slot));
    this.mesh.addHorizontalPolygon(slot, foot, y0, "down", this.mode(slot));
  }

  /** Round tube through points (smooth, closed ends): taps, rails, bar pulls, frames. */
  tube(slot: string, points: Vec3[], radius: number, closed = false, sides = 12): void {
    tube(this, slot, points, radius, closed, sides);
  }

  /** Closed turned (lathe) vessel from an (r, y) profile tracing outside, rim, inside and
   *  underside: vases, bowls, bottles, glasses, knobs. */
  turned(slot: string, at: Vec3, profile: [number, number][], sides = 32): void {
    turned(this, slot, at, profile, sides);
  }

  /** Square-section rod between two points, e.g. a leg, a rail, a stem; `round` draws a
   *  smooth round section of the same thickness instead. */
  rod(slot: string, a: Vector3, b: Vector3, thickness: number, round = false): void {
    if (round) { tube(this, slot, [[...a], [...b]], thickness / 2, false, 12); return; }
    const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vector3;
    const length = Math.hypot(...axis) || 1;
    const n = axis.map((v) => v / length) as Vector3;
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(n, helper)), v = unit(cross(n, u));
    const h = thickness / 2;
    const corner = (p: Vec3, su: number, sv: number): Vec3 => [p[0] + u[0] * su * h + v[0] * sv * h, p[1] + u[1] * su * h + v[1] * sv * h, p[2] + u[2] * su * h + v[2] * sv * h];
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    const bottom = ring.map(([su, sv]) => corner(a, su, sv)), top = ring.map(([su, sv]) => corner(b, su, sv));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.mesh.addQuad(slot, [bottom[i]!, top[i]!, top[j]!, bottom[j]!], this.mode(slot));
    }
    this.mesh.addQuad(slot, [top[0]!, top[3]!, top[2]!, top[1]!], this.mode(slot));
    this.mesh.addQuad(slot, [bottom[0]!, bottom[1]!, bottom[2]!, bottom[3]!], this.mode(slot));
  }

  /** One leaf: a bent quad pair from `at` along a horizontal heading, rising a little. */
  leaf(slot: string, at: Vector3, headingRad: number, length: number, width: number, lift = 0.25): void {
    const dx = Math.cos(headingRad), dz = Math.sin(headingRad), px = -dz, pz = dx;
    const tip: Vec3 = [at[0] + dx * length, at[1] + length * lift, at[2] + dz * length];
    const mid: Vec3 = [at[0] + dx * length * 0.45, at[1] + length * lift * 0.7, at[2] + dz * length * 0.45];
    const left: Vec3 = [mid[0] + px * width / 2, mid[1], mid[2] + pz * width / 2];
    const right: Vec3 = [mid[0] - px * width / 2, mid[1], mid[2] - pz * width / 2];
    this.mesh.addQuad(slot, [at, left, tip, right], this.mode(slot));
    this.mesh.addQuad(slot, [at, right, tip, left], this.mode(slot));
  }

  /** A planted tuft: a stem with a fan of leaves, seeded so every tuft differs. */
  plant(leafSlot: string, stemSlot: string, at: Vector3, height: number, seed: number, leaves = 7): void {
    this.rod(stemSlot, at, [at[0], at[1] + height * 0.55, at[2]], 0.02);
    for (let i = 0; i < leaves; i++) {
      const t = noise(seed + i), a = i * 2.399 + noise(seed * 3 + i) * 0.8;
      const y = at[1] + height * (0.2 + 0.35 * t);
      this.leaf(leafSlot, [at[0], y, at[2]], a, height * (0.35 + 0.25 * noise(seed + 11 + i)), height * 0.12, 0.35 + 0.4 * t);
    }
  }
}

function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
