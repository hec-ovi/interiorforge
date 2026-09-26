import { expect, it } from "vitest";
import { coreFeasibility as source } from "../src/feasibility.js";
import { coreFeasibility as compiled } from "../dist/feasibility.js";
import { findPath } from "../src/nav.js";
import { findPath as compiledPath } from "../dist/nav.js";
import { expandBuilding, generate, makeFixture, makePlacementFixture } from "../src/index.js";

it("the built feasibility entry returns the same fit and no-fit result", () => {
  for (const dimensions of [{ width: 26, depth: 20 }, { width: 6, depth: 6 }]) {
    const { request } = makeFixture({ ...dimensions, floors: 1 });
    const result = compiled(request.blueprint);
    expect(result).toEqual(source(request.blueprint));
    expect(result.fits).toBe(dimensions.width === 26);
    if (result.fits) expect(result.placement?.stairA).toBeDefined();
    else expect(result.blocker).toBeDefined();
  }
});

it("the built navigation entry routes a generated building exactly as the source does", async () => {
  const { npc } = expandBuilding(await generate(makePlacementFixture({ seed: "nav-entry", floors: 4, width: 32, depth: 24 })));
  const entrance = npc.anchors.find(a => a.kind === "entrance")!, top = npc.anchors.find(a => a.floor === 3 && a.kind !== "stair_entry")!;
  for (const [from, to] of [[entrance, top], [top, entrance], [entrance, { floor: 9, position: [0, 0] }]] as const) {
    const request = { nav: npc.nav, from: { floor: from.floor, x: from.position[0], z: from.position[1] },
      to: { floor: to.floor, x: to.position[0], z: to.position[1] } };
    expect(compiledPath(request)).toEqual(findPath(request));
  }
  const up = compiledPath({ nav: npc.nav, from: { floor: 0, x: entrance.position[0], z: entrance.position[1] },
    to: { floor: 3, x: top.position[0], z: top.position[1] } });
  expect("legs" in up && up.legs.map(leg => leg.floor)[0]).toBe(0);
  expect("legs" in up && up.legs.at(-1)!.floor).toBe(3);
});
