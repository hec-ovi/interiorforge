import type { Point } from "../core/geom.js";
import { readGlbBytes } from "../glb/io.js";

type Point3 = [number, number, number];
export type Triangle = [Point3, Point3, Point3];

export function toFrame([x, z]: Point, angleDeg: number): Point {
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [x * cos + z * sin, -x * sin + z * cos];
}

export function toWorld([u, v]: Point, angleDeg: number): Point {
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [u * cos - v * sin, u * sin + v * cos];
}

function transformPoint(position: ArrayLike<number>, index: number, matrix: readonly number[]): Point3 {
  const x = Number(position[index * 3]);
  const y = Number(position[index * 3 + 1]);
  const z = Number(position[index * 3 + 2]);
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ];
}

export async function upwardSurfaceTriangles(glb: Uint8Array, elevation: number): Promise<Triangle[]> {
  const document = await readGlbBytes(glb);
  const triangles: Triangle[] = [];
  for (const node of document.getRoot().listNodes()) {
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION")!.getArray()!;
      const indices = primitive.getIndices()?.getArray();
      const count = indices?.length ?? primitive.getAttribute("POSITION")!.getCount();
      for (let i = 0; i + 2 < count; i += 3) {
        const triangle = [0, 1, 2].map((offset) =>
          transformPoint(positions, Number(indices?.[i + offset] ?? i + offset), matrix)) as Triangle;
        const [a, b, c] = triangle;
        const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (normalY > 0 && triangle.every((point) => Math.abs(point[1] - elevation) < 0.002)) {
          triangles.push(triangle);
        }
      }
    }
  }
  return triangles;
}

export function supportsPoint([a, b, c]: Triangle, [x, z]: Point): boolean {
  const divisor = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(divisor) < 1e-12) return false;
  const p = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / divisor;
  const q = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / divisor;
  return p >= -1e-5 && q >= -1e-5 && 1 - p - q >= -1e-5;
}
