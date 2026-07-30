export interface PublishedProfileEntry {
  slug: string;
  label: string;
  game_plugin_id: string;
  payload_schema_id: string;
  payload_schema_version: number;
  deployment: string;
  region: string;
  realm: string;
  character_id: string;
  payload_path: string;
  payload_sha256: string;
  payload_bytes: number;
}

export interface PublishedProfileIndex {
  schema_version: 1;
  publication_mode: "developer-git";
  profiles: PublishedProfileEntry[];
}

export interface PublishedProfileIndexValidation {
  index?: PublishedProfileIndex;
  errors: string[];
}

const PROFILE_INDEX_SCHEMA_VERSION = 1;
const MAX_PROFILE_PAYLOAD_BYTES = 8 * 1024 * 1024;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const digestPattern = /^[a-f0-9]{64}$/;
const payloadPathPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\/profile\.v[1-9][0-9]*\.json$/;

export function validatePublishedProfileSlug(slug: string): string | undefined {
  return slugPattern.test(slug)
    ? undefined
    : "profile slug must contain 1-64 lowercase letters, numbers, or single hyphens";
}

export function validatePublishedProfileIndex(
  value: unknown,
): PublishedProfileIndexValidation {
  if (!isRecord(value)) {
    return { errors: ["The published profile index must be a JSON object."] };
  }

  const errors: string[] = [];
  if (value.schema_version !== PROFILE_INDEX_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${PROFILE_INDEX_SCHEMA_VERSION}.`);
  }
  if (value.publication_mode !== "developer-git") {
    errors.push('publication_mode must be "developer-git".');
  }
  if (!Array.isArray(value.profiles)) {
    errors.push("profiles must be an array.");
    return { errors };
  }

  const slugs = new Set<string>();
  const paths = new Set<string>();
  value.profiles.forEach((candidate, index) => {
    const path = `profiles[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    const slug =
      typeof candidate.slug === "string" ? candidate.slug : "";
    const slugError = validatePublishedProfileSlug(slug);
    if (slugError) errors.push(`${path}.slug ${slugError}.`);
    if (slugs.has(slug)) errors.push(`${path}.slug duplicates "${slug}".`);
    slugs.add(slug);

    validateText(errors, candidate.label, `${path}.label`, 1, 80);
    validateText(errors, candidate.game_plugin_id, `${path}.game_plugin_id`, 3, 192);
    validateText(
      errors,
      candidate.payload_schema_id,
      `${path}.payload_schema_id`,
      3,
      192,
    );
    if (
      !Number.isInteger(candidate.payload_schema_version) ||
      Number(candidate.payload_schema_version) <= 0
    ) {
      errors.push(`${path}.payload_schema_version must be a positive integer.`);
    }
    validateText(errors, candidate.deployment, `${path}.deployment`, 1, 96);
    validateText(errors, candidate.region, `${path}.region`, 1, 96);
    validateText(errors, candidate.realm, `${path}.realm`, 1, 96);
    validateText(errors, candidate.character_id, `${path}.character_id`, 1, 256);

    const payloadPath =
      typeof candidate.payload_path === "string"
        ? candidate.payload_path
        : "";
    if (!payloadPathPattern.test(payloadPath) || !payloadPath.startsWith(`${slug}/`)) {
      errors.push(
        `${path}.payload_path must be a versioned JSON file inside the slug folder.`,
      );
    }
    if (paths.has(payloadPath)) {
      errors.push(`${path}.payload_path duplicates "${payloadPath}".`);
    }
    paths.add(payloadPath);

    if (
      typeof candidate.payload_sha256 !== "string" ||
      !digestPattern.test(candidate.payload_sha256)
    ) {
      errors.push(`${path}.payload_sha256 must be a lowercase SHA-256 digest.`);
    }
    if (
      !Number.isInteger(candidate.payload_bytes) ||
      Number(candidate.payload_bytes) <= 0 ||
      Number(candidate.payload_bytes) > MAX_PROFILE_PAYLOAD_BYTES
    ) {
      errors.push(
        `${path}.payload_bytes must be between 1 and ${MAX_PROFILE_PAYLOAD_BYTES}.`,
      );
    }
  });

  if (errors.length > 0) return { errors };
  return {
    index: value as unknown as PublishedProfileIndex,
    errors,
  };
}

function validateText(
  errors: string[],
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length < minimum ||
    value.length > maximum
  ) {
    errors.push(`${path} must contain ${minimum}-${maximum} characters.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
