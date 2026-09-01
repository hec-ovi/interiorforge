/** CLI: generates a building interior into an output directory.
 *
 *  npm run generate -- [--out out] [--seed 1] [--floors 12] [--basements 0]
 *                      [--type offices] [--tier mid] [--theme cyberpunk] [--request path.json]
 *                      [--embed] [--keys-only] [--materials DIR] [--materials-base URI]
 *                      [--floor-glbs]
 *
 *  Without --request, a fixture shell is fabricated (standalone mode); with it, the JSON
 *  file must be a full InteriorRequest whose shellGlb path resolves on disk.
 *
 *  Textures come from the materials database by default, as external URIs relative to the
 *  output directory. --embed packs the maps into one self-contained GLB; --keys-only leaves
 *  the material keys for a consumer that resolves them itself. --floor-glbs also writes
 *  each floor band's interior as floors/NNN.glb next to its JSON.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { makeFixture } from "./blueprint/fixture.js";
import type { BuildingType, InteriorRequest, Tier } from "./core/types.js";
import { writeGlb } from "./glb/io.js";
import { generateInterior, type TextureOptions } from "./index.js";
import { materialsDir } from "./materials/load.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** External maps are addressed from the output folder, so the GLB stays portable next to it. */
function textureOptions(out: string, theme: string): TextureOptions {
  const dir = arg("materials", "") || undefined;
  if (flag("keys-only")) return { mode: "keys" };
  const themeDir = join(materialsDir(dir), "themes", theme);
  const baseUrl = arg("materials-base", "") || relative(resolve(out), themeDir) || ".";
  return flag("embed") ? { mode: "embed", dir } : { mode: "external", dir, baseUrl };
}

async function main(): Promise<void> {
  const out = arg("out", "out");
  await mkdir(join(out, "floors"), { recursive: true });

  let request: InteriorRequest;
  let shellDoc;
  const requestPath = arg("request", "");
  if (requestPath) {
    request = JSON.parse(await readFile(requestPath, "utf8")) as InteriorRequest;
  } else {
    const fixture = makeFixture({
      seed: Number(arg("seed", "1")),
      floors: Number(arg("floors", "12")),
      basements: Number(arg("basements", "0")),
      type: arg("type", "offices") as BuildingType,
      tier: arg("tier", "mid") as Tier,
      theme: arg("theme", "cyberpunk"),
    });
    request = fixture.request;
    shellDoc = fixture.shellDoc;
    const shellPath = join(out, "shell.glb");
    await writeFile(shellPath, await writeGlb(fixture.shellDoc));
    await writeFile(join(out, "request.json"), JSON.stringify({ ...request, shellGlb: shellPath }, null, 1));
    request = { ...request, shellGlb: shellPath };
  }

  const result = await generateInterior(request, {
    ...(shellDoc ? { shellDoc } : {}),
    textures: textureOptions(out, request.materialTheme),
    floorGlbs: flag("floor-glbs"),
  });
  await writeFile(join(out, "building.glb"), result.glb);
  for (const floor of result.floors) {
    const tag = floor.floor < 0 ? `m${-floor.floor}` : String(floor.floor).padStart(3, "0");
    await writeFile(join(out, "floors", `${tag}.json`), JSON.stringify(floor, null, 1));
    const glb = result.floorGlbs?.get(floor.floor);
    if (glb) await writeFile(join(out, "floors", `${tag}.glb`), glb);
  }
  await writeFile(join(out, "npc.json"), JSON.stringify(result.npc, null, 1));
  const textures = result.textures.mode === "keys"
    ? "material keys only"
    : `${result.textures.materials} materials ${result.textures.mode}${result.textures.baseUrl ? ` at ${result.textures.baseUrl}` : ""}`;
  console.log(
    `wrote ${out}/building.glb (${(result.glb.length / 1e6).toFixed(2)} MB, ${textures}), ` +
    `${result.floors.length} floor JSONs, npc.json ` +
    `(${result.npc.anchors.length} anchors, ${result.npc.roles.length} roles)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
