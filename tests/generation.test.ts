import { beforeAll, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { coreFeasibility, findPath, generateFloorInteriors, generateInterior, makeFixture } from "../src/index.js";
import type { InteriorResult } from "../src/index.js";
import floorSchema from "../schemas/floor.schema.json";
import npcSchema from "../schemas/npc.schema.json";

const options = { textures: { mode: "keys" as const }, assets: false, floorGlbs: true };
const fixture = () => makeFixture({ seed: "demo", floors: 2 });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let result: InteriorResult;

beforeAll(async () => {
  const f = fixture();
  result = await generateInterior(f.request, { ...options, shellDoc: f.shellDoc });
}, 30_000);

it("returns deterministic furnished geometry, schema-valid floor/NPC data and executable routes", async () => {
  const f = fixture();
  const again = await generateInterior(f.request, { ...options, shellDoc: f.shellDoc });
  expect(Buffer.from(again.glb).equals(Buffer.from(result.glb))).toBe(true);
  expect(again.floors).toEqual(result.floors);
  expect(again.npc).toEqual(result.npc);
  const ajv = new Ajv2020({ strict: false });
  const floorValid = ajv.compile(floorSchema), npcValid = ajv.compile(npcSchema);
  for (const floor of result.floors) expect(floorValid(floor), JSON.stringify(floorValid.errors)).toBe(true);
  expect(npcValid(result.npc), JSON.stringify(npcValid.errors)).toBe(true);
  expect(result.floors.map(floor => floor.floor)).toEqual(f.request.blueprint.floors.map(floor => floor.index));
  expect(result.floors.every(floor => floor.rooms.length && floor.furniture.length && floor.lights.length)).toBe(true);
  const document = await io.readBinary(result.glb);
  expect(document.getRoot().listMeshes().length).toBeGreaterThan(0);
  expect(result.textures).toEqual({ mode: "keys", materials: 0 });
  const npc = JSON.parse(JSON.stringify(result.npc));
  const entrance = npc.anchors.find((a: {kind: string}) => a.kind === "entrance");
  const upper = npc.anchors.find((a: {floor: number; kind: string}) => a.floor === 1 && a.kind === "stair_entry");
  expect(entrance).toBeDefined();
  expect(upper).toBeDefined();
  const route = findPath(npc, entrance, upper);
  expect(route?.some(leg => leg.kind === "ride")).toBe(true);
  expect(findPath(npc, entrance, { floor: 999, position: [0, 0] })).toBeNull();
}, 30_000);

it("exports identical floor bands without mutating the supplied shell", async () => {
  const f = fixture();
  const shell = await io.writeBinary(f.shellDoc);
  const streamed = await generateFloorInteriors(f.request, { ...options, shellDoc: f.shellDoc });
  expect(streamed).not.toHaveProperty("glb");
  expect(streamed.floors).toEqual(result.floors);
  expect(streamed.npc).toEqual(result.npc);
  for (const [floor, bytes] of streamed.floorGlbs) {
    expect(Buffer.from(bytes).equals(Buffer.from(result.floorGlbs!.get(floor)!))).toBe(true);
  }
  expect(Buffer.from(await io.writeBinary(f.shellDoc)).equals(Buffer.from(shell))).toBe(true);
  for (const bytes of streamed.floorGlbs.values()) {
    expect((await io.readBinary(bytes)).getRoot().listMeshes().length).toBeGreaterThan(0);
  }
}, 30_000);

it("accepts numeric seeds, explicit spans, a material theme and an asset reader", async () => {
  const f = makeFixture({ seed: 8, floors: 2, width: 30, depth: 24, type: "residential", tier: "high_rich", theme: "test" });
  f.request.assignments = [{ floor: 0, kind: "residence_studio", spans: 2 }];
  let reads = 0;
  const generated = await generateInterior(f.request, { shellDoc: f.shellDoc,
    textures: { mode: "keys" }, assets: { read: async () => { reads++; throw new Error("model unavailable"); } } });
  expect(reads).toBeGreaterThan(0);
  expect(generated.floors[0]!.kind).toBe("residence_studio");
  expect(generated.floors[1]!.rooms.length === 0 || generated.floors[1]!.mezzanineOf !== undefined).toBe(true);
  expect((await io.readBinary(generated.glb)).getRoot().listMaterials().some(m => m.getName().startsWith("test/"))).toBe(true);
}, 30_000);

it("rejects invalid requests with E_BLUEPRINT_INVALID", async () => {
  await expect(generateInterior({ seed: -1 })).rejects.toMatchObject({ code: "E_BLUEPRINT_INVALID" });
});

it("rejects an unreadable shell with E_SHELL_MISMATCH", async () => {
  const f = fixture();
  f.request.shellGlb = "missing-shell.glb";
  await expect(generateInterior(f.request)).rejects.toMatchObject({ code: "E_SHELL_MISMATCH" });
});

it("rejects incomplete assignments with E_ASSIGNMENT_INVALID", async () => {
  const f = fixture();
  f.request.assignments = [{ floor: 0, kind: "lobby" }];
  await expect(generateInterior(f.request, { shellDoc: f.shellDoc })).rejects.toMatchObject({ code: "E_ASSIGNMENT_INVALID" });
});

it("rejects an impossible core with E_FLOOR_TOO_SMALL", async () => {
  const f = makeFixture({ floors: 1, width: 6, depth: 6 });
  await expect(generateInterior(f.request, { shellDoc: f.shellDoc })).rejects.toMatchObject({ code: "E_FLOOR_TOO_SMALL" });
});

it("rejects a roof door without standing headroom with E_UNREACHABLE_SPACE", async () => {
  const f = fixture(), blueprint = f.request.blueprint;
  const shaft = coreFeasibility(blueprint).placement!.stairA;
  const last = blueprint.floors.at(-1)!;
  blueprint.roof = { elevation: last.elevation + last.height, outline: last.outline,
    bulkhead: { ...shaft, housingHeight: 3, doorNormal: [-shaft.axis[1], shaft.axis[0]], doorWidth: 1, doorHeight: 2 } };
  const roof = makeFixture({ blueprint });
  await expect(generateInterior(roof.request, { ...options, shellDoc: roof.shellDoc })).rejects.toMatchObject({ code: "E_UNREACHABLE_SPACE" });
}, 30_000);

it("rejects an unresolved catalog with E_MATERIAL_UNRESOLVED", async () => {
  const f = fixture();
  await expect(generateInterior(f.request, { shellDoc: f.shellDoc, assets: false,
    textures: { theme: { theme: "cyberpunk", entries: {} } } }))
    .rejects.toMatchObject({ code: "E_MATERIAL_UNRESOLVED" });
}, 30_000);
