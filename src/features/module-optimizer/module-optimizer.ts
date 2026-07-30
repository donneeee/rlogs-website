import {
  extractOptimizerModules,
  safeDemoModules,
} from "./optimizer-data";
import type {
  AttributeCatalogEntry,
  ModuleCandidate,
  OptimizerCatalog,
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
  OptimizeRequest,
  OptimizeResponse,
  SearchMode,
} from "./optimizer-types";

const captureFixtureUrl =
  `${import.meta.env.BASE_URL}fixtures/marierose-asteria-capture.v1.json`;

let inventory: ModuleCandidate[] = [];
let catalog: OptimizerCatalog | undefined;
let nextWorkerRequestId = 1;
const pendingWorkerCalls = new Map<
  number,
  {
    resolve: (value: OptimizerCatalog | OptimizeResponse) => void;
    reject: (reason: Error) => void;
  }
>();

const optimizerWorker = new Worker(
  new URL("./optimizer-worker.ts", import.meta.url),
  { type: "module" },
);

optimizerWorker.addEventListener(
  "message",
  (event: MessageEvent<OptimizerWorkerResponse>) => {
    const pending = pendingWorkerCalls.get(event.data.id);
    if (!pending) return;
    pendingWorkerCalls.delete(event.data.id);
    if (event.data.ok) {
      pending.resolve(event.data.value);
    } else {
      pending.reject(new Error(event.data.error));
    }
  },
);

optimizerWorker.addEventListener("error", (event) => {
  for (const pending of pendingWorkerCalls.values()) {
    pending.reject(new Error(event.message || "Optimizer worker failed."));
  }
  pendingWorkerCalls.clear();
});

export async function mountModuleOptimizer(): Promise<void> {
  bindControls();
  try {
    catalog = (await callWorker({ kind: "catalog" })) as OptimizerCatalog;
    renderCatalog(catalog);
    setEngineState("valid", "Rust + WASM ready");
    if (new URLSearchParams(location.search).get("profile") === "marierose") {
      await loadCaptureInventory();
    } else {
      loadDemoInventory();
    }
  } catch (error) {
    setEngineState("invalid", "Engine unavailable");
    setRunStatus(errorMessage(error), true);
    setInventoryStatus("The browser optimizer could not initialize.");
  }
}

function bindControls(): void {
  requiredElement<HTMLButtonElement>("optimizer-load-capture").addEventListener(
    "click",
    () => void loadCaptureInventory(),
  );
  requiredElement<HTMLButtonElement>("optimizer-load-demo").addEventListener(
    "click",
    loadDemoInventory,
  );
  requiredElement<HTMLInputElement>("optimizer-file").addEventListener(
    "change",
    (event) => void loadInventoryFile(event),
  );
  requiredElement<HTMLButtonElement>("run-optimizer").addEventListener(
    "click",
    () => void runOptimizer(),
  );
}

async function loadCaptureInventory(): Promise<void> {
  setInventoryStatus("Loading the sanitized MarieRose module inventory...");
  try {
    const response = await fetch(captureFixtureUrl);
    if (!response.ok) {
      throw new Error(`Profile fixture failed with HTTP ${response.status}.`);
    }
    inventory = extractOptimizerModules(await response.json());
    setInventoryStatus(
      `MarieRose capture loaded: ${formatNumber(inventory.length)} modules.`,
    );
    setRunStatus("Choose attribute priorities, then optimize.");
    enableRun();
  } catch (error) {
    setInventoryStatus(errorMessage(error), true);
    setRunStatus("Could not load the MarieRose inventory.", true);
  }
}

function loadDemoInventory(): void {
  inventory = safeDemoModules();
  const strength = document.querySelector<HTMLSelectElement>(
    '.optimizer-attribute-row[data-attribute-id="1110"] select',
  );
  if (strength) strength.value = "target";
  requiredElement<HTMLInputElement>("optimizer-require-target").checked = false;
  setInventoryStatus("Safe demo loaded: 12 generated modules.");
  setRunStatus("Choose attribute priorities, then optimize.");
  enableRun();
}

async function loadInventoryFile(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    inventory = extractOptimizerModules(JSON.parse(await file.text()));
    setInventoryStatus(
      `${file.name}: ${formatNumber(inventory.length)} modules loaded locally.`,
    );
    setRunStatus("Choose attribute priorities, then optimize.");
    enableRun();
  } catch (error) {
    setInventoryStatus(errorMessage(error), true);
    setRunStatus("The selected file was not loaded.", true);
  } finally {
    input.value = "";
  }
}

async function runOptimizer(): Promise<void> {
  if (!catalog) {
    setRunStatus("The optimizer catalog is not ready.", true);
    return;
  }
  if (inventory.length === 0) {
    setRunStatus("Load a module inventory first.", true);
    return;
  }

  const button = requiredElement<HTMLButtonElement>("run-optimizer");
  button.disabled = true;
  button.textContent = "Optimizing...";
  requiredElement("optimizer-result").hidden = true;
  const request = buildRequest();
  setRunStatus(
    `Searching ${formatNumber(inventory.length)} modules in the background...`,
  );
  const started = performance.now();
  try {
    const response = (await callWorker({
      kind: "optimize",
      request,
    })) as OptimizeResponse;
    renderResult(response, performance.now() - started);
    setRunStatus(
      `Found ${response.solutions.length} result(s) using ${response.search.used_mode} search.`,
    );
  } catch (error) {
    setRunStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Optimize modules";
  }
}

function buildRequest(): OptimizeRequest {
  const targetAttributes: number[] = [];
  const excludeAttributes: number[] = [];
  const minimums: Record<string, number> = {};
  document
    .querySelectorAll<HTMLElement>(".optimizer-attribute-row")
    .forEach((row) => {
      const attributeId = Number(row.dataset.attributeId);
      const mode = row.querySelector<HTMLSelectElement>("select")?.value;
      const minimum = Number(
        row.querySelector<HTMLInputElement>('input[type="number"]')?.value || 0,
      );
      if (mode === "target") targetAttributes.push(attributeId);
      if (mode === "exclude") excludeAttributes.push(attributeId);
      if (minimum > 0) minimums[String(attributeId)] = minimum;
    });
  const minimumTotalRaw =
    requiredElement<HTMLInputElement>("optimizer-min-total").value;
  return {
    modules: inventory,
    target_attributes: targetAttributes,
    exclude_attributes: excludeAttributes,
    min_attr_requirements: minimums,
    combination_size: Number(
      requiredElement<HTMLSelectElement>("optimizer-combination-size").value,
    ),
    max_solutions: Number(
      requiredElement<HTMLInputElement>("optimizer-result-count").value,
    ),
    search_mode: requiredElement<HTMLSelectElement>(
      "optimizer-search-mode",
    ).value as SearchMode,
    minimum_module_total:
      minimumTotalRaw === "" ? null : Number(minimumTotalRaw),
    require_target_match:
      requiredElement<HTMLInputElement>("optimizer-require-target").checked,
  };
}

function renderCatalog(value: OptimizerCatalog): void {
  requiredElement("optimizer-catalog-revision").textContent =
    `${value.catalog_revision} / build ${value.client_builds.join(", ")}`;
  const root = requiredElement("optimizer-attributes");
  root.replaceChildren(
    ...value.attributes.map((attribute) => attributeRow(attribute)),
  );
}

function attributeRow(attribute: AttributeCatalogEntry): HTMLElement {
  const row = element("div", "optimizer-attribute-row");
  row.dataset.attributeId = String(attribute.id);

  const identity = element("div", "optimizer-attribute-name");
  identity.append(
    element("strong", "", attribute.name),
    element(
      "small",
      "",
      `${attribute.id} / ${attribute.thresholds.join("/")}`,
    ),
  );

  const mode = element("select");
  mode.setAttribute("aria-label", `Scoring policy for ${attribute.name}`);
  for (const [value, label] of [
    ["normal", "Normal"],
    ["target", "Target 2x"],
    ["exclude", "Exclude"],
  ]) {
    const option = element("option", "", label);
    option.value = value;
    mode.append(option);
  }

  const minimum = element("input");
  minimum.type = "number";
  minimum.min = "0";
  minimum.placeholder = "0";
  minimum.setAttribute("aria-label", `Minimum ${attribute.name}`);
  row.append(identity, mode, minimum);
  return row;
}

function renderResult(result: OptimizeResponse, durationMs: number): void {
  const metrics: Array<[string, string]> = [
    [String(result.solutions.length), "solutions"],
    [formatNumber(result.search.candidate_module_count), "candidates"],
    [formatNumber(result.search.total_combinations), "possible sets"],
    [formatNumber(result.search.evaluated_states), "states evaluated"],
    [result.search.exact ? "exact" : "bounded", "result type"],
    [`${durationMs.toFixed(0)} ms`, "browser time"],
  ];
  requiredElement("optimizer-metrics").replaceChildren(
    ...metrics.map(([value, label]) => {
      const metric = element("div", "optimizer-result-metric");
      metric.append(element("strong", "", value), element("span", "", label));
      return metric;
    }),
  );

  requiredElement("optimizer-result-rows").replaceChildren(
    ...result.solutions.map((solution, index) => {
      const row = element("tr");
      const modules = element("td", "optimizer-module-ids");
      for (const module of solution.modules) {
        const line = element("span");
        line.append(
          element("strong", "", module.instance_id),
          element(
            "small",
            "",
            `config ${module.config_id}${module.quality == null ? "" : ` / Q${module.quality}`}`,
          ),
        );
        modules.append(line);
      }
      const attributes = solution.breakdown.attributes
        .filter((attribute) => attribute.total > 0)
        .map((attribute) => {
          const entry = catalog?.attributes.find(
            (candidate) => candidate.id === attribute.attribute_id,
          );
          const suffix =
            attribute.multiplier === 2
              ? " x2"
              : attribute.multiplier === 0
                ? " excluded"
                : "";
          return `${entry?.name ?? attribute.attribute_id}: ${attribute.total}${suffix}`;
        })
        .join(" / ");
      row.append(
        element("td", "", `#${index + 1}`),
        element("td", "optimizer-score", formatNumber(solution.score)),
        modules,
        element("td", "optimizer-attribute-summary", attributes),
      );
      return row;
    }),
  );

  requiredElement("optimizer-footnote").textContent =
    `${result.scoring_revision}. Threshold power ${result.solutions[0]?.breakdown.threshold_power ?? 0}; ` +
    `total-link power ${result.solutions[0]?.breakdown.total_link_power ?? 0}.`;
  requiredElement("optimizer-result").hidden = false;
}

function callWorker(
  message:
    | { kind: "catalog" }
    | { kind: "optimize"; request: OptimizeRequest },
): Promise<OptimizerCatalog | OptimizeResponse> {
  const id = nextWorkerRequestId++;
  return new Promise((resolve, reject) => {
    pendingWorkerCalls.set(id, { resolve, reject });
    optimizerWorker.postMessage({ ...message, id } as OptimizerWorkerRequest);
  });
}

function enableRun(): void {
  requiredElement<HTMLButtonElement>("run-optimizer").disabled =
    !catalog || inventory.length === 0;
}

function setEngineState(
  state: "valid" | "invalid",
  message: string,
): void {
  const chip = requiredElement("optimizer-status-chip");
  chip.className = `status-chip ${state}`;
  chip.textContent = message;
}

function setInventoryStatus(message: string, error = false): void {
  const status = requiredElement("optimizer-inventory-status");
  status.textContent = message;
  status.classList.toggle("inline-error", error);
}

function setRunStatus(message: string, error = false): void {
  const status = requiredElement("optimizer-run-status");
  status.textContent = message;
  status.classList.toggle("inline-error", error);
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

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
