import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  combinationCount,
  DEFAULT_EXACT_COMBINATION_LIMIT,
  extractOptimizerInput,
  extractOptimizerModules,
  optimizerComputeBudget,
  safeDemoModules,
} from "./optimizer-data";

describe("optimizer module input", () => {
  it("extracts the complete sanitized MarieRose inventory", () => {
    const source = readFileSync(
      new URL(
        "../../../public/profiles/marierose/profile.v1.json",
        import.meta.url,
      ),
      "utf8",
    );
    const input = extractOptimizerInput(JSON.parse(source));
    const { modules } = input;

    expect(modules).toHaveLength(649);
    expect(input.currentInstanceIds).toEqual([
      "14874",
      "14949",
      "11803",
      "15805",
      "10106",
    ]);
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

  it("counts exact combinations without JavaScript precision loss", () => {
    expect(combinationCount(648, 5)).toBe(937_510_500_024n);
    expect(combinationCount(12, 4)).toBe(495n);
    expect(combinationCount(12, 4)).toBeLessThan(
      DEFAULT_EXACT_COMBINATION_LIMIT,
    );
  });

  it("chooses conservative device-aware beam budgets", () => {
    expect(
      optimizerComputeBudget({
        hardwareConcurrency: 2,
        deviceMemoryGb: 2,
        mobile: true,
      }),
    ).toEqual({ beamWidth: 64, label: "constrained" });
    expect(
      optimizerComputeBudget({
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
        mobile: true,
      }),
    ).toEqual({ beamWidth: 128, label: "mobile" });
    expect(
      optimizerComputeBudget({
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
      }),
    ).toEqual({ beamWidth: 512, label: "thorough" });
    expect(
      optimizerComputeBudget({
        hardwareConcurrency: 16,
        deviceMemoryGb: 16,
      }),
    ).toEqual({ beamWidth: 512, label: "workstation" });
    expect(optimizerComputeBudget({})).toEqual({
      beamWidth: 128,
      label: "constrained",
    });
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

  it("rejects an equipped module that is missing from the inventory", () => {
    expect(() =>
      extractOptimizerInput({
        inventory: [
          {
            instance_id: "present",
            config_id: 5_500_101,
            parts: [
              { part_id: 1110, initial_link_points: 4 },
              { part_id: 1111, initial_link_points: 4 },
            ],
          },
        ],
        equipped_slots: { 1: "missing" },
      }),
    ).toThrow("not present");
  });
});
