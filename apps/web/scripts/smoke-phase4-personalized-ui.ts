/**
 * Phase 4 task 09 personalized UI smoke.
 *
 * 브라우저를 띄우지 않고 트리 화면이 Phase 4 API 계약을 실제로 연결하는지
 * source contract와 타입 export만 빠르게 검증한다.
 */
import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

async function main(): Promise<void> {
  const treeClientSource = readSource("src/components/tree-page-client.tsx");
  const typesSource = readSource("src/types/learning.ts");

  assert(typesSource.includes("ApiPersonalizedNode"), "types must expose personalized node response");
  assert(typesSource.includes("ApiReviewItem"), "types must expose review item response");
  assert(typesSource.includes("ApiSessionReportResponse"), "types must expose session report response");

  assert(
    treeClientSource.includes("PHASE4_AUTH_TOKEN_STORAGE_KEY"),
    "tree UI must read the Phase 4 auth token boundary explicitly",
  );
  assert(
    treeClientSource.includes("/api/trees/${treeId}/personalized"),
    "tree UI must call personalized tree API",
  );
  assert(
    treeClientSource.includes("/api/trees/${treeId}/recommendations/personalized"),
    "tree UI must call personalized recommendations API",
  );
  assert(treeClientSource.includes("/api/reviews/due"), "tree UI must call review due API");
  assert(treeClientSource.includes("/api/sessions/start"), "tree UI must start Phase 4 sessions");
  assert(treeClientSource.includes("/api/reports/generate"), "tree UI must generate session reports");
  assert(treeClientSource.includes("hideKnownPrerequisites"), "tree UI must support hiding known prerequisites");
  assert(treeClientSource.includes("personalizationByNodeId"), "tree UI must map personalized node state by node id");
  assert(treeClientSource.includes("reviewItems"), "tree UI must render review queue state");
  assert(treeClientSource.includes("latestReport"), "tree UI must render generated report state");
  assert(treeClientSource.includes("confidence_score"), "tree UI must display confidence_score data");
  assert(treeClientSource.includes("recommendation_score"), "tree UI must display recommendation score data");

  console.log("Phase 4 task 09 personalized UI smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:ui-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
