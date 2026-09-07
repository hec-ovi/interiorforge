import { type Document, type Node } from "@gltf-transform/core";
import { copyToDocument } from "@gltf-transform/functions";
import { fitAssetBounds } from "./catalog.js";
import { readAssetModel } from "./io.js";
import type { AssetEntry, AssetInstance, AssetInstanceOptions, AssetPlacement } from "./types.js";

export async function instantiateAsset(
  target: Document,
  asset: AssetEntry,
  placement: AssetPlacement,
  options: AssetInstanceOptions = {},
): Promise<AssetInstance> {
  validatePlacement(placement);
  if (!asset.dimensionsMeters) throw new Error(`Asset ${asset.id} has no normalized dimensions`);
  const source = options.read ? await options.read(asset) : await readAssetModel(asset, options);
  const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  if (!sourceScene) throw new Error(`Asset ${asset.id} has no scene`);
  const sourceNodes = sourceScene.listChildren();
  if (sourceNodes.length === 0) throw new Error(`Asset ${asset.id} has no scene nodes`);

  const copied = copyToDocument(target, source, sourceNodes);
  const parent = target.createNode(`asset:${asset.id}`);
  for (const sourceNode of sourceNodes) parent.addChild(copied.get(sourceNode) as Node);

  const angle = ((placement.rotationYDeg ?? 0) + (placement.variationDeg ?? 0)) * Math.PI / 180;
  const fit = fitAssetBounds(asset, placement.maxBounds, placement.variationDeg, placement.minimumScale);
  if (!fit) throw new RangeError(`Asset ${asset.id} cannot fit its placement bounds at a useful scale`);
  const { dimensions, scale } = fit;
  parent.setScale([scale, scale, scale]);
  parent.setRotation([0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]);
  parent.setTranslation([...placement.position]);
  const scene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0] ?? target.createScene("scene");
  scene.addChild(parent);

  return { asset, node: parent, scale, dimensions };
}

function validatePlacement(placement: AssetPlacement): void {
  if (![...placement.position, ...placement.maxBounds, placement.rotationYDeg ?? 0, placement.variationDeg ?? 0].every(Number.isFinite)) {
    throw new RangeError("Asset placement values must be finite");
  }
  if (placement.maxBounds.some((value) => value <= 0)) {
    throw new RangeError("Asset placement bounds must be positive");
  }
  if (placement.minimumScale !== undefined && (!Number.isFinite(placement.minimumScale) || placement.minimumScale <= 0)) {
    throw new RangeError("Asset placement minimum scale must be positive");
  }
}
