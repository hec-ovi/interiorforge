import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import catalog from "./catalog.json" with { type: "json" };

describe("asset catalog schema", () => {
  it("accepts the shipped catalog", () => {
    const schema = JSON.parse(fs.readFileSync(new URL("./schemas/catalog.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    const validate = ajv.compile(schema);
    expect(validate(catalog), JSON.stringify(validate.errors)).toBe(true);
  });
});
