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

export interface AssetFit { dimensions: [number, number, number]; scale: number }
