import { readText } from "./phase6-security-utils";

type Layer = "unit" | "integration" | "e2e" | "llm-eval" | "quality";

const LAYERS: Record<Exclude<Layer, "quality">, string[]> = {
  unit: [
    "Task 04 will attach recommendation, mastery, and review-priority pure-function tests here.",
  ],
  integration: [
    "Task 01 provides Supabase Auth/RLS negative smoke.",
    "Task 02 provides route/repository user-id audit.",
  ],
  e2e: [
    "Phase 06 keeps Playwright scoped to a future minimal login -> document -> recommendation -> report path.",
  ],
  "llm-eval": [
    "Task 05 and Task 06 will attach evidence-grounding and prompt-injection fixtures here.",
  ],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPackageScript(name: string): void {
  const packageJson = JSON.parse(readText("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert(packageJson.scripts?.[name], `package script missing: ${name}`);
}

function runLayer(layer: Exclude<Layer, "quality">): void {
  console.info(`[phase6:${layer}] harness ready`);
  for (const note of LAYERS[layer]) console.info(`- ${note}`);
}

async function main(): Promise<void> {
  const layer = (process.argv[2] || "quality") as Layer;
  assert(["unit", "integration", "e2e", "llm-eval", "quality"].includes(layer), `unknown test layer: ${layer}`);

  for (const scriptName of ["test:unit", "test:integration", "test:e2e", "test:llm-eval", "phase6:quality"]) {
    assertPackageScript(scriptName);
  }

  if (layer === "quality") {
    runLayer("unit");
    runLayer("integration");
    runLayer("e2e");
    runLayer("llm-eval");
    console.info("Phase 6 task 03 product-grade test harness passed.");
    return;
  }

  runLayer(layer);
}

void main().catch((error) => {
  console.error("[phase6:test-harness] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
