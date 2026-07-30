import {
  type PublishedProfileEntry,
  type PublishedProfileIndex,
  validatePublishedProfileIndex,
  validatePublishedProfileSlug,
} from "../../contracts/published-profiles";
import {
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "../../contracts/website-payload";

const publishedProfilesUrl = `${import.meta.env.BASE_URL}profiles/`;
let indexRequest: Promise<PublishedProfileIndex> | undefined;

export interface PublishedProfile {
  entry: PublishedProfileEntry;
  envelope: WebsitePayloadEnvelope;
}

export function loadPublishedProfileIndex(): Promise<PublishedProfileIndex> {
  indexRequest ??= fetchProfileIndex();
  return indexRequest;
}

export async function loadPublishedProfile(slug: string): Promise<PublishedProfile> {
  const slugError = validatePublishedProfileSlug(slug);
  if (slugError) throw new Error(`Invalid published profile slug: ${slugError}.`);

  const index = await loadPublishedProfileIndex();
  const entry = index.profiles.find((candidate) => candidate.slug === slug);
  if (!entry) throw new Error(`Published profile "${slug}" was not found.`);

  const response = await fetch(`${publishedProfilesUrl}${entry.payload_path}`);
  if (!response.ok) {
    throw new Error(`Published profile request failed with HTTP ${response.status}.`);
  }
  const source = await response.text();
  const encoded = new TextEncoder().encode(source);
  if (encoded.byteLength !== entry.payload_bytes) {
    throw new Error(
      `Published profile size mismatch: expected ${entry.payload_bytes}, received ${encoded.byteLength}.`,
    );
  }

  const digest = await sha256(encoded);
  if (digest !== entry.payload_sha256) {
    throw new Error("Published profile digest does not match its package index.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Published profile contains invalid JSON.");
  }
  const result = validateWebsitePayload(value);
  if (!result.envelope) {
    throw new Error(`Published profile failed validation: ${result.errors.join(" ")}`);
  }
  verifyManifestMatchesEnvelope(entry, result.envelope);

  return { entry, envelope: result.envelope };
}

async function fetchProfileIndex(): Promise<PublishedProfileIndex> {
  const response = await fetch(`${publishedProfilesUrl}index.v1.json`);
  if (!response.ok) {
    throw new Error(`Published profile index failed with HTTP ${response.status}.`);
  }
  const result = validatePublishedProfileIndex(await response.json());
  if (!result.index) {
    throw new Error(`Published profile index is invalid: ${result.errors.join(" ")}`);
  }
  return result.index;
}

function verifyManifestMatchesEnvelope(
  entry: PublishedProfileEntry,
  envelope: WebsitePayloadEnvelope,
): void {
  const pairs: Array<[string, string | number | undefined, string | number]> = [
    ["game plug-in", envelope.game_plugin_id, entry.game_plugin_id],
    ["payload schema", envelope.payload_schema_id, entry.payload_schema_id],
    [
      "payload schema version",
      envelope.payload_schema_version,
      entry.payload_schema_version,
    ],
    ["deployment", envelope.routing.deployment, entry.deployment],
    ["region", envelope.routing.region, entry.region],
    ["realm", envelope.routing.realm, entry.realm],
    ["character ID", envelope.routing["character-id"], entry.character_id],
  ];
  const mismatch = pairs.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new Error(
      `Published profile ${mismatch[0]} does not match its package index.`,
    );
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
