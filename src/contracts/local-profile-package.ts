import {
  type JsonValue,
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "./website-payload.ts";

export interface ProfilePackageSource {
  session_id: string;
  client_build: string;
  protocol_pack_digest: string;
  canonical_content_sha256: string;
  observation_count: number;
  last_event_sequence: number;
}

export interface WebsitePayloadRequest {
  relative_endpoint: string;
  payload: WebsitePayloadEnvelope;
}

export interface LocalProfilePackage {
  schema_version: 1;
  package_id: string;
  created_unix_millis: number;
  source: ProfilePackageSource;
  request: WebsitePayloadRequest;
}

export interface LocalProfilePackageValidation {
  package?: LocalProfilePackage;
  errors: string[];
}

const LOCAL_PROFILE_PACKAGE_SCHEMA_VERSION = 1;
const MAX_LOCAL_PROFILE_PACKAGE_BYTES = 9 * 1024 * 1024;
const MAX_SOURCE_TEXT_BYTES = 256;
const digestPattern = /^[a-f0-9]{64}$/;
const prefixedDigestPattern = /^sha256:[a-f0-9]{64}$/;
const packageKeys = new Set([
  "schema_version",
  "package_id",
  "created_unix_millis",
  "source",
  "request",
]);
const sourceKeys = new Set([
  "session_id",
  "client_build",
  "protocol_pack_digest",
  "canonical_content_sha256",
  "observation_count",
  "last_event_sequence",
]);

export async function validateLocalProfilePackage(
  value: unknown,
): Promise<LocalProfilePackageValidation> {
  if (!isRecord(value)) {
    return { errors: ["The local profile package must be a JSON object."] };
  }

  const errors: string[] = [];
  rejectUnknownFields(value, packageKeys, "package", errors);
  if (value.schema_version !== LOCAL_PROFILE_PACKAGE_SCHEMA_VERSION) {
    errors.push(
      `package schema_version must be ${LOCAL_PROFILE_PACKAGE_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof value.package_id !== "string" ||
    !digestPattern.test(value.package_id)
  ) {
    errors.push("package_id must be a lowercase SHA-256 digest.");
  }
  validatePositiveSafeInteger(
    value.created_unix_millis,
    "created_unix_millis",
    errors,
  );

  validateSource(value.source, errors);

  let payload: WebsitePayloadEnvelope | undefined;
  if (!isRecord(value.request)) {
    errors.push("request must be a JSON object.");
  } else {
    if (
      typeof value.request.relative_endpoint !== "string" ||
      !isSafeRelativeEndpoint(value.request.relative_endpoint)
    ) {
      errors.push("request.relative_endpoint must be a safe relative URL path.");
    }
    const payloadValidation = validateWebsitePayload(value.request.payload);
    if (!payloadValidation.envelope) {
      errors.push(
        ...payloadValidation.errors.map(
          (message) => `request.payload: ${message}`,
        ),
      );
    } else {
      payload = payloadValidation.envelope;
      if (payload.payload_kind !== "character-profile") {
        errors.push('request.payload.payload_kind must be "character-profile".');
      }
      for (const key of ["deployment", "region", "character-id"]) {
        if (!payload.routing[key]) {
          errors.push(`request.payload.routing is missing "${key}".`);
        }
      }
    }
  }

  const encodedBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (encodedBytes > MAX_LOCAL_PROFILE_PACKAGE_BYTES) {
    errors.push(
      `profile package is ${encodedBytes.toLocaleString()} bytes; the maximum is ${MAX_LOCAL_PROFILE_PACKAGE_BYTES.toLocaleString()}.`,
    );
  }

  if (
    errors.length === 0 &&
    isRecord(value.request) &&
    typeof value.package_id === "string"
  ) {
    const expected = await requestDigest(
      value.request as unknown as WebsitePayloadRequest,
    );
    if (expected !== value.package_id) {
      errors.push(
        `package_id does not match the canonical request digest; expected ${expected}.`,
      );
    }
  }

  if (errors.length > 0 || !payload) return { errors };
  return {
    package: value as unknown as LocalProfilePackage,
    errors,
  };
}

export async function requestDigest(
  request: WebsitePayloadRequest,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(request));
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Canonical JSON used by the native rLogs profile-package seal: object keys
 * are recursively sorted while array order and JSON primitive values remain
 * unchanged.
 */
export function canonicalJson(value: JsonValue | WebsitePayloadRequest): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((child) => canonicalJson(child)).join(",")}]`;
  }
  const record = value as unknown as Record<string, JsonValue>;
  const fields = Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(record[key] as JsonValue)}`,
    );
  return `{${fields.join(",")}}`;
}

function validateSource(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("source must be a JSON object.");
    return;
  }
  rejectUnknownFields(value, sourceKeys, "source", errors);
  for (const key of [
    "session_id",
    "client_build",
    "protocol_pack_digest",
  ] as const) {
    const candidate = value[key];
    if (
      typeof candidate !== "string" ||
      candidate.trim().length === 0 ||
      new TextEncoder().encode(candidate).byteLength > MAX_SOURCE_TEXT_BYTES
    ) {
      errors.push(`source.${key} must be a non-empty string up to 256 bytes.`);
    }
  }
  if (
    typeof value.canonical_content_sha256 !== "string" ||
    !prefixedDigestPattern.test(value.canonical_content_sha256)
  ) {
    errors.push(
      "source.canonical_content_sha256 must be a sha256: prefixed lowercase digest.",
    );
  }
  validatePositiveSafeInteger(
    value.observation_count,
    "source.observation_count",
    errors,
  );
  validatePositiveSafeInteger(
    value.last_event_sequence,
    "source.last_event_sequence",
    errors,
  );
}

function validatePositiveSafeInteger(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    errors.push(`${field} must be a positive safe integer.`);
  }
}

function isSafeRelativeEndpoint(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("://") ||
    /[?#%]/.test(value)
  ) {
    return false;
  }
  const path = value.slice(1);
  return (
    path.length > 0 &&
    path
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not supported.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
