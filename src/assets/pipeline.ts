import type { Document } from "@gltf-transform/core";
import type { FloorInterior, Furniture, InteriorRequest } from "../core/types.js";
import { assetFamilyForFurniture, findFurnitureAssets } from "./families.js";
import { AssetInstancer } from "./instance.js";
import type { AssetEntry } from "./types.js";

export type AssetReader = (asset: AssetEntry) => Promise<Document>;

export interface FurnitureAssetSelection {
  floor: number;
  furniture: Furniture;
  asset: AssetEntry;
  variationDeg: number;
}

export interface PreparedFurnitureAssets {
  byFloor: ReadonlyMap<number, readonly FurnitureAssetSelection[]>;
  documents: ReadonlyMap<string, Document>;
  skipIdsByFloor: ReadonlyMap<number, ReadonlySet<string>>;
}

export async function prepareFurnitureAssets(
  floors: readonly FloorInterior[],
  request: Pick<InteriorRequest, "seed">,
  styles: readonly string[],
  read: AssetReader,
): Promise<PreparedFurnitureAssets> {
  const byFloor = new Map<number, FurnitureAssetSelection[]>();
  const documents = new Map<string, Document>();
  const attempts = new Map<string, Promise<Document | null>>();
  const chosen = new Map<string, AssetEntry>();
  const activeFamilies = new Set(["chair", "desk", "sofa", "planter", "bed", "shelf", "appliance", "toilet", "sink", "bench"]);
  if (styles.includes("poor") || styles.includes("damaged")) activeFamilies.add("prop");

  for (const floor of [...floors].sort((a, b) => a.floor - b.floor)) {
    for (const furniture of floor.furniture) {
      const family = assetFamilyForFurniture(furniture.kind);
      if (!family || !activeFamilies.has(family)) continue;
      const variationDeg = variation(furniture, request.seed);
      const styled = unique(styles.flatMap((style) => findFurnitureAssets(furniture, {
        styles: [style], variationDeg,
      })));
      const fallback = findFurnitureAssets(furniture, { variationDeg });
      const candidates = unique([
        ...orderedStyles(styled, styles, `${String(request.seed)}/${family}`),
        ...candidateOrder(fallback, `${String(request.seed)}/${family}/fallback`),
      ]);
      const existing = chosen.get(family);
      const ordered = existing ? candidates.filter((asset) => asset.id === existing.id) : candidates;
      for (const asset of ordered) {
        const pending = attempts.get(asset.id) ?? tryRead(asset, read);
        attempts.set(asset.id, pending);
        const document = await pending;
        if (!document) continue;
        documents.set(asset.id, document);
        chosen.set(family, asset);
        const floorItems = byFloor.get(floor.floor) ?? [];
        floorItems.push({ floor: floor.floor, furniture, asset, variationDeg });
        byFloor.set(floor.floor, floorItems);
        break;
      }
    }
  }

  return {
    byFloor,
    documents,
    skipIdsByFloor: new Map([...byFloor].map(([floor, selections]) => [
      floor, new Set(selections.map((selection) => selection.furniture.id)),
    ])),
  };
}

export async function appendFurnitureAssets(
  target: Document,
  selections: readonly FurnitureAssetSelection[],
  documents: ReadonlyMap<string, Document>,
  floorElevation: number,
): Promise<void> {
  const instancer = new AssetInstancer(target, async (asset) => {
    const document = documents.get(asset.id);
    if (!document) throw new Error(`Asset ${asset.id} was not prepared`);
    return document;
  });
  for (const selection of selections) {
    const item = selection.furniture;
    await instancer.instantiate(selection.asset, {
      position: [item.position[0], floorElevation + (item.elevation ?? 0), item.position[1]],
      rotationYDeg: item.rotationDeg,
      variationDeg: selection.variationDeg,
      maxBounds: item.size,
    });
  }
}

function variation(furniture: Furniture, seed: string | number): number {
  const amplitude = furniture.kind === "desk" || furniture.kind === "reception_desk"
    ? 2.5
    : furniture.kind === "chair" || furniture.kind === "office_chair" || furniture.kind === "stool"
      ? 6
      : 2;
  return ((hash(`${String(seed)}/${furniture.id}/variation`) / 0xffffffff) * 2 - 1) * amplitude;
}

async function tryRead(asset: AssetEntry, read: AssetReader): Promise<Document | null> {
  try { return await read(asset); } catch { return null; }
}

function candidateOrder(assets: readonly AssetEntry[], seed: string): AssetEntry[] {
  const local = assets.filter((asset) => asset.availability === "local-only");
  const publicModels = assets.filter((asset) => asset.availability === "redistributable");
  return [
    ...rotate(local, hash(`${seed}/local`)),
    ...rotate(publicModels, hash(`${seed}/public`)),
  ];
}

function orderedStyles(assets: readonly AssetEntry[], styles: readonly string[], seed: string): AssetEntry[] {
  return unique(styles.flatMap((style, priority) => candidateOrder(
    assets.filter((asset) => asset.styles.includes(style)), `${seed}/style-${priority}`,
  )));
}

function rotate<T>(values: readonly T[], seed: number): T[] {
  if (values.length < 2) return [...values];
  const offset = seed % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function unique(assets: readonly AssetEntry[]): AssetEntry[] {
  const seen = new Set<string>();
  return assets.filter((asset) => !seen.has(asset.id) && Boolean(seen.add(asset.id)));
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (const char of value) {
    result ^= char.codePointAt(0)!;
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}
