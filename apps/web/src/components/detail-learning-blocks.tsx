import type { ApiLearningNode, NodeType } from "@/types/learning";
import type { ApiNodeDetailResponse } from "@/lib/services/node-detail";

type DetailRelation = {
  node: ApiLearningNode;
  direction: "parent" | "child";
};

interface DetailLearningBlocksProps {
  node: ApiLearningNode;
  detail: ApiNodeDetailResponse | null;
  relations: DetailRelation[];
  sectionLabel: Record<NodeType, string>;
  onOpenNode: (nodeId: string) => void;
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
  relations,
  sectionLabel,
  onOpenNode,
}: DetailLearningBlocksProps) {
  const explanation = firstSentence(
    detail?.easy_explanation || node.description || "",
  );
  const parents = relations.filter((relation) => relation.direction === "parent");
  const children = relations.filter((relation) => relation.direction === "child");

  return (
    <div className="detail-learning-blocks">
      {explanation ? (
        <section className="detail-learning-card detail-learning-summary">
          <span>한 줄로 잡기</span>
          <strong>{explanation}</strong>
        </section>
      ) : null}

      <section className="detail-learning-card">
        <h3>이 개념의 위치</h3>
        <div className="concept-fact-grid">
          <div>
            <span>역할</span>
            <strong>{sectionLabel[node.type]}</strong>
          </div>
          {node.community ? (
            <div>
              <span>묶음</span>
              <strong>{node.community}</strong>
            </div>
          ) : null}
          {node.depth != null ? (
            <div>
              <span>깊이</span>
              <strong>Level {node.depth}</strong>
            </div>
          ) : null}
          <div>
            <span>연결</span>
            <strong>{parents.length} 이전 · {children.length} 다음</strong>
          </div>
        </div>
      </section>

      {relations.length > 0 ? (
        <section className="detail-learning-card">
          <h3>관계로 보기</h3>
          <div className="detail-relation-flow">
            <div className="relation-column">
              <span>먼저 알 것</span>
              {parents.length > 0 ? (
                parents.slice(0, 3).map((relation) => (
                  <button
                    key={relation.node.id}
                    type="button"
                    onClick={() => onOpenNode(relation.node.id)}
                  >
                    {relation.node.title}
                  </button>
                ))
              ) : (
                <em>시작점</em>
              )}
            </div>
            <div className="relation-current">
              <span>현재</span>
              <strong>{node.title}</strong>
            </div>
            <div className="relation-column">
              <span>이어질 것</span>
              {children.length > 0 ? (
                children.slice(0, 3).map((relation) => (
                  <button
                    key={relation.node.id}
                    type="button"
                    onClick={() => onOpenNode(relation.node.id)}
                  >
                    {relation.node.title}
                  </button>
                ))
              ) : (
                <em>마무리</em>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {detail?.example ? (
        <section className="detail-learning-card detail-example-card">
          <h3>예시로 잡기</h3>
          <p>{detail.example}</p>
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
