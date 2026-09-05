import type { Document } from "@gltf-transform/core";
import type { Point } from "../core/geom.js";
import type { BlueprintFloor, Opening } from "../core/types.js";
import { readGlbBytes } from "../glb/io.js";

export type Vertex = [number, number, number];
export type Triangle = [Vertex, Vertex, Vertex];

/** Serialized triangles in facade U, floor-relative Y and positive inward depth. */
export async function facadeTriangles(
  glb: Uint8Array, floor: BlueprintFloor, opening: Opening,
): Promise<Triangle[]> {
  return documentFacadeTriangles(await readGlbBytes(glb), floor, opening);
}

export function documentFacadeTriangles(
  doc: Document, floor: BlueprintFloor, opening: Opening, includeNode: (name: string) => boolean = () => true,
): Triangle[] {
  const a = floor.outline[opening.edge]!, b = floor.outline[(opening.edge + 1) % floor.outline.length]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const direction: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const triangles: Triangle[] = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!includeNode(node.getName())) continue;
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION")!.getArray()!;
      const indices = primitive.getIndices()!.getArray()!;
      for (let i = 0; i < indices.length; i += 3) {
        triangles.push([0, 1, 2].map((offset): Vertex => {
          const k = indices[i + offset]! * 3;
          const x = positions[k]!, y = positions[k + 1]!, z = positions[k + 2]!;
          const wx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]! - a[0];
          const wy = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]! - floor.elevation;
          const wz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]! - a[1];
          return [wx * direction[0] + wz * direction[1], wy, -wx * direction[1] + wz * direction[0]];
        }) as Triangle);
      }
    }
  }
  return triangles;
}

/** Clip an emitted triangle against all six planes of a strict test volume. */
export function triangleIntersectsBox(triangle: Triangle, min: Vertex, max: Vertex): boolean {
  let polygon: Vertex[] = triangle;
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [0, 1]) {
      const plane = side === 0 ? min[axis]! : max[axis]!;
      const kept: Vertex[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
        const da = (a[axis]! - plane) * (side === 0 ? 1 : -1);
        const db = (b[axis]! - plane) * (side === 0 ? 1 : -1);
        if (da >= 0) kept.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          kept.push(a.map((value, k) => value + (b[k]! - value) * t) as Vertex);
        }
      }
      polygon = kept;
      if (polygon.length < 3) return false;
    }
  }
  return polygon.slice(1, -1).some((b, i) => {
    const a = polygon[0]!, c = polygon[i + 2]!;
    const u = b.map((v, k) => v - a[k]!), v = c.map((n, k) => n - a[k]!);
    return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!) > 1e-10;
  });
}
