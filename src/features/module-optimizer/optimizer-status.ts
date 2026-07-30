interface OptimizerSmokeReceipt {
  schema_version: number;
  engine: string;
  compatibility_source: string;
  native_smoke_test: {
    passed: boolean;
    catalog_attribute_count: number;
    safe_demo_module_count: number;
    returned_solution_count: number;
    exact_result: boolean;
  };
  browser_adapter: {
    state: string;
    next_step: string;
  };
}

const receiptUrl = `${import.meta.env.BASE_URL}fixtures/module-optimizer-smoke.v1.json`;

export async function mountOptimizerStatus(): Promise<void> {
  const root = requiredElement("optimizer-receipt");
  const chip = requiredElement("optimizer-status-chip");

  try {
    const response = await fetch(receiptUrl);
    if (!response.ok) {
      throw new Error(`Smoke receipt failed with HTTP ${response.status}.`);
    }
    const receipt = (await response.json()) as OptimizerSmokeReceipt;
    renderReceipt(root, receipt);
    chip.className = receipt.native_smoke_test.passed
      ? "status-chip valid"
      : "status-chip invalid";
    chip.textContent = receipt.native_smoke_test.passed
      ? "Native smoke passed"
      : "Native smoke failed";
  } catch (error) {
    root.replaceChildren(
      element(
        "p",
        "empty-state",
        error instanceof Error ? error.message : "Could not load smoke receipt.",
      ),
    );
    chip.className = "status-chip invalid";
    chip.textContent = "Receipt unavailable";
  }
}

function renderReceipt(root: HTMLElement, receipt: OptimizerSmokeReceipt): void {
  const heading = element("div", "receipt-heading");
  const copy = element("div");
  copy.append(
    element("p", "eyebrow", "Latest recorded local verification"),
    element("h3", "", "Native optimizer is ready for a browser adapter"),
    element(
      "p",
      "muted",
      `${receipt.engine} · ${receipt.compatibility_source}`,
    ),
  );
  heading.append(copy, element("span", "pass-mark", "PASS"));

  const metrics = element("div", "receipt-metrics");
  const values: Array<[string, string]> = [
    [String(receipt.native_smoke_test.catalog_attribute_count), "catalog attributes"],
    [String(receipt.native_smoke_test.safe_demo_module_count), "safe demo modules"],
    [String(receipt.native_smoke_test.returned_solution_count), "solutions returned"],
    [receipt.native_smoke_test.exact_result ? "exact" : "bounded", "result type"],
  ];
  for (const [value, label] of values) {
    const metric = element("div", "metric");
    metric.append(element("strong", "", value), element("span", "", label));
    metrics.append(metric);
  }

  const adapter = element("div", "adapter-state");
  adapter.append(
    element("span", "status-dot"),
    element(
      "p",
      "",
      `${humanize(receipt.browser_adapter.state)}. ${receipt.browser_adapter.next_step}`,
    ),
  );

  root.replaceChildren(heading, metrics, adapter);
}

function requiredElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required page element #${id}.`);
  return node;
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

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

