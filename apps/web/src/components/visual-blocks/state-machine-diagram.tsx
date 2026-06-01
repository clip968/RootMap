import type { StateMachineVisualBlock } from "@/lib/visualization/visual-block-schema";

interface StateMachineDiagramProps {
  block: StateMachineVisualBlock;
}

export function StateMachineDiagram({ block }: StateMachineDiagramProps) {
  const stateIds = new Set(block.states.map((state) => state.id));
  if (
    block.states.length === 0 ||
    block.transitions.some((transition) => !stateIds.has(transition.from) || !stateIds.has(transition.to))
  ) {
    return null;
  }

  const stateLabelById = new Map(block.states.map((state) => [state.id, state.label]));
  const selfLoops = block.transitions.filter((transition) => transition.from === transition.to);
  const transitions = block.transitions.filter((transition) => transition.from !== transition.to);

  return (
    <div className="visual-block-diagram state-machine-diagram">
      <p className="visual-block-sr-summary">
        {block.title}: 상태 {block.states.length}개와 전이 {block.transitions.length}개로
        구성된 상태 전이입니다.
      </p>
      <div className="state-machine-states" role="list">
        {block.states.map((state) => (
          <div className="state-machine-state" role="listitem" key={state.id}>
            <strong>{state.label}</strong>
            {state.description ? <p>{state.description}</p> : null}
          </div>
        ))}
      </div>

      {transitions.length > 0 ? (
        <ul className="state-machine-transitions">
          {transitions.map((transition, index) => (
            <li key={`${transition.from}-${transition.to}-${index}`}>
              <span>{stateLabelById.get(transition.from) ?? transition.from}</span>
              <strong>{transition.label}</strong>
              <span>{stateLabelById.get(transition.to) ?? transition.to}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {selfLoops.length > 0 ? (
        <div className="state-machine-self-loops">
          {selfLoops.map((transition, index) => (
            <span key={`${transition.from}-${transition.label}-${index}`}>
              {stateLabelById.get(transition.from) ?? transition.from}: {transition.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
