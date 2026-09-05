import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingManager, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, Texture, TextureLoader } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createDocument, glbJson, readGlbBytes, writeGlb } from "../glb/io.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { textureDocument } from "./index.js";
import type { MaterialEntry, ThemeIndex } from "./theme.js";

const KEY = "test/metal/mid";
const PACKED = "assets/metal/mid/brushed/metallic-roughness.png";
const BASE_URL = "/materials/themes/test";
// 64 x 64 linear RGB: left half [255, 51, 204], right half [255, 179, 26].
const PACKED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAU0lEQVR4nO3PMQ0AMAgAMHRgY9KxgScmgYuvSQ005vWtylMhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgILD50PhRw+VviuoAAAAASUVORK5CYII=",
  "base64",
);
const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function theme(packed = true): ThemeIndex {
  const entry: MaterialEntry = {
    key: KEY,
    alignment: "tile",
    tiling: { worldSize: [2, 2] },
    physical: { metallicFactor: 0.4, roughnessFactor: 0.65 },
    variants: [
      {
        id: "plain", resolution: [64, 64],
        maps: {
          basecolor: "assets/metal/mid/plain/basecolor.png",
          normal: "assets/metal/mid/plain/normal.png",
          roughness: "assets/metal/mid/plain/roughness.png",
          metallic: "assets/metal/mid/plain/metallic.png",
        },
      },
      {
        id: "brushed", resolution: [64, 64],
        maps: {
          basecolor: "assets/metal/mid/brushed/basecolor.png",
          normal: "assets/metal/mid/brushed/normal.png",
          roughness: "assets/metal/mid/brushed/roughness.png",
          metallic: "assets/metal/mid/brushed/metallic.png",
          ...(packed ? { metallicRoughness: PACKED } : {}),
        },
      },
    ],
  };
  return { theme: "test", entries: { [KEY]: entry } };
}

function surface() {
  const builder = new MeshBuilder();
  builder.addQuad(KEY, [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]]);
  const doc = createDocument(builder);
  doc.getRoot().listMaterials()[0]!.setExtras({ materialVariant: "brushed" });
  return doc;
}

interface TextureInfo {
  index: number;
  extensions?: { KHR_texture_transform?: { scale: [number, number] } };
}

interface ExportJson {
  images: { uri?: string; bufferView?: number }[];
  textures: { source: number }[];
  materials: {
    pbrMetallicRoughness: {
      baseColorTexture: TextureInfo;
      metallicRoughnessTexture?: TextureInfo;
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }[];
}

describe("packed material response", () => {
  it("exports the selected packed map for preloaded browser themes and Three.js reads it as linear data", async () => {
    const doc = surface();
    expect(await textureDocument(doc, "test", { theme: theme(), baseUrl: BASE_URL }))
      .toEqual({ mode: "external", materials: 1, baseUrl: BASE_URL });
    const bytes = await writeGlb(doc);
    const json = glbJson(bytes) as unknown as ExportJson;
    const pbr = json.materials[0]!.pbrMetallicRoughness;
    expect(pbr.metallicRoughnessTexture).toBeDefined();
    const packed = pbr.metallicRoughnessTexture!;
    expect(json.images[json.textures[packed.index]!.source]!.uri).toBe(`${BASE_URL}/${PACKED}`);
    expect(packed.extensions).toEqual(pbr.baseColorTexture.extensions);
    expect(packed.extensions!.KHR_texture_transform!.scale).toEqual([0.5, 0.5]);
    expect(pbr.metallicFactor ?? 1).toBe(1);
    expect(pbr.roughnessFactor ?? 1).toBe(1);

    // Replace only image transport; material interpretation uses the preview's real loader.
    vi.stubGlobal("self", globalThis);
    const manager = new LoadingManager();
    const imageLoader = new TextureLoader(manager);
    vi.spyOn(imageLoader, "load").mockImplementation((_url, loaded) => {
      const texture = new Texture<HTMLImageElement>();
      loaded?.(texture);
      return texture;
    });
    manager.addHandler(/\.png$/, imageLoader);
    const gltf = await new GLTFLoader(manager).parseAsync(Uint8Array.from(bytes).buffer, "");
    let material: MeshStandardMaterial | undefined;
    gltf.scene.traverse((node) => {
      if (node instanceof Mesh) material = node.material as MeshStandardMaterial;
    });
    expect(material).toBeDefined();
    expect(material!.roughnessMap!.source).toBe(material!.metalnessMap!.source);
    expect(material!.roughnessMap!.colorSpace).toBe(NoColorSpace);
    expect(material!.metalnessMap!.colorSpace).toBe(NoColorSpace);
    expect(material!.map!.colorSpace).toBe(SRGBColorSpace);
    expect(material!.roughnessMap!.repeat.toArray()).toEqual([0.5, 0.5]);
    expect([material!.roughness, material!.metalness]).toEqual([1, 1]);
  });

  it("embeds the packed PNG unchanged through the disk-backed public texture entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "urbe-packed-materials-"));
    tempDirs.push(dir);
    const index = theme();
    const themeDir = join(dir, "themes", "test");
    for (const variant of index.entries[KEY]!.variants) {
      for (const path of Object.values(variant.maps)) {
        const target = join(themeDir, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, PACKED_PNG);
      }
    }
    writeFileSync(join(themeDir, "theme.json"), JSON.stringify(index));
    const doc = surface();
    expect(await textureDocument(doc, "test", { dir, mode: "embed" }))
      .toEqual({ mode: "embedded", materials: 1 });
    const bytes = await writeGlb(doc);
    const json = glbJson(bytes) as unknown as ExportJson;
    const packed = json.materials[0]!.pbrMetallicRoughness.metallicRoughnessTexture;
    expect(packed).toBeDefined();
    const image = json.images[json.textures[packed!.index]!.source]!;
    expect(image.bufferView).toBeTypeOf("number");
    expect(image.uri).toBeUndefined();
    const material = (await readGlbBytes(bytes)).getRoot().listMaterials()[0]!;
    expect(Buffer.from(material.getMetallicRoughnessTexture()!.getImage()!)).toEqual(PACKED_PNG);
    expect([material.getRoughnessFactor(), material.getMetallicFactor()]).toEqual([1, 1]);
  });

  it("keeps authored scalar fallback when a selected legacy variant has no packed map", async () => {
    const doc = surface();
    await textureDocument(doc, "test", { theme: theme(false), baseUrl: BASE_URL });
    const json = glbJson(await writeGlb(doc)) as unknown as ExportJson;
    expect(json.materials[0]!.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0.4, roughnessFactor: 0.65 });
    expect(json.materials[0]!.pbrMetallicRoughness.metallicRoughnessTexture).toBeUndefined();
    expect(json.images).toHaveLength(2);
  });
});
