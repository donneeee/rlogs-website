import {
  type JsonValue,
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "../../contracts/website-payload";

const fixtureUrl = `${import.meta.env.BASE_URL}fixtures/bpsr-character-profile.v1.json`;

export async function mountProfileLab(): Promise<void> {
  const editor = requiredElement<HTMLTextAreaElement>("profile-json");
  const fileInput = requiredElement<HTMLInputElement>("profile-file");

  requiredElement("validate-profile").addEventListener("click", () => {
    validateAndRender(editor.value);
  });
  requiredElement("load-profile-fixture").addEventListener("click", () => {
    void loadFixture();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      editor.value = text;
      validateAndRender(text);
    });
  });

  await loadFixture();
}

async function loadFixture(): Promise<void> {
  setStatus("neutral", "Loading fixture…");
  try {
    const response = await fetch(fixtureUrl);
    if (!response.ok) {
      throw new Error(`Fixture request failed with HTTP ${response.status}.`);
    }
    const value: unknown = await response.json();
    const formatted = JSON.stringify(value, null, 2);
    requiredElement<HTMLTextAreaElement>("profile-json").value = formatted;
    validateAndRender(formatted);
  } catch (error) {
    showErrors([error instanceof Error ? error.message : "Could not load fixture."]);
    setStatus("invalid", "Fixture failed");
  }
}

function validateAndRender(source: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parsing error.";
    showErrors([`Invalid JSON: ${message}`]);
    clearPreview();
    setStatus("invalid", "Invalid JSON");
    return;
  }

  const result = validateWebsitePayload(parsed);
  showErrors(result.errors);
  if (!result.envelope) {
    clearPreview();
    setStatus("invalid", `${result.errors.length} contract issue${result.errors.length === 1 ? "" : "s"}`);
    return;
  }

  renderProfile(result.envelope);
  setStatus("valid", "Valid public envelope");
}

function renderProfile(envelope: WebsitePayloadEnvelope): void {
  const preview = requiredElement("profile-preview");
  preview.replaceChildren();

  const body = envelope.body;
  const character = recordAt(body, "character");
  const region = recordAt(character, "region");
  const displayName = stringAt(body, "display_name") ?? "Unnamed character";
  const characterId =
    stringAt(character, "character_id") ??
    envelope.routing["character-id"] ??
    "Not present";
  const realm =
    stringAt(region, "realm_id") ??
    envelope.routing.realm ??
    "Unresolved realm";
  const regionName =
    stringAt(region, "region_id") ??
    envelope.routing.region ??
    "Unresolved region";

  const identity = element("div", "profile-identity");
  const avatar = element("div", "profile-avatar", initials(displayName));
  const identityCopy = element("div");
  identityCopy.append(
    element("p", "eyebrow", `${regionName} / ${realm}`),
    element("h3", "", displayName),
    element("p", "identity-id", `Character ID ${characterId}`),
  );
  identity.append(avatar, identityCopy);

  const metrics = element("div", "profile-metrics");
  const modules = recordAt(body, "modules");
  const metricValues: Array<[string, string]> = [
    [formatMetric(body.level), "Level"],
    [formatMetric(body.combat_power), "Combat power"],
    [String(arrayAt(body, "equipment").length), "Equipment"],
    [String(arrayAt(modules, "inventory").length), "Modules"],
    [String(arrayAt(body, "owned_imagines").length), "Imagines"],
    [String(arrayAt(body, "talents").length), "Talents"],
  ];
  for (const [value, label] of metricValues) {
    const metric = element("div", "metric");
    metric.append(element("strong", "", value), element("span", "", label));
    metrics.append(metric);
  }

  const domainList = element("dl", "profile-domain-list");
  const domains: Array<[string, string]> = [
    ["Deployment", envelope.routing.deployment ?? "Unknown"],
    ["Class / specialization", joinIds(body.class_id, body.specialization_id)],
    ["Profile schema", `${envelope.payload_schema_id} v${envelope.payload_schema_version}`],
    ["Equipment state", presenceLabel(body.equipment)],
    ["Module inventory", presenceLabel(body.modules)],
    ["Skill and talent state", presenceLabel(body.active_skills ?? body.talents)],
    ["Collection state", presenceLabel(body.collection_summary)],
  ];
  for (const [label, value] of domains) {
    domainList.append(element("dt", "", label), element("dd", "", value));
  }

  const details = element("details", "raw-inspector");
  details.append(
    element("summary", "", "Inspect normalized public envelope"),
    element("pre", "", JSON.stringify(envelope, null, 2)),
  );

  preview.append(identity, metrics, domainList, details);
}

function showErrors(errors: string[]): void {
  const list = requiredElement("profile-errors");
  list.replaceChildren(
    ...errors.map((message) => element("li", "", message)),
  );
  list.hidden = errors.length === 0;
}

function clearPreview(): void {
  requiredElement("profile-preview").replaceChildren(
    element("p", "empty-state", "Fix the contract issues to render this profile."),
  );
}

function setStatus(state: "neutral" | "valid" | "invalid", message: string): void {
  const status = requiredElement("profile-status");
  status.className = `status-chip ${state}`;
  status.textContent = message;
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required page element #${id}.`);
  return node as T;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function recordAt(
  value: Record<string, JsonValue> | undefined,
  key: string,
): Record<string, JsonValue> {
  const child = value?.[key];
  return typeof child === "object" && child !== null && !Array.isArray(child)
    ? child
    : {};
}

function arrayAt(
  value: Record<string, JsonValue> | undefined,
  key: string,
): JsonValue[] {
  const child = value?.[key];
  return Array.isArray(child) ? child : [];
}

function stringAt(
  value: Record<string, JsonValue> | undefined,
  key: string,
): string | undefined {
  const child = value?.[key];
  return typeof child === "string" ? child : undefined;
}

function formatMetric(value: JsonValue | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function joinIds(first: JsonValue | undefined, second: JsonValue | undefined): string {
  const parts = [first, second].filter(
    (value): value is number | string =>
      typeof value === "number" || typeof value === "string",
  );
  return parts.length > 0 ? parts.join(" / ") : "Not observed";
}

function presenceLabel(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "Not observed";
  if (Array.isArray(value)) return `Observed (${value.length} entries)`;
  return "Observed";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

