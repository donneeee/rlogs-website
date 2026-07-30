import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { extractOptimizerModules, safeDemoModules } from "./optimizer-data";

describe("optimizer module input", () => {
  it("extracts the complete sanitized MarieRose inventory", () => {
    const source = readFileSync(
      new URL(
        "../../../public/fixtures/marierose-asteria-capture.v1.json",
        import.meta.url,
      ),
      "utf8",
    );
    const modules = extractOptimizerModules(JSON.parse(source));

    expect(modules).toHaveLength(649);
    expect(Object.keys(modules[0]).sort()).toEqual([
      "config_id",
      "instance_id",
      "parts",
      "quality",
    ]);
    expect(typeof modules[0].instance_id).toBe("string");
  });

  it("keeps generated demo IDs above the safe integer limit as strings", () => {
    const modules = safeDemoModules();

    expect(modules).toHaveLength(12);
    expect(modules[0].instance_id).toBe("9007199254740993");
    expect(typeof modules[0].instance_id).toBe("string");
  });

  it("rejects numeric instance IDs instead of accepting precision loss", () => {
    expect(() =>
      extractOptimizerModules([
        {
          instance_id: 9_007_199_254_740_992,
          config_id: 5_500_101,
          parts: [
            { part_id: 1110, initial_link_points: 4 },
            { part_id: 1111, initial_link_points: 4 },
          ],
        },
      ]),
    ).toThrow("string instance_id");
  });
});
