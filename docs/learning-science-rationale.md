# Learning Science Rationale

RootMap personalization is currently a rule-based MVP.

## Current Model

- Mastery state: `known`, `partial`, `unknown`.
- Confidence score, quiz counts, last studied time, and review need.
- Personalized recommendation score combines prerequisite gap, confidence, quiz error, recency, due date, retrievability, and importance.

## FSRS-lite Rule v1

FSRS-lite is not a full FSRS implementation. It is a deterministic due-date scheduler that stores:

- `review_due_at`
- `memory_stability`
- `memory_difficulty`
- `retrievability`
- `last_review_grade`
- `review_interval_days`
- `scheduler_version`

Positive recall increases stability and lowers difficulty. Failed recall lowers stability, raises difficulty, and schedules review sooner.

## Long-term Direction

Future versions can learn personalized memory parameters from quiz and event history. The long-term goal is mastery prediction, not just fixed rule scoring.
