import type { ModuleCandidate } from "./optimizer-types";

const MAX_MODULES = 4_096;

export function extractOptimizerModules(value: unknown): ModuleCandidate[] {
  const inventory = findInventory(value);
  if (!inventory) {
    throw new Error(
      "JSON must be an inventory array, a modules object, or a profile envelope containing body.modules.inventory.",
    );
  }
  if (inventory.length === 0) {
    throw new Error("The module inventory is empty.");
  }
  if (inventory.length > MAX_MODULES) {
    throw new Error(`The module inventory exceeds the ${MAX_MODULES} item limit.`);
  }
  return inventory.map((entry, index) => normalizeModule(entry, index));
}

export function safeDemoModules(): ModuleCandidate[] {
  const attributes = [
    [1110, 1111],
    [1110, 2104],
    [1111, 1409],
    [1112, 1410],
    [1113, 2105],
    [1114, 2404],
    [1205, 2204],
    [1206, 2205],
    [1307, 2304],
    [1308, 2405],
    [1407, 2406],
    [1408, 1110],
  ];
  return attributes.map((parts, index) => ({
    instance_id: (9_007_199_254_740_993n + BigInt(index) * 2n).toString(),
    config_id: 5_500_101 + (index % 4),
    quality: 5,
    parts: parts.map((partId, partIndex) => ({
      part_id: partId,
      initial_link_points: 3 + ((index + partIndex * 3) % 8),
    })),
  }));
}

function findInventory(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.inventory)) return value.inventory;
  if (Array.isArray(value.modules)) return value.modules;
  if (isRecord(value.modules) && Array.isArray(value.modules.inventory)) {
    return value.modules.inventory;
  }
  if (
    isRecord(value.body) &&
    isRecord(value.body.modules) &&
    Array.isArray(value.body.modules.inventory)
  ) {
    return value.body.modules.inventory;
  }
  return undefined;
}

function normalizeModule(value: unknown, index: number): ModuleCandidate {
  if (!isRecord(value)) {
    throw new Error(`Module ${index + 1} must be an object.`);
  }
  if (typeof value.instance_id !== "string" || value.instance_id.trim() === "") {
    throw new Error(`Module ${index + 1} must have a string instance_id.`);
  }
  const configId = integer(value.config_id, `Module ${index + 1} config_id`);
  if (!Array.isArray(value.parts)) {
    throw new Error(`Module ${value.instance_id} must have a parts array.`);
  }
  const quality =
    value.quality == null
      ? null
      : integer(value.quality, `Module ${value.instance_id} quality`);
  return {
    instance_id: value.instance_id,
    config_id: configId,
    quality,
    parts: value.parts.map((part, partIndex) => {
      if (!isRecord(part)) {
        throw new Error(
          `Module ${value.instance_id} part ${partIndex + 1} must be an object.`,
        );
      }
      return {
        part_id: integer(
          part.part_id,
          `Module ${value.instance_id} part ${partIndex + 1} part_id`,
        ),
        initial_link_points: integer(
          part.initial_link_points,
          `Module ${value.instance_id} part ${partIndex + 1} initial_link_points`,
        ),
      };
    }),
  };
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
