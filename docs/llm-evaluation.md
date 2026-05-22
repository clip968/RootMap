# LLM Evaluation

## Scope

Phase 06 evaluates document-grounded generation before adding a full RAG chat surface.

## Small CI Eval

- JSON schema validity.
- Claim to evidence mapping.
- Unsupported claim count.
- Unsupported rate by source type: `explicit`, `inferred`, `generated`.
- Prompt injection red-team fixture detection.

## Full Eval

Run manually or on a schedule when LLM cost is acceptable. Suggested fixtures:

- Transformer paper notes.
- Operating systems lecture material.
- Rust lifetime notes.

## Current Rule

`evaluateEvidenceGrounding` is a lightweight lexical guard, not an LLM judge. It is designed to catch obvious missing evidence and low-overlap claims cheaply.

`scanPromptInjectionRisk` flags instruction-like document content. Initial policy is risk flagging rather than hard blocking.
