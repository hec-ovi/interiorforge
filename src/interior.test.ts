import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import floorSchema from "../schemas/floor.schema.json" with { type: "json" };
import { generateInterior, makeFixture } from "./index.js";

const fix = makeFixture({ seed: 44, floors: 7, basements: 1 });

describe("generateInterior", () => {
  it("produces a GLB plus schema-valid floor JSONs, byte-identical across runs", async () => {
    const a = await generateInterior(fix.request, { shellDoc: fix.shellDoc });
    const again = makeFixture({ seed: 44, floors: 7, basements: 1 });
    const b = await generateInterior(again.request, { shellDoc: again.shellDoc });
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
    expect(JSON.stringify(a.floors)).toBe(JSON.stringify(b.floors));
    expect(JSON.stringify(a.npc)).toBe(JSON.stringify(b.npc));

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    for (const floor of a.floors) {
      const asJson = JSON.parse(JSON.stringify(floor));
      expect(check(asJson), `floor ${floor.floor}: ${JSON.stringify(check.errors)}`).toBe(true);
    }
    expect(a.floors.filter((f) => f.floor >= 0).every((f) => f.core.elevators.length > 0)).toBe(true);
  });

  it("rejects a malformed request with E_BLUEPRINT_INVALID", async () => {
    await expect(generateInterior({ nonsense: true })).rejects.toMatchObject({ code: "E_BLUEPRINT_INVALID" });
  });

  it("rejects a shell that does not match the blueprint with E_SHELL_MISMATCH", async () => {
    const tiny = makeFixture({ seed: 44, floors: 7, width: 9, depth: 9 });
    await expect(
      generateInterior(fix.request, { shellDoc: tiny.shellDoc }),
    ).rejects.toMatchObject({ code: "E_SHELL_MISMATCH" });
  });
});
