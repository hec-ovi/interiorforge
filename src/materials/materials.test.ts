import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { glbJson } from "../glb/io.js";
import { generateInterior } from "../index.js";
import type { MaterialEntry, ThemeIndex } from "./theme.js";

const THEME = "cyberpunk";
const TIER = "mid";
/** kinds a fixture building emits: exterior shell plus interior surfaces and furniture */
const KINDS = [
  "wall", "floor-slab", "plaster", "tile", "wood", "carpet", "rubber", "concrete", "metal",
  "elevator_door", "fabric", "glass", "light-fixture", "signage",
];
const TILE_SIZE: [number, number] = [3, 2];
/** 1x1 png, so embedded output carries real image bytes */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A materials database with the same shape as ../../materials, so the box is tested
 *  against the real resolution path without depending on that box being present. */
function writeThemeDatabase(kinds: string[] = KINDS): string {
  const dir = mkdtempSync(join(tmpdir(), "urbe-materials-"));
  const themeDir = join(dir, "themes", THEME);
  const entries: Record<string, MaterialEntry> = {};
  for (const kind of kinds) {
    const key = `${THEME}/${kind}/${TIER}`;
    const maps = { basecolor: "basecolor.png", normal: "normal.png", ao: "ao.png" };
    const assets = join(themeDir, "assets", kind, TIER, "1");
    mkdirSync(assets, { recursive: true });
    for (const file of Object.values(maps)) writeFileSync(join(assets, file), PNG);
    entries[key] = {
      key,
      alignment: kind === "elevator_door" ? "exact" : "tile",
      ...(kind === "elevator_door" ? {} : { tiling: { worldSize: TILE_SIZE } }),
      physical: { metallicFactor: kind === "metal" ? 1 : 0, roughnessFactor: 0.6 },
      variants: [{
        id: "1",
        resolution: [64, 64],
        maps: Object.fromEntries(
          Object.entries(maps).map(([slot, file]) => [slot, `assets/${kind}/${TIER}/1/${file}`]),
        ) as MaterialEntry["variants"][number]["maps"],
      }],
    };
  }
  const index: ThemeIndex = { theme: THEME, entries };
  writeFileSync(join(themeDir, "theme.json"), JSON.stringify(index));
  return dir;
}

const fixture = () => makeFixture({ seed: 8, floors: 4, theme: THEME, tier: TIER });

interface GlbImages {
  images?: { uri?: string; bufferView?: number }[];
  materials?: {
    name: string;
    pbrMetallicRoughness?: {
      baseColorTexture?: { extensions?: { KHR_texture_transform?: { scale?: [number, number] } } };
    };
  }[];
}

describe("finished interior", () => {
  it("resolves every material key against the database as external map URIs", async () => {
    const dir = writeThemeDatabase();
    const fix = fixture();
    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc,
      textures: { dir, baseUrl: "/materials/themes/cyberpunk" },
    });
    expect(result.textures).toMatchObject({ mode: "external", baseUrl: "/materials/themes/cyberpunk" });
    expect(result.textures.materials).toBeGreaterThan(5);

    const json = glbJson(result.glb) as GlbImages;
    expect(json.images!.length).toBeGreaterThan(0);
    for (const image of json.images!) {
      expect(image.uri).toMatch(/^\/materials\/themes\/cyberpunk\/assets\/[a-z_-]+\/mid\/1\/\w+\.png$/);
      expect(image.bufferView).toBeUndefined();
    }
    // world-meter UVs: a tiled map repeats once per worldSize meters, an exact one is 0..1
    const tiled = json.materials!.find((m) => m.name.endsWith("/tile/mid"))!;
    expect(tiled.pbrMetallicRoughness!.baseColorTexture!.extensions!.KHR_texture_transform!.scale)
      .toEqual([1 / TILE_SIZE[0], 1 / TILE_SIZE[1]]);
    const exact = json.materials!.find((m) => m.name.endsWith("/elevator_door/mid"))!;
    expect(exact.pbrMetallicRoughness!.baseColorTexture!.extensions).toBeUndefined();

    const again = fixture();
    const twice = await generateInterior(again.request, {
      shellDoc: again.shellDoc,
      textures: { dir, baseUrl: "/materials/themes/cyberpunk" },
    });
    expect(Buffer.from(twice.glb).equals(Buffer.from(result.glb))).toBe(true);
  });

  it("embeds the maps into one self-contained GLB", async () => {
    const dir = writeThemeDatabase();
    const fix = fixture();
    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc, textures: { mode: "embed", dir },
    });
    expect(result.textures.mode).toBe("embedded");
    const json = glbJson(result.glb) as GlbImages;
    expect(json.images!.length).toBeGreaterThan(0);
    for (const image of json.images!) {
      expect(image.bufferView).toBeTypeOf("number");
      expect(image.uri).toBeUndefined();
    }
  });

  it("keys-only output carries the material keys and no images", async () => {
    const fix = fixture();
    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc, textures: { mode: "keys" },
    });
    expect(result.textures).toEqual({ mode: "keys", materials: 0 });
    const json = glbJson(result.glb) as GlbImages;
    expect(json.images).toBeUndefined();
    expect(json.materials!.every((m) => /^cyberpunk\/[a-z_-]+\/mid$/.test(m.name))).toBe(true);
  });

  it("names the key the database cannot resolve", async () => {
    const dir = writeThemeDatabase(KINDS.filter((k) => k !== "carpet"));
    const fix = fixture();
    await expect(generateInterior(fix.request, { shellDoc: fix.shellDoc, textures: { dir } }))
      .rejects.toMatchObject({ code: "E_MATERIAL_UNRESOLVED", message: /carpet/ });
  });

  it("runs standalone: no materials database means keys, not a failure", async () => {
    const fix = fixture();
    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc, textures: { dir: join(tmpdir(), "urbe-no-materials-here") },
    });
    expect(result.textures.mode).toBe("keys");
    expect(result.glb.length).toBeGreaterThan(1000);
  });
});
