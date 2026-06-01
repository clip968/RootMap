interface VisualBlockAnnotationsProps {
  annotations: string[];
}

export function VisualBlockAnnotations({ annotations }: VisualBlockAnnotationsProps) {
  const items = annotations
    .map((annotation) => annotation.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (items.length === 0) return null;

  return (
    <ul className="visual-block-annotations">
      {items.map((annotation) => (
        <li key={annotation}>{annotation}</li>
      ))}
    </ul>
  );
}
