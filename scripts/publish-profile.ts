import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type PublishedProfileEntry,
  type PublishedProfileIndex,
  validatePublishedProfileIndex,
  validatePublishedProfileSlug,
} from "../src/contracts/published-profiles.ts";
import {
  type JsonValue,
  validateWebsitePayload,
} from "../src/contracts/website-payload.ts";

export interface PublishProfileOptions {
  input: string;
  slug: string;
  label?: string;
  websiteRoot?: string;
  confirmPublic?: boolean;
  dryRun?: boolean;
}

export interface PublishProfileResult {
  entry: PublishedProfileEntry;
  profilePath: string;
  indexPath: string;
  wroteFiles: boolean;
}

const defaultWebsiteRoot = fileURLToPath(new URL("../", import.meta.url));

export async function publishProfilePackage(
  options: PublishProfileOptions,
): Promise<PublishProfileResult> {
  const slugError = validatePublishedProfileSlug(options.slug);
  if (slugError) throw new Error(`${slugError}.`);
  if (!options.confirmPublic && !options.dryRun) {
    throw new Error(
      "refusing to publish without --confirm-public; only sanitized, user-approved data belongs on the public site",
    );
  }

  const websiteRoot = resolve(options.websiteRoot ?? defaultWebsiteRoot);
  const inputPath = resolve(options.input);
  const source = await readFile(inputPath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown JSON error";
    throw new Error(`input is not valid JSON: ${message}`);
  }

  const validation = validateWebsitePayload(value);
  if (!validation.envelope) {
    throw new Error(`profile envelope failed validation: ${validation.errors.join(" ")}`);
  }
  const envelope = validation.envelope;
  if (envelope.payload_kind !== "character-profile") {
    throw new Error('payload_kind must be "character-profile".');
  }

  const publishedSource = source.replace(/\r\n?/g, "\n");
  const encoded = Buffer.from(publishedSource, "utf8");
  const character = recordAt(envelope.body, "character");
  const displayName = stringAt(envelope.body, "display_name");
  const characterId =
    stringAt(character, "character_id") ?? envelope.routing["character-id"];
  if (!characterId) throw new Error("profile is missing its public character ID.");

  const entry: PublishedProfileEntry = {
    slug: options.slug,
    label: normalizedLabel(options.label ?? displayName ?? options.slug),
    game_plugin_id: envelope.game_plugin_id,
    payload_schema_id: envelope.payload_schema_id,
    payload_schema_version: envelope.payload_schema_version,
    deployment: requiredRoute(envelope.routing, "deployment"),
    region: requiredRoute(envelope.routing, "region"),
    realm: requiredRoute(envelope.routing, "realm"),
    character_id: characterId,
    payload_path: `${options.slug}/profile.v${envelope.payload_schema_version}.json`,
    payload_sha256: createHash("sha256").update(encoded).digest("hex"),
    payload_bytes: encoded.byteLength,
  };

  const profilesRoot = resolve(websiteRoot, "public", "profiles");
  const indexPath = resolve(profilesRoot, "index.v1.json");
  const profilePath = resolve(profilesRoot, entry.payload_path);
  const index = await readIndex(indexPath);
  const existing = index.profiles.find((candidate) => candidate.slug === entry.slug);
  if (existing && existing.character_id !== entry.character_id) {
    throw new Error(
      `slug "${entry.slug}" already belongs to character ${existing.character_id}; choose a new slug`,
    );
  }
  index.profiles = [
    ...index.profiles.filter((candidate) => candidate.slug !== entry.slug),
    entry,
  ].sort((left, right) => left.slug.localeCompare(right.slug));

  const indexValidation = validatePublishedProfileIndex(index);
  if (!indexValidation.index) {
    throw new Error(`generated profile index is invalid: ${indexValidation.errors.join(" ")}`);
  }

  if (!options.dryRun) {
    await atomicWrite(profilePath, publishedSource);
    await atomicWrite(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  return { entry, profilePath, indexPath, wroteFiles: !options.dryRun };
}

async function readIndex(path: string): Promise<PublishedProfileIndex> {
  try {
    const source = await readFile(path, "utf8");
    const result = validatePublishedProfileIndex(JSON.parse(source));
    if (!result.index) {
      throw new Error(result.errors.join(" "));
    }
    return result.index;
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        schema_version: 1,
        publication_mode: "developer-git",
        profiles: [],
      };
    }
    const message = error instanceof Error ? error.message : "unknown index error";
    throw new Error(`could not read the existing profile index: ${message}`);
  }
}

async function atomicWrite(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, source, "utf8");
  await rename(temporaryPath, path);
}

function requiredRoute(
  routing: Record<string, string>,
  key: string,
): string {
  const value = routing[key];
  if (!value) throw new Error(`profile routing is missing "${key}".`);
  return value;
}

function normalizedLabel(value: string): string {
  const label = value.trim();
  if (label.length === 0 || label.length > 80) {
    throw new Error("profile label must contain 1-80 characters.");
  }
  return label;
}

function recordAt(
  value: Record<string, JsonValue>,
  key: string,
): Record<string, JsonValue> {
  const child = value[key];
  return typeof child === "object" && child !== null && !Array.isArray(child)
    ? child
    : {};
}

function stringAt(
  value: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const child = value[key];
  return typeof child === "string" ? child : undefined;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseArguments(arguments_: string[]): PublishProfileOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--confirm-public" || argument === "--dry-run") {
      flags.add(argument);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument "${argument}".`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const input = values.get("--input");
  const slug = values.get("--slug");
  if (!input || !slug) {
    throw new Error(
      "usage: npm run profile:publish -- --input <sanitized-envelope.json> --slug <public-slug> [--label <name>] --confirm-public",
    );
  }
  return {
    input,
    slug,
    label: values.get("--label"),
    confirmPublic: flags.has("--confirm-public"),
    dryRun: flags.has("--dry-run"),
  };
}

async function main(): Promise<void> {
  const result = await publishProfilePackage(parseArguments(process.argv.slice(2)));
  const action = result.wroteFiles ? "Published" : "Validated";
  console.log(`${action} ${result.entry.label} as "${result.entry.slug}".`);
  console.log(`Payload: ${result.profilePath}`);
  console.log(`Index:   ${result.indexPath}`);
  console.log(
    `URL:     https://donneeee.github.io/rlogs-website/?profile=${result.entry.slug}`,
  );
  if (result.wroteFiles) {
    console.log("Run npm test, npm run check, and npm run build before committing.");
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
