import { Document, NodeIO, getBounds, type Material } from "@gltf-transform/core";
import type { MeshBuilder } from "./mesh-builder.js";
import type { Vec3 } from "./mesh-builder.js";

const io = new NodeIO();

export function createDocument(builder: MeshBuilder): Document {
  const doc = new Document();
  doc.createBuffer("buffer");
  doc.createScene("scene");
  appendToDocument(doc, builder);
  return doc;
}

/** Adds the builder's meshes to the document's default scene, reusing materials by name. */
export function appendToDocument(doc: Document, builder: MeshBuilder): void {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer("buffer");
  const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? doc.createScene("scene");

  for (const key of builder.materials()) {
    const group = builder.getGroup(key)!;
    const material = root.listMaterials().find((m) => m.getName() === key) ?? makeMaterial(doc, key);

    const position = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array(group.positions))
      .setBuffer(buffer);
    const normal = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array(group.normals))
      .setBuffer(buffer);
    const uv = doc
      .createAccessor()
      .setType("VEC2")
      .setArray(new Float32Array(group.uvs))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint32Array(group.indices))
      .setBuffer(buffer);

    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("NORMAL", normal)
      .setAttribute("TEXCOORD_0", uv)
      .setIndices(indices)
      .setMaterial(material);
    const mesh = doc.createMesh(`interior:${key}`).addPrimitive(prim);
    const node = doc.createNode(`interior:${key}`).setMesh(mesh);
    scene.addChild(node);
  }
}

function makeMaterial(doc: Document, key: string): Material {
  return doc
    .createMaterial(key)
    .setBaseColorFactor(placeholderColor(key))
    .setMetallicFactor(0)
    .setRoughnessFactor(0.9)
    .setDoubleSided(false);
}

/** Deterministic placeholder tint per material key so the preview separates surfaces
 *  before the materials box resolves real textures. */
function placeholderColor(key: string): [number, number, number, number] {
  let h = 0x811c9dc5;
  for (const ch of key) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  const hue = (h >>> 0) % 360;
  const [r, g, b] = hslToRgb(hue, 0.35, 0.6);
  return [r, g, b, 1];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

export async function writeGlb(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}

export async function readGlbBytes(bytes: Uint8Array): Promise<Document> {
  return io.readBinary(bytes);
}

export async function readGlbFile(path: string): Promise<Document> {
  return io.read(path);
}

export function sceneBounds(doc: Document): { min: Vec3; max: Vec3 } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  const { min, max } = getBounds(scene);
  return { min: min as Vec3, max: max as Vec3 };
}
