import type {
  OptimizerCatalog,
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
  OptimizeRequest,
  OptimizeResponse,
} from "./optimizer-types";

interface WasmBindings {
  default: () => Promise<unknown>;
  optimizer_catalog_json: () => string;
  optimize_json: (request: string) => string;
}

interface WorkerScope {
  location: Location;
  onmessage: ((event: MessageEvent<OptimizerWorkerRequest>) => void) | null;
  postMessage: (message: OptimizerWorkerResponse) => void;
}

const workerScope = self as unknown as WorkerScope;
const enginePromise = loadEngine();

workerScope.onmessage = async (event: MessageEvent<OptimizerWorkerRequest>) => {
  const message = event.data;
  try {
    const engine = await enginePromise;
    const value =
      message.kind === "catalog"
        ? catalog(engine)
        : optimize(engine, message.request);
    const response: OptimizerWorkerResponse = {
      id: message.id,
      ok: true,
      value,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: OptimizerWorkerResponse = {
      id: message.id,
      ok: false,
      error: errorMessage(error),
    };
    workerScope.postMessage(response);
  }
};

async function loadEngine(): Promise<WasmBindings> {
  const glueUrl = new URL(
    `${import.meta.env.BASE_URL}wasm/rlogs_bpsr_module_optimizer_wasm.js`,
    workerScope.location.origin,
  ).href;
  const bindings = (await import(/* @vite-ignore */ glueUrl)) as WasmBindings;
  await bindings.default();
  return bindings;
}

function catalog(engine: WasmBindings): OptimizerCatalog {
  return JSON.parse(engine.optimizer_catalog_json()) as OptimizerCatalog;
}

function optimize(
  engine: WasmBindings,
  request: OptimizeRequest,
): OptimizeResponse {
  return JSON.parse(engine.optimize_json(JSON.stringify(request))) as OptimizeResponse;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
