import type { MeshBuilder } from "../glb/mesh-builder.js";

export type Vector3 = [number, number, number];

export interface ModuleEntry {
  id: string;
  file: string;
  size: Vector3;
  origin: Vector3;
  materialSlots: string[];
  triangles: number;
  bytes: number;
}

export interface ModuleCatalog {
  version: 1;
  grid: 0.5;
  modules: ModuleEntry[];
}

/** An authored module before serialization: origin is the vector from bounds minimum to
 *  the authored zero, size the bounds extent. */
export interface ModuleRecipe {
  id: string;
  mesh: MeshBuilder;
  size: Vector3;
  origin: Vector3;
}
