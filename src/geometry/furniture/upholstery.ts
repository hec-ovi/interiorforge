import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";

/** Rounded cushion surfaces contained by the supplied box, with metre-scaled UVs. */
export function upholstery(
  mesh: MeshBuilder, material: string, min: Vec3, max: Vec3, transform: (point: Vec3) => Vec3,
): void {
  const half = min.map((value, axis) => (max[axis]! - value) / 2);
  const center = min.map((value, axis) => (max[axis]! + value) / 2);
  const radius = Math.min(0.055, ...half.map(value => value / 2));
  const grid = half.map(h => [-h, -h + radius / 2, -h + radius, h - radius, h - radius / 2, h]);
  const rounded = (point: Vec3): Vec3 => {
    const inner = point.map((value, axis) => Math.max(-half[axis]! + radius, Math.min(half[axis]! - radius, value)));
    const delta = point.map((value, axis) => value - inner[axis]!);
    const length = Math.hypot(...delta);
    return transform(point.map((_, axis) => center[axis]! + inner[axis]! + delta[axis]! * radius / length) as Vec3);
  };

  for (const axis of [0, 1, 2]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
        const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]];
        if (sign < 0) corners.reverse();
        const points = corners.map(([i, j]) => {
          const point: Vec3 = [0, 0, 0];
          point[axis] = sign * half[axis]!;
          point[u] = grid[u]![i!]!;
          point[v] = grid[v]![j!]!;
          return point;
        });
        mesh.addQuadUv(material, points.map(rounded) as [Vec3, Vec3, Vec3, Vec3],
          points.map(point => [point[u]!, -point[v]!]) as [[number, number], [number, number], [number, number], [number, number]]);
      }
    }
  }
}
