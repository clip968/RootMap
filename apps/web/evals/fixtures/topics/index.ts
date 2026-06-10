/**
 * 골든 주제 픽스처 로더.
 *
 * 모든 주제 픽스처를 하나의 배열로 모아 default export한다.
 * 중복 topic과 빈 필수 필드는 모듈 로드 시점(빌드/실행 진입 시)에 throw로 잡는다.
 * 그래서 잘못된 픽스처가 들어오면 eval runner가 실행되기 전에 즉시 실패한다.
 */
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

import { transformerFixture } from "./transformer";
import { rustLifetimeFixture } from "./rust-lifetime";
import { virtualMemoryFixture } from "./virtual-memory";
import { btreeIndexFixture } from "./btree-index";
import { tcpCongestionControlFixture } from "./tcp-congestion-control";
import { linuxBlockLayerFixture } from "./linux-block-layer";
import { osSchedulingFixture } from "./os-scheduling";
import { databaseTransactionFixture } from "./database-transaction";
import { compilerPipelineFixture } from "./compiler-pipeline";
import { distributedConsensusFixture } from "./distributed-consensus";

/** 등록된 골든 주제 픽스처(초기 10개, 명세 §1.2 목록과 일치). */
const fixtures: TreeEvalFixture[] = [
  transformerFixture,
  rustLifetimeFixture,
  virtualMemoryFixture,
  btreeIndexFixture,
  tcpCongestionControlFixture,
  linuxBlockLayerFixture,
  osSchedulingFixture,
  databaseTransactionFixture,
  compilerPipelineFixture,
  distributedConsensusFixture,
];

/** 픽스처 한 개의 필수 항목이 비어 있지 않은지 검증한다(빌드 타임 가드). */
function assertFixtureShape(fixture: TreeEvalFixture, index: number): void {
  const where = `fixtures[${index}] (topic="${fixture.topic ?? "<empty>"}")`;
  if (!fixture.topic || !fixture.topic.trim()) {
    throw new Error(`${where}: topic이 비어 있습니다.`);
  }
  if (fixture.expected_concepts.length === 0) {
    throw new Error(`${where}: expected_concepts가 비어 있습니다.`);
  }
  // DoD: 각 픽스처에 required_edges와 forbidden_edges가 1개 이상 있어야 한다.
  if (fixture.required_edges.length === 0) {
    throw new Error(`${where}: required_edges가 1개 이상 필요합니다.`);
  }
  if (fixture.forbidden_edges.length === 0) {
    throw new Error(`${where}: forbidden_edges가 1개 이상 필요합니다.`);
  }
  for (const edge of [...fixture.required_edges, ...fixture.forbidden_edges]) {
    if (!edge.from.trim() || !edge.to.trim() || !edge.reason.trim()) {
      throw new Error(`${where}: edge의 from/to/reason은 모두 비어 있지 않아야 합니다.`);
    }
  }
}

/** 모든 픽스처를 검증한다. 중복 topic·빈 필드가 있으면 throw한다. */
function validateFixtures(all: TreeEvalFixture[]): TreeEvalFixture[] {
  const seenTopics = new Set<string>();
  all.forEach((fixture, index) => {
    assertFixtureShape(fixture, index);
    const topicKey = fixture.topic.trim().toLowerCase();
    if (seenTopics.has(topicKey)) {
      throw new Error(`중복된 fixture topic: "${fixture.topic}"`);
    }
    seenTopics.add(topicKey);
  });
  return all;
}

/** 검증을 통과한 픽스처 목록(이름 있는 export). */
export const topicFixtures: TreeEvalFixture[] = validateFixtures(fixtures);

export default topicFixtures;
