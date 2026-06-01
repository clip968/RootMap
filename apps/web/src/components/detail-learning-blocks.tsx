import type { ApiLearningNode, NodeType } from "@/types/learning";
import type { ApiNodeDetailResponse } from "@/lib/services/node-detail";

interface DetailLearningBlocksProps {
  node: ApiLearningNode;
  detail: ApiNodeDetailResponse | null;
  sectionLabel: Record<NodeType, string>;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentence = trimmed.match(/^.+?[.!?。！？](?:\s|$)/u)?.[0]?.trim();
  return sentence || trimmed;
}

export function DetailLearningBlocks({
  node,
  detail,
  sectionLabel,
}: DetailLearningBlocksProps) {
  const explanation = firstSentence(
    detail?.easy_explanation || node.description || "",
  );
  const whyItMatters = detail?.why_it_matters_for_document ?? detail?.why_it_matters ?? "";
  const nodeRole = sectionLabel[node.type];
  const prerequisiteLabel = detail?.prerequisite_concepts?.[0]?.title ?? "선수 개념";
  const nextLabel = detail?.next_nodes?.[0] ?? "다음 개념";
  const tableRows = [
    { label: "핵심 역할", value: nodeRole },
    { label: "쉽게 말하면", value: detail?.easy_explanation || node.description },
    { label: "왜 중요한가", value: whyItMatters },
  ].filter((row) => row.value?.trim());

  return (
    <div className="detail-learning-blocks">
      {explanation ? (
        <section className="detail-learning-card detail-learning-summary">
          <span>한 줄로 잡기</span>
          <strong>{explanation}</strong>
        </section>
      ) : null}

      {explanation || detail?.prerequisite_concepts?.length || detail?.next_nodes?.length ? (
        <section className="detail-learning-card">
          <h3>개념 스케치</h3>
          <div className="concept-sketch">
            <div className="sketch-lane">
              <div className="sketch-node sketch-prerequisite">
                <span>선수 조건</span>
                <strong>{prerequisiteLabel}</strong>
                <em>{node.community ?? "기반 지식"}</em>
              </div>
              <div className="sketch-arrow" aria-hidden="true" />
              <div className="sketch-node sketch-main">
                <span>현재 초점</span>
                <strong>{node.title}</strong>
                <em>{nodeRole}</em>
              </div>
              <div className="sketch-arrow" aria-hidden="true" />
              <div className="sketch-node sketch-next">
                <span>연결 방향</span>
                <strong>{nextLabel}</strong>
                <em>이후 학습으로 확장</em>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tableRows.length >= 2 ? (
        <section className="detail-learning-card">
          <h3>학습 정리표</h3>
          <table className="detail-learning-table">
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
