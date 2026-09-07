import type { Document, Node } from "@gltf-transform/core";

export type AssetFamily =
  | "appliance" | "bed" | "bench" | "chair" | "desk" | "planter" | "prop"
  | "shelf" | "sink" | "sofa" | "storage" | "table" | "toilet";

export interface AssetEntry {
  id: string;
  title: string;
  family: AssetFamily;
  styles: string[];
  source: {
    provider: "Sketchfab" | "Poly Haven";
    uid?: string;
    uri: string;
    author: { name: string; uri?: string };
  };
  license: {
    slug: string;
    name: string;
    uri: string;
    verifiedAt: string;
    redistributable: boolean;
  };
  sourceDimensions: { size: [number, number, number]; unit: "source-unit" | "meter" };
  dimensionsMeters?: [number, number, number];
  modelUri?: string;
  availability: "source-only" | "local-only" | "redistributable";
  metrics: {
    sourceBytes: number;
    modelBytes?: number;
    triangles: number;
    vertices: number;
    materials: number;
    textures: number;
  };
}

export interface AssetCatalog { version: 1; verifiedAt: string; assets: AssetEntry[] }

export interface AssetQuery {
  family: AssetFamily;
  styles?: readonly string[];
  maxBounds?: readonly [number, number, number];
  rotationYDeg?: number;
  minimumScale?: number;
  availableOnly?: boolean;
  modelsDir?: string;
}

export interface AssetPlacement {
  position: readonly [number, number, number];
  rotationYDeg?: number;
  /** Small variation inside the caller's rotated bounding box. */
  variationDeg?: number;
  maxBounds: readonly [number, number, number];
  minimumScale?: number;
}

export interface AssetFit { dimensions: [number, number, number]; scale: number }

export interface AssetInstance {
  asset: AssetEntry;
  node: Node;
  dimensions: [number, number, number];
  scale: number;
}

export interface AssetReadOptions { modelsDir?: string }
export interface AssetInstanceOptions extends AssetReadOptions { read?: (asset: AssetEntry) => Promise<Document> }
