import { expect, it } from "vitest";
import { previewSample } from "./index.js";

it("resolves the authored review and leaves other URL names on the ordinary preview", () => {
  expect(previewSample("luxury")!.views.map(view => view.title)).toEqual(["Kitchen & suite", "Living area", "Lobby salon"]);
  for (const name of [undefined, null, "", "missing", "toString"]) expect(previewSample(name)).toBeUndefined();
});
