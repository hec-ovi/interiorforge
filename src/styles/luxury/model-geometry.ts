import { triangulate } from '../../core/triangulate.js';
import type { Kit } from '../../modules/kit.js';
import type { MeshGroup, Vec3 } from '../../glb/mesh-builder.js';

type MutableSurface = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
const surface = (): MutableSurface => ({ positions: [], normals: [], uvs: [], indices: [] });
const unit = (v: Vec3): Vec3 => { const n = Math.hypot(...v) || 1; return v.map(x => x / n) as Vec3; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]!) as Vec3;

/** Weld shading across panel boundaries while preserving each sewn panel's UVs. */
export function smoothSurface(g: MutableSurface): MeshGroup {
  const normals = new Map<string, Vec3>();
  const key = (i: number) => g.positions.slice(i * 3, i * 3 + 3).map(v => Math.round(v * 1e7)).join('/');
  for (let i = 0; i < g.indices.length; i += 3) {
    const ids = g.indices.slice(i, i + 3), p = ids.map(v => g.positions.slice(v * 3, v * 3 + 3) as Vec3);
    const n = cross(sub(p[1]!, p[0]!), sub(p[2]!, p[0]!));
    for (const id of ids) { const k = key(id), old = normals.get(k) ?? [0, 0, 0]; normals.set(k, old.map((v, j) => v + n[j]!) as Vec3); }
  }
  for (let i = 0; i < g.positions.length / 3; i++) g.normals.push(...unit(normals.get(key(i))!));
  return g;
}

export interface SoftOptions {
  radius?: number;
  planRadius?: number;
  crown?: number;
  frontCrown?: number;
  /** Lean top toward -Z, measured as a ratio of height. */
  lean?: number;
  /** Bottom-to-top width change, positive narrows the bottom. */
  taper?: number;
  wrinkles?: number;
  detail?: number;
  worldUv?: boolean;
  rotation?: Vec3;
}

/** A closed, six-panel upholstered volume, with a rounded edge in all three axes.
 * Crowning and small tension folds deform the actual surface, never an alpha plane.
 * Coordinates are metric; y is the underside and the central crown reaches y+h. */
export function softBox(k: Kit, slot: string, at: Vec3, size: Vec3, options: SoftOptions = {}): void {
  const [w, h, d] = size, half: Vec3 = [w / 2, h / 2, d / 2];
  const r = Math.min(options.radius ?? .035, w * .45, h * .45, d * .45);
  const radii: Vec3 = [Math.min(options.planRadius ?? r, w * .45), r, Math.min(options.planRadius ?? r, d * .45)];
  const crown = options.crown ?? 0;
  const g = surface();
  // Every face uses the same samples along shared edges, including bevel stations.
  const textile = Boolean(crown || options.frontCrown || options.wrinkles);
  const bevelStations = textile || Math.max(...radii) > .04 ? [.12, .35, .65] : [.5];
  const axis = half.map((a, component) => {
    const r = radii[component]!;
    const inner = a - r, count = Math.max(1, Math.ceil(inner * (options.detail ?? (textile ? 16 : 0))));
    const vals = [-a, ...bevelStations.map(t => -a + r * t)];
    for (let i = 0; i <= count; i++) vals.push(-inner + 2 * inner * i / count);
    vals.push(...[...bevelStations].reverse().map(t => a - r * t), a);
    return vals;
  });
  // Face axes are ordered so du × dv points outward.
  for (const [fixed, sign, a, b] of [[1, 1, 2, 0], [1, -1, 0, 2], [0, 1, 1, 2], [0, -1, 2, 1], [2, 1, 0, 1], [2, -1, 1, 0]]) {
    const us = axis[a!]!, vs = axis[b!]!, base = g.positions.length / 3;
    for (const v of vs) for (const u of us) {
      const p: Vec3 = [0, 0, 0]; p[fixed!] = half[fixed!]! * sign!; p[a!] = u; p[b!] = v;
      const inner = p.map((v0, j) => Math.max(-half[j]! + radii[j]!, Math.min(half[j]! - radii[j]!, v0))) as Vec3;
      const n = unit(sub(p, inner).map((v0, j) => v0 / radii[j]!) as Vec3);
      const q = inner.map((v0, j) => v0 + n[j]! * radii[j]!) as Vec3;
      const fy = (q[1] + h / 2) / h, sx = q[0] / half[0], sy = q[1] / half[1], sz = q[2] / half[2];
      // Perimeter edge stays compressed; the center holds its upholstered volume.
      q[1] -= crown * fy * (1 - (1 - sx ** 4) * (1 - sz ** 4));
      q[2] -= (options.frontCrown ?? 0) * (sz + 1) / 2 * (1 - (1 - sx ** 4) * (1 - sy ** 4));
      if (options.wrinkles) {
        const edge = Math.max(...[sx, sy, sz].map(t => Math.exp(-(((Math.abs(t) - .78) / .17) ** 2)) * Math.sqrt(Math.max(0, 1 - Math.abs(t)))));
        const fold = options.wrinkles * (.5 + .5 * Math.sin(q[0] * 73 + q[2] * 21 + q[1] * 53)) * edge;
        for (let component = 0; component < 3; component++) q[component]! -= n[component]! * fold;
      }
      q[0] *= 1 - (options.taper ?? 0) * (1 - fy);
      q[2] -= (options.lean ?? 0) * (q[1] + h / 2);
      if (options.rotation) {
        for (let axis = 0; axis < 3; axis++) {
          const a = (axis + 1) % 3, b = (axis + 2) % 3, angle = options.rotation[axis]!;
          const va = q[a]!, vb = q[b]!;
          q[a] = va * Math.cos(angle) - vb * Math.sin(angle);
          q[b] = va * Math.sin(angle) + vb * Math.cos(angle);
        }
      }
      g.positions.push(q[0] + at[0], q[1] + h / 2 + at[1], q[2] + at[2]);
      g.uvs.push(u + (options.worldUv ? at[a!]! : half[a!]!), v + (options.worldUv ? at[b!]! : half[b!]!));
    }
    for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < us.length - 1; i++) {
      const p = base + j * us.length + i;
      g.indices.push(p, p + 1, p + us.length + 1, p, p + us.length + 1, p + us.length);
    }
  }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** Smooth circular tube with closed ends (or a continuous sewn welt loop). */
export function tube(k: Kit, slot: string, points: Vec3[], radius: number, closed = false, sides = 8): void {
  const g = surface(), count = points.length, distances = [0];
  for (let i = 1; i < count; i++) distances.push(distances[i - 1]! + Math.hypot(...sub(points[i]!, points[i - 1]!)));
  for (let i = 0; i < count; i++) {
    const prev = points[closed ? (i - 1 + count) % count : Math.max(0, i - 1)]!;
    const next = points[closed ? (i + 1) % count : Math.min(count - 1, i + 1)]!;
    const tangent = unit(sub(next, prev));
    const a = unit(cross(tangent, Math.abs(tangent[1]) < .95 ? [0, 1, 0] : [1, 0, 0])), b = unit(cross(tangent, a));
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const n = a.map((v, c) => v * Math.cos(angle) + b[c]! * Math.sin(angle)) as Vec3;
      g.positions.push(...points[i]!.map((v, c) => v + n[c]! * radius)); g.normals.push(...n);
      g.uvs.push(distances[i]!, j / sides * Math.PI * radius * 2);
    }
  }
  for (let i = 0; i < (closed ? count : count - 1); i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides;
    const c = (i + 1) % count * sides + j, d = (i + 1) % count * sides + (j + 1) % sides;
    g.indices.push(a, b, d, a, d, c);
  }
  if (!closed) for (const i of [0, count - 1]) {
    const center = g.positions.length / 3; g.positions.push(...points[i]!); g.uvs.push(0, 0);
    const n = unit(sub(points[i]!, points[i === 0 ? 1 : i - 1]!)); g.normals.push(...n);
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      g.indices.push(...(i === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  k.mesh.addSurface(slot, g);
}

/** A tailored piping loop follows a rounded panel, not a square decorative stripe. */
export function welt(k: Kit, slot: string, at: Vec3, width: number, depth: number, radius = .055, thickness = .0022): void {
  const points: Vec3[] = [];
  for (const [sx, sz, angle] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) {
    for (let i = 0; i <= 8; i++) {
      const a = (angle! + i * 90 / 8) * Math.PI / 180;
      points.push([at[0] + sx! * (width / 2 - radius) + Math.cos(a) * radius, at[1], at[2] + sz! * (depth / 2 - radius) + Math.sin(a) * radius]);
    }
  }
  tube(k, slot, points, thickness, true, 6);
}

/** A volumetric duvet with a soft side overhang, foot drop and small tension folds.
 * Two surfaces share a sewn, closed perimeter; the underside never disappears. */
export function duvet(k: Kit, slot: string): void {
  const g = surface(), nx = 48, nz = 44, width = 1.93, depth = 1.54, start = -.405;
  const vertex = (i: number, j: number, underside: boolean): Vec3 => {
    const x = -width / 2 + width * i / nx, z = start + depth * j / nz;
    const side = Math.min(1, Math.max(0, (Math.abs(x) - .855) / .11));
    const foot = Math.min(1, Math.max(0, (z - 1.035) / .10));
    const soft = (n: number) => n * n * (3 - 2 * n);
    const edge = Math.max(side, foot);
    const folds = (.0027 + .006 * edge) * (Math.sin(x * 31 + z * 8) + .45 * Math.sin(z * 44 - x * 13));
    const roll = .027 * Math.exp(-(((z - start - .10) / .075) ** 2));
    let y = .556 + roll + folds - .126 * soft(side) - .125 * soft(foot) + .04 * soft(side) * soft(foot);
    // Cloth rides above the mattress's rounded corner before turning down outside
    // its footprint. This prevents the mattress cutting white holes through folds.
    if (Math.abs(x) <= .92 && z <= 1.10) {
      const dx = Math.max(0, Math.abs(x) - .855), dz = Math.max(0, z - 1.035);
      const mattressTop = .445 + Math.sqrt(Math.max(0, .065 ** 2 - dx ** 2 - dz ** 2));
      y = Math.max(y, mattressTop + .035);
    }
    return [x, y - (underside ? .027 : 0), z];
  };
  const stride = nx + 1, layer = stride * (nz + 1);
  for (const bottom of [false, true]) for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const p = vertex(i, j, bottom); g.positions.push(...p); g.uvs.push(p[0] + width / 2, p[2] - start);
  }
  for (const offset of [0, layer]) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = offset + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    g.indices.push(...(offset ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
  }
  const boundary: number[] = [];
  for (let i = 0; i < nx; i++) boundary.push(i);
  for (let j = 0; j < nz; j++) boundary.push(j * stride + nx);
  for (let i = nx; i > 0; i--) boundary.push(nz * stride + i);
  for (let j = nz; j > 0; j--) boundary.push(j * stride);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!, b = boundary[(i + 1) % boundary.length]!;
    g.indices.push(a, b, b + layer, a, b + layer, a + layer);
  }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** Closed cloth sampled in its own two-dimensional sewing coordinates. */
export function clothSurface(k: Kit, slot: string, sample: (u: number, v: number) => Vec3, width: number, depth: number, thickness = .012, nx = 48, nz = 44): void {
  const g = surface(), stride = nx + 1, layer = stride * (nz + 1);
  for (const bottom of [false, true]) for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const p = sample(i / nx, j / nz); g.positions.push(p[0], p[1] - (bottom ? thickness : 0), p[2]); g.uvs.push(i / nx * width, j / nz * depth);
  }
  for (const offset of [0, layer]) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = offset + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    g.indices.push(...(offset ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
  }
  const boundary: number[] = [];
  for (let i = 0; i < nx; i++) boundary.push(i);
  for (let j = 0; j < nz; j++) boundary.push(j * stride + nx);
  for (let i = nx; i > 0; i--) boundary.push(nz * stride + i);
  for (let j = nz; j > 0; j--) boundary.push(j * stride);
  for (let i = 0; i < boundary.length; i++) { const a = boundary[i]!, b = boundary[(i + 1) % boundary.length]!; g.indices.push(a, b, b + layer, a, b + layer, a + layer); }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** Loose pillow: four pinched sewn corners, inflated centre and edge tension folds. */
export function loosePillow(k: Kit, slot: string, at: Vec3, width: number, depth: number, height: number, yaw = 0, tilt = 0, uvOffset: [number,number] = [0,0], n = 28): void {
  const g = surface(), stride = n + 1, layer = stride ** 2;
  for (const bottom of [false, true]) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = i / n * 2 - 1, v = j / n * 2 - 1, fullness = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), .55);
    const x = u * width / 2 * (1 - .07 * (1 - v * v)), z = v * depth / 2 * (1 - .09 * (1 - u * u));
    const folds = .006 * Math.sin(v * 33 + u * 17) * Math.exp(-((Math.abs(u) - .8) ** 2) / .025)
      + .004 * Math.sin(u * 41 - v * 7) * Math.exp(-((Math.abs(v) - .8) ** 2) / .025);
    const y = at[1] + (bottom ? height * .03 * fullness : height * (.19 + .81 * fullness) + folds * fullness);
    const localY = y - at[1] - height / 2, yy = localY * Math.cos(tilt) - z * Math.sin(tilt), zz = localY * Math.sin(tilt) + z * Math.cos(tilt);
    g.positions.push(at[0] + x * Math.cos(yaw) + zz * Math.sin(yaw), at[1] + height / 2 + yy, at[2] + zz * Math.cos(yaw) - x * Math.sin(yaw));
    g.uvs.push((u + 1) * width / 2 + uvOffset[0], (v + 1) * depth / 2 + uvOffset[1]);
  }
  for (const offset of [0, layer]) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = offset + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    g.indices.push(...(offset ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
  }
  const edge: number[] = [];
  for (let i = 0; i < n; i++) edge.push(i);
  for (let j = 0; j < n; j++) edge.push(j * stride + n);
  for (let i = n; i > 0; i--) edge.push(n * stride + i);
  for (let j = n; j > 0; j--) edge.push(j * stride);
  for (let i = 0; i < edge.length; i++) { const a = edge[i]!, b = edge[(i + 1) % edge.length]!; g.indices.push(a, b, b + layer, a, b + layer, a + layer); }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** Closed rotational vessel. Profile traces outside, rim, inside and underside. */
export function turned(k: Kit, slot: string, at: Vec3, profile: [number, number][], sides = 40): void {
  const g = surface(), count = profile.length;
  for (const [r, y] of profile) for (let i = 0; i <= sides; i++) { const a = i / sides * Math.PI * 2;
    g.positions.push(at[0] + Math.cos(a) * r, at[1] + y, at[2] + Math.sin(a) * r); g.uvs.push(a * r, y);
  }
  for (let j = 0; j < count; j++) for (let i = 0; i < sides; i++) {
    const a = j * (sides + 1) + i, b = a + 1, c = ((j + 1) % count) * (sides + 1) + i, d = c + 1;
    g.indices.push(a, c, d, a, d, b);
  }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** A closed upholstered extrusion following an authored y/z seating profile.
 * End rounding preserves the angular frame profile while the seat/back is one shell. */
export function upholsteryProfile(k: Kit, slot: string, x: number, width: number, profile: [number, number][]): void {
  const area = profile.reduce((sum,p,i)=>{const q=profile[(i+1)%profile.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(area<0)profile=[...profile].reverse();
  const g = surface(), n = profile.length, stations = [-1, -.98, -.94, -.87, -.65, 0, .65, .87, .94, .98, 1];
  const cy = profile.reduce((s, p) => s + p[0], 0) / n, cz = profile.reduce((s, p) => s + p[1], 0) / n;
  for (const t of stations) {
    const compression = .012 * Math.pow(Math.abs(t), 12); let along = 0;
    for (let j = 0; j < n; j++) {
      if (j) along += Math.hypot(profile[j]![0] - profile[j - 1]![0], profile[j]![1] - profile[j - 1]![1]);
      const [y, z] = profile[j]!;
      g.positions.push(x + t * width / 2, y + (cy - y) * compression, z + (cz - z) * compression);
      g.uvs.push((t + 1) * width / 2, along);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) for (let j = 0; j < n; j++) {
    const a = s * n + j, b = s * n + (j + 1) % n, c = a + n, d = b + n;
    g.indices.push(a, b, d, a, d, c);
  }
  // Convex seating profiles have concave seat corners: use the existing polygon
  // triangulation in the y/z plane instead of a fan across the inner seat corner.
  const cap = profile.map(([y, z]) => [y, z] as [number, number]);
  for (const [a, b, c] of triangulate(cap)) {
    g.indices.push(a, c, b);
    const last = (stations.length - 1) * n; g.indices.push(last + a, last + b, last + c);
  }
  k.mesh.addSurface(slot, smoothSurface(g));
}
