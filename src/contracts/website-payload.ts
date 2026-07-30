export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WebsitePayloadEnvelope {
  schema_version: number;
  game_plugin_id: string;
  payload_kind: string;
  payload_schema_id: string;
  payload_schema_version: number;
  routing: Record<string, string>;
  body: Record<string, JsonValue>;
}

export interface ValidationResult {
  envelope?: WebsitePayloadEnvelope;
  errors: string[];
}

const WEBSITE_PAYLOAD_SCHEMA_VERSION = 1;
const MAX_WEBSITE_PAYLOAD_BYTES = 8 * 1024 * 1024;

const prohibitedFields = new Set([
  "password",
  "passphrase",
  "account",
  "authentication",
  "credential",
  "credentials",
  "login",
  "secret",
  "clientsecret",
  "token",
  "passwordciphertext",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "sessiontoken",
  "authorization",
  "bearer",
  "cookie",
  "sessioncookie",
  "sessionid",
  "accountid",
  "platformaccountid",
  "publisheraccountid",
  "openid",
  "loginname",
  "userid",
  "discordid",
  "email",
  "emailaddress",
  "phonenumber",
]);

export function validateWebsitePayload(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { errors: ["The top-level JSON value must be an object."] };
  }

  if (value.schema_version !== WEBSITE_PAYLOAD_SCHEMA_VERSION) {
    errors.push(
      `schema_version must be ${WEBSITE_PAYLOAD_SCHEMA_VERSION}; received ${formatValue(value.schema_version)}.`,
    );
  }

  validateIdentifier(errors, "game_plugin_id", value.game_plugin_id, true);
  validateIdentifier(errors, "payload_kind", value.payload_kind, false);
  validateIdentifier(errors, "payload_schema_id", value.payload_schema_id, true);

  if (
    !Number.isInteger(value.payload_schema_version) ||
    Number(value.payload_schema_version) <= 0
  ) {
    errors.push("payload_schema_version must be a positive integer.");
  }

  if (!isRecord(value.routing)) {
    errors.push("routing must be an object containing public string values.");
  } else {
    for (const [key, routeValue] of Object.entries(value.routing)) {
      validateIdentifier(errors, `routing key "${key}"`, key, false);
      if (
        typeof routeValue !== "string" ||
        routeValue.trim().length === 0 ||
        routeValue.length > 256
      ) {
        errors.push(`routing value "${key}" must be a non-empty string up to 256 characters.`);
      }
      rejectProhibitedField(errors, key, `routing.${key}`);
    }
  }

  if (!isRecord(value.body)) {
    errors.push("body must be a JSON object.");
  } else {
    inspectForProhibitedFields(value.body, "body", errors);
  }

  const encodedBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (encodedBytes > MAX_WEBSITE_PAYLOAD_BYTES) {
    errors.push(
      `payload is ${encodedBytes.toLocaleString()} bytes; the maximum is ${MAX_WEBSITE_PAYLOAD_BYTES.toLocaleString()}.`,
    );
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    envelope: value as unknown as WebsitePayloadEnvelope,
    errors,
  };
}

function validateIdentifier(
  errors: string[],
  field: string,
  value: unknown,
  dotted: boolean,
): void {
  if (typeof value !== "string") {
    errors.push(`${field} must be a string.`);
    return;
  }

  const parts = value.split(".");
  const validPart = (part: string) =>
    part.length > 0 &&
    part.length <= 96 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part);

  if (
    value.length > 192 ||
    parts.some((part) => !validPart(part)) ||
    (dotted ? parts.length < 2 : parts.length !== 1)
  ) {
    errors.push(`${field} has an invalid versioned identifier: "${value}".`);
  }
}

function inspectForProhibitedFields(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      inspectForProhibitedFields(child, `${path}[${index}]`, errors),
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    rejectProhibitedField(errors, key, `${path}.${key}`);
    inspectForProhibitedFields(child, `${path}.${key}`, errors);
  }
}

function rejectProhibitedField(errors: string[], key: string, path: string): void {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (prohibitedFields.has(normalized)) {
    errors.push(`prohibited account or credential field found at ${path}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  return typeof value === "undefined" ? "missing" : JSON.stringify(value);
}

