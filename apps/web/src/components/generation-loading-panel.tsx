interface GenerationLoadingPanelProps {
  title: string;
  elapsedSeconds: number;
  stageMessage: string;
  compact?: boolean;
}

function waitHint(elapsedSeconds: number): string {
  if (elapsedSeconds >= 90) return "거의 완료 단계입니다. 결과를 저장하고 있어요.";
  if (elapsedSeconds >= 50) return "큰 주제일수록 관계 검증에 시간이 더 걸릴 수 있습니다.";
  if (elapsedSeconds >= 20) return "AI가 개념 사이의 선수관계를 검토하고 있습니다.";
  return "주제에서 학습 가능한 개념 카드를 뽑고 있습니다.";
}

export function GenerationLoadingPanel({
  title,
  elapsedSeconds,
  stageMessage,
  compact = false,
}: GenerationLoadingPanelProps) {
  return (
    <div className={`generation-loading-panel ${compact ? "is-compact" : ""}`}>
      <div className="generation-loading-copy">
        <div>
          <p className="generation-loading-title">{title} · {elapsedSeconds}초 경과</p>
          <p className="generation-loading-stage">{stageMessage}</p>
        </div>
        <span className="generation-loading-pulse" aria-hidden="true" />
      </div>

      <div className="generation-map-preview" aria-hidden="true">
        <span className="preview-line line-a" />
        <span className="preview-line line-b" />
        <span className="preview-line line-c" />
        <span className="preview-node node-a" />
        <span className="preview-node node-b" />
        <span className="preview-node node-c" />
        <span className="preview-node node-d" />
        <span className="preview-node node-e" />
      </div>

      <p className="generation-loading-hint">{waitHint(elapsedSeconds)}</p>
    </div>
  );
}
