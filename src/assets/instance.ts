import { type Accessor, Document, type Node, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { copyToDocument } from "@gltf-transform/functions";
import { fitAssetBounds } from "./catalog.js";
import type { AssetEntry, AssetInstance, AssetInstanceOptions, AssetPlacement } from "./types.js";

const transferIO = new WebIO().registerExtensions(ALL_EXTENSIONS);

export async function instantiateAsset(
  target: Document,
  asset: AssetEntry,
  placement: AssetPlacement,
  options: AssetInstanceOptions = {},
): Promise<AssetInstance> {
  if (!options.read) throw new Error("Asset instancing requires a model reader");
  return new AssetInstancer(target, options.read).instantiate(asset, placement);
}

export class AssetInstancer {
  private readonly templates = new Map<string, Node[]>();

  constructor(
    private readonly target: Document,
    private readonly read: (asset: AssetEntry) => Promise<Document>,
  ) {}

  async instantiate(asset: AssetEntry, placement: AssetPlacement): Promise<AssetInstance> {
  validatePlacement(placement);
  if (!asset.dimensionsMeters) throw new Error(`Asset ${asset.id} has no normalized dimensions`);
    const children = await this.instanceChildren(asset);
    const parent = this.target.createNode(`asset:${asset.id}`);
    for (const child of children) parent.addChild(child);

  const angle = ((placement.rotationYDeg ?? 0) + (placement.variationDeg ?? 0)) * Math.PI / 180;
  const fit = fitAssetBounds(asset, placement.maxBounds, placement.variationDeg, placement.minimumScale);
  if (!fit) throw new RangeError(`Asset ${asset.id} cannot fit its placement bounds at a useful scale`);
  const { dimensions, scale } = fit;
    parent.setScale([scale, scale, scale]);
    parent.setRotation([0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]);
    parent.setTranslation([...placement.position]);
    const scene = this.target.getRoot().getDefaultScene() ?? this.target.getRoot().listScenes()[0] ?? this.target.createScene("scene");
    scene.addChild(parent);

    return { asset, node: parent, scale, dimensions };
  }

  private async instanceChildren(asset: AssetEntry): Promise<Node[]> {
    const existing = this.templates.get(asset.id);
    if (existing) return existing.map((node) => cloneNode(this.target, node));

    const readSource = await this.read(asset);
    const source = readSource instanceof Document
      ? readSource
      : await transferIO.readBinary(await transferIO.writeBinary(readSource));
    if (source.getRoot().listAnimations().length || source.getRoot().listSkins().length) {
      throw new Error(`Asset ${asset.id} must be a static unskinned model`);
    }
    const scene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
    if (!scene?.listChildren().length) throw new Error(`Asset ${asset.id} has no scene nodes`);
    const sourceRoots = scene.listChildren();
    const copied = copyToDocument(this.target, source, sourceRoots);
    const roots = sourceRoots.map((node) => copied.get(node) as Node);
    consolidateBuffers(this.target, roots);
    for (const root of roots) prefixNode(root, asset.id);
    this.templates.set(asset.id, roots);
    return roots;
  }
}

function consolidateBuffers(doc: Document, roots: readonly Node[]): void {
  const target = doc.getRoot().listBuffers()[0] ?? doc.createBuffer("buffer");
  const accessors = new Set<Accessor>();
  const visit = (node: Node): void => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getIndices()) accessors.add(primitive.getIndices()!);
      for (const semantic of primitive.listSemantics()) accessors.add(primitive.getAttribute(semantic)!);
      for (const morph of primitive.listTargets()) {
        for (const semantic of morph.listSemantics()) accessors.add(morph.getAttribute(semantic)!);
      }
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const root of roots) visit(root);
  for (const accessor of accessors) accessor.setBuffer(target);
  for (const buffer of doc.getRoot().listBuffers()) {
    if (buffer !== target && !doc.getRoot().listAccessors().some((accessor) => accessor.getBuffer() === buffer)) buffer.dispose();
  }
}

function prefixNode(node: Node, assetId: string): void {
  node.setName(`asset:${assetId}/${node.getName() || "node"}`);
  for (const child of node.listChildren()) prefixNode(child, assetId);
}

function cloneNode(doc: Document, source: Node): Node {
  const clone = doc.createNode(source.getName())
    .setMatrix([...source.getMatrix()])
    .setWeights([...source.getWeights()])
    .setExtras({ ...source.getExtras() });
  const mesh = source.getMesh();
  const camera = source.getCamera();
  if (mesh) clone.setMesh(mesh);
  if (camera) clone.setCamera(camera);
  for (const child of source.listChildren()) clone.addChild(cloneNode(doc, child));
  return clone;
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
