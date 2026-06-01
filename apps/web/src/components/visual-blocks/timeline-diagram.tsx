import type { TimelineVisualBlock } from "@/lib/visualization/visual-block-schema";

interface TimelineDiagramProps {
  block: TimelineVisualBlock;
}

export function TimelineDiagram({ block }: TimelineDiagramProps) {
  if (block.events.length === 0) return null;

  const lanes = timelineLanes(block);

  return (
    <div className="visual-block-diagram timeline-diagram">
      {lanes.map((lane) => (
        <section className="timeline-lane" key={lane.label}>
          <h4>{lane.label}</h4>
          <ol className="timeline-events">
            {lane.events.map((event, index) => (
              <li className="timeline-event" key={`${event.time_label}-${event.label}-${index}`}>
                <span>{event.time_label}</span>
                <div>
                  <strong>{event.label}</strong>
                  {event.description ? <p>{event.description}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function timelineLanes(block: TimelineVisualBlock) {
  if (!block.lanes?.length) {
    return [{ label: "시간 순서", events: block.events }];
  }

  const laneOrder = [...block.lanes];
  for (const event of block.events) {
    const label = event.lane ?? "공통";
    if (!laneOrder.includes(label)) laneOrder.push(label);
  }

  return laneOrder
    .map((label) => ({
      label,
      events: block.events.filter((event) => (event.lane ?? "공통") === label),
    }))
    .filter((lane) => lane.events.length > 0);
}
