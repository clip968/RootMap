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
  const misconception = detail?.common_misconceptions?.[0] ?? "";
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
              <span>작동 감각</span>
              <p>{detail?.example || explanation || "이 개념이 실제로 쓰이는 상황을 떠올려 보세요."}</p>
            </div>
            <div className="sketch-arrow" aria-hidden="true" />
            <div className="sketch-node">
              <span>주의</span>
              <p>{misconception || whyItMatters || "정의만 외우지 말고 언제 필요한지 같이 보세요."}</p>
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
