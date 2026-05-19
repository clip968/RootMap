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

function shortText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
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
  const misconception = detail?.common_misconceptions?.[0] ?? "";
  const example = detail?.example?.trim() ?? "";
  const tableRows = [
    { label: "핵심 역할", value: sectionLabel[node.type] },
    { label: "쉽게 말하면", value: detail?.easy_explanation || node.description },
    { label: "왜 중요한가", value: whyItMatters },
    { label: "예시", value: detail?.example },
    { label: "주의점", value: misconception },
  ].filter((row) => row.value?.trim());

  return (
    <div className="detail-learning-blocks">
      {explanation ? (
        <section className="detail-learning-card detail-learning-summary">
          <span>한 줄로 잡기</span>
          <strong>{explanation}</strong>
        </section>
      ) : null}

      {explanation || detail?.example || misconception ? (
        <section className="detail-learning-card">
          <h3>개념 스케치</h3>
          <div className="concept-sketch">
            <div className="sketch-node sketch-main">
              <span>개념</span>
              <strong>{node.title}</strong>
            </div>
            <div className="sketch-arrow" aria-hidden="true" />
            <div className="sketch-node">
              <span>핵심 감각</span>
              <strong>{shortText(explanation || "실제 상황에 적용해 보는 개념", 48)}</strong>
            </div>
            <div className="sketch-arrow" aria-hidden="true" />
            <div className="sketch-node">
              <span>주의</span>
              <strong>{shortText(misconception || "정의만 외우지 말고 쓰임까지 보기", 44)}</strong>
            </div>
          </div>
          {example || whyItMatters ? (
            <div className="sketch-note-grid">
              {example ? (
                <div>
                  <span>예시</span>
                  <p>{example}</p>
                </div>
              ) : null}
              {whyItMatters ? (
                <div>
                  <span>왜 중요한가</span>
                  <p>{whyItMatters}</p>
                </div>
              ) : null}
            </div>
          ) : null}
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

      {detail?.common_misconceptions?.length ? (
        <section className="detail-learning-card">
          <h3>헷갈리기 쉬운 점</h3>
          <div className="misconception-card-list">
            {detail.common_misconceptions.map((item) => (
              <div key={item}>
                <span>주의</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
