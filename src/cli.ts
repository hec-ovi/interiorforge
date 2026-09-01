/** CLI: generates a building interior into an output directory.
 *
 *  npm run generate -- [--out out] [--seed 1] [--floors 12] [--basements 0]
 *                      [--type office] [--tier standard] [--request path.json]
 *
 *  Without --request, a fixture shell is fabricated (standalone mode); with it, the JSON
 *  file must be a full InteriorRequest whose shellGlb path resolves on disk.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeFixture } from "./blueprint/fixture.js";
import type { BuildingType, InteriorRequest, Tier } from "./core/types.js";
import { writeGlb } from "./glb/io.js";
import { generateInterior } from "./index.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
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
      type: arg("type", "office") as BuildingType,
      tier: arg("tier", "standard") as Tier,
    });
    request = fixture.request;
    shellDoc = fixture.shellDoc;
    const shellPath = join(out, "shell.glb");
    await writeFile(shellPath, await writeGlb(fixture.shellDoc));
    await writeFile(join(out, "request.json"), JSON.stringify({ ...request, shellGlb: shellPath }, null, 1));
    request = { ...request, shellGlb: shellPath };
  }

  const result = await generateInterior(request, shellDoc ? { shellDoc } : {});
  await writeFile(join(out, "building.glb"), result.glb);
  for (const floor of result.floors) {
    const tag = floor.floor < 0 ? `m${-floor.floor}` : String(floor.floor).padStart(3, "0");
    await writeFile(join(out, "floors", `${tag}.json`), JSON.stringify(floor, null, 1));
  }
  await writeFile(join(out, "npc.json"), JSON.stringify(result.npc, null, 1));
  console.log(
    `wrote ${out}/building.glb (${(result.glb.length / 1e6).toFixed(2)} MB), ` +
    `${result.floors.length} floor JSONs, npc.json ` +
    `(${result.npc.anchors.length} anchors, ${result.npc.roles.length} roles)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
