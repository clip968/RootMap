# Plan

RootMap의 학습 구조를 전통적인 tree에서 community 기반 concept graph로 확장한다. LLM은 더 이상 완성된 tree shape를 직접 만들지 않고, concept card, category, priority, prerequisite edge, community label을 생성하며, 앱은 이 graph에서 learning path, community map, deep dive view를 계산한다.

## Scope

- In:
  - 주제 기반 생성 결과를 concept graph 중심으로 재정의한다.
  - 선수지식이 다시 이해되지 않을 때 해당 concept을 root로 재확장할 수 있게 설계한다.
  - community map, learning path, deep dive view를 같은 graph 데이터에서 파생한다.
  - 기존 tree 화면은 graph의 한 가지 view로 유지한다.
- Out:
  - 소셜 커뮤니티, 사용자 간 공유, 댓글/토론 기능은 포함하지 않는다.
  - 그래프 추천 AI 전체 고도화나 장기 개인화 모델은 이번 계획의 직접 구현 범위가 아니다.
  - 기존 Supabase Postgres 전환, LLM provider 설정, 문서 업로드 storage 전환은 별도 계획으로 유지한다.

## Action items

[x] Add graph-first generation contract in `apps/web/src/lib/llm/prompts.ts`: ask the LLM for concept cards with `id`, `title`, `type`, `community`, `priority`, `prerequisites`, and relation hints instead of asking for a finished tree shape.

[x] Add outline schemas in `apps/web/src/lib/llm/schemas.ts` for community graph output: validate unique concept ids, valid prerequisite refs, valid community labels, numeric priority, and supported edge relation types.

[x] Refactor `apps/web/src/lib/llm/generate-tree.ts` so outline generation produces a concept graph first, then derives `recommended_order`, `children`, and depth from prerequisite edges and priority.

[x] Add graph derivation utilities under `apps/web/src/lib/tree/`: compute prerequisite depth, reverse `children`, same-depth priority ordering, cycle detection, disconnected community handling, and fallback ordering.

[x] Persist community membership in the concept layer. If the existing schema is insufficient, add tables or fields for `concept_communities` and `community_members`, while keeping existing `concept_edges` for prerequisite/related/misconception edges.

[x] Update repository/service code so generated trees save both the graph data and the view-specific tree payload. The stored graph should be reusable across future views and deep dives.

[x] Update the tree UI in `apps/web/src/components/tree-page-client.tsx` to support two modes: `Learning Path` for priority/depth order and `Community Map` for clustered concept groups.

[x] Add a concept-level action: "이 개념을 더 쪼개기". This starts a new generation using the selected concept as root and existing related concepts as context.

[x] Add user-facing generation phase messages in `start-topic-form.tsx` and `tree-page-client.tsx`: "개념 카드를 분류하고 있어요", "선수관계를 계산하고 있어요", "커뮤니티를 묶고 있어요", "학습 순서를 정리하고 있어요".

[x] Add focused smoke tests for graph generation and derivation: priority ordering, prerequisite depth calculation, cycle rejection, community grouping, and deep-dive generation input.

[ ] Verify with `npx tsx` smoke scripts, `npm run lint`, `npm run build`, and one real Vercel preview smoke using CrofAI or another configured OpenAI-compatible provider.
    - Local verification completed: `smoke-community-graph-derivation`, `smoke-learning-tree-split-generation`, `npm run lint`, `npm run build`.
    - Vercel preview smoke is still pending after deployment.

## Data Model Direction

```text
Concept
  id
  canonical_title
  aliases
  type
  short_description

ConceptCommunity
  id
  topic_id or tree_id
  name
  summary
  priority

CommunityMember
  community_id
  concept_id
  role
  priority

ConceptEdge
  from_concept_id
  to_concept_id
  relation_type
  reason

LearningPathView
  tree_id
  concept_id
  depth
  priority
  recommended_order
```

## View Model Direction

```text
Community Map

                         [운영체제]
                              |
      -------------------------------------------------
      |                    |                  |
      v                    v                  v

 [실행 모델]          [메모리 관리]          [동시성]
      |                    |                  |
   [프로세스]          [주소 공간]          [임계구역]
      |                    |                  |
   [스레드] --------> [공유 메모리] <------ [락]
      |                    |                  |
 [컨텍스트 스위칭]    [가상 메모리]        [데드락]
      |                    |                  ^
      +--------------> [스케줄링] -----------+
```

```text
Learning Path

Level 0: [컴퓨터 시스템] [프로그램 실행] [메모리 기본]
Level 1: [프로세스] [주소 공간] [인터럽트]
Level 2: [스레드] [스케줄링] [가상 메모리]
Level 3: [동시성] [락] [페이지 교체]
Level 4: [데드락] [점검 퀴즈] [오해 교정]
```

## Risks

- LLM이 prerequisite edge를 과하게 만들면 graph가 복잡해져 UI가 읽기 어려워질 수 있다.
- prerequisite cycle이 생기면 depth 계산이 깨질 수 있으므로 cycle rejection 또는 edge downgrade가 필요하다.
- 기존 tree 저장 payload와 새 graph 저장 모델 사이의 호환 계층이 필요하다.
- community map view가 너무 자유로우면 초보자가 "무엇부터 공부해야 하는지"를 잃을 수 있으므로 learning path view를 기본값으로 유지한다.

## Decisions

- Community는 우선 tree 단위로 저장한다. `concept_communities.tree_id`와 `community_members`가 Concept layer membership을 보존한다.
- `learning_trees.tree_json`에는 graph-derived view snapshot(`community`, `priority`, `depth`, `children`, `communities`)을 같이 둔다. Concept layer tables는 재사용/분석용 canonical membership이다.
- Deep dive generation은 현재 선택한 concept 제목과 주변 관계를 topic context로 넣어 새 tree를 생성한다. 기존 graph에 subgraph append는 후속 고도화로 남긴다.
