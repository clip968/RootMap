import {
  CURRENT_NODE_DETAIL_VERSION,
  enqueueNodeDetailJob,
} from "@/lib/repository/node-detail-job-repository";
import type {
  LearningNodeRow,
  LearningTreeBundle,
} from "@/lib/repository/learning-repository";

export const NODE_DETAIL_PREWARM_LIMIT = 3;
export const NODE_DETAIL_PREWARM_CONCURRENCY = 2;

export interface NodeDetailPrewarmResult {
  attempted: number;
  enqueued: number;
  failed: number;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isNodeDetailPrewarmEnabled(): boolean {
  return process.env.NODE_DETAIL_ASYNC_ENABLED === "true" &&
    process.env.NODE_DETAIL_PREWARM_ENABLED !== "false";
}

function rootNode(bundle: LearningTreeBundle): LearningNodeRow | null {
  const incoming = new Set<string>();
  for (const node of bundle.nodes) {
    for (const child of node.children) incoming.add(child);
  }
  return bundle.nodes.find((node) => !incoming.has(node.nodeKey)) ?? bundle.nodes[0] ?? null;
}

function prewarmTargets(bundle: LearningTreeBundle, limit: number): LearningNodeRow[] {
  const byNodeKey = new Map(bundle.nodes.map((node) => [node.nodeKey, node]));
  const targets: LearningNodeRow[] = [];
  const seen = new Set<string>();

  const root = rootNode(bundle);
  if (root) {
    targets.push(root);
    seen.add(root.id);
  }

  for (const nodeKey of bundle.tree.treeJson.recommended_order.slice(0, limit)) {
    const node = byNodeKey.get(nodeKey);
    if (!node || seen.has(node.id)) continue;
    targets.push(node);
    seen.add(node.id);
  }
  return targets;
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item) await run(item);
    }
  });
  await Promise.all(workers);
}

export async function prewarmNodeDetailJobsForTree(
  bundle: LearningTreeBundle,
): Promise<NodeDetailPrewarmResult> {
  if (!isNodeDetailPrewarmEnabled()) {
    return { attempted: 0, enqueued: 0, failed: 0 };
  }

  const limit = readPositiveIntegerEnv(
    "NODE_DETAIL_PREWARM_LIMIT",
    NODE_DETAIL_PREWARM_LIMIT,
  );
  const concurrency = readPositiveIntegerEnv(
    "NODE_DETAIL_PREWARM_CONCURRENCY",
    NODE_DETAIL_PREWARM_CONCURRENCY,
  );
  const targets = prewarmTargets(bundle, limit);
  let enqueued = 0;
  let failed = 0;

  await runWithConcurrencyLimit(targets, concurrency, async (node) => {
    try {
      await enqueueNodeDetailJob({
        treeId: bundle.tree.id,
        nodeId: node.id,
        detailVersion: CURRENT_NODE_DETAIL_VERSION,
      });
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error("[node-detail-prewarm]", {
        treeId: bundle.tree.id,
        nodeId: node.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  console.info("[node-detail-prewarm]", {
    treeId: bundle.tree.id,
    attempted: targets.length,
    enqueued,
    failed,
  });

  return {
    attempted: targets.length,
    enqueued,
    failed,
  };
}
