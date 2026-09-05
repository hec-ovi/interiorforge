import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { expect, it } from "vitest";
import defaults from "../schemas/core-feasibility.json" with { type: "json" };

it("runs the same compiled preflight in native Node and a browser bundle", async () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.feasibility.json"], { cwd });
  const blueprint = {
    buildingId: "portable-preflight", coreFrame: { anglesDeg: [0, 90] },
    facade: { wallDepth: 0.23, coreAdjacency: defaults.constants.coreAdjacency },
    floors: [{ index: 0, kind: "lobby", elevation: 0, height: 3.9,
      outline: [[0, 0], [30, 0], [30, 20], [0, 20]],
      openings: [{ id: "window", kind: "window", edge: 1, offset: 1, width: 18, height: 2, sill: 1 }],
    }],
  };
  const native = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval",
    `import {coreFeasibility} from './dist/feasibility.js'; console.log(JSON.stringify(coreFeasibility(${JSON.stringify(blueprint)})));`,
  ], { cwd, encoding: "utf8" }));
  expect(native.fits).toBe(true);
  const built = await build({
    root: cwd, configFile: false, logLevel: "silent",
    build: { write: false, emptyOutDir: false, lib: { entry: "dist/feasibility.js", formats: ["es"], fileName: "feasibility" } },
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap(result => {
    if (!("output" in result)) throw new Error("preflight build unexpectedly opened a watcher");
    return result.output;
  });
  const chunk = output.find(item => item.type === "chunk");
  expect(chunk?.type).toBe("chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("preflight build emitted no module");
  expect(chunk.imports).toEqual([]);
  expect(chunk.dynamicImports).toEqual([]);
  const browser = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  expect(browser.coreFeasibility(blueprint)).toEqual(native);
});
