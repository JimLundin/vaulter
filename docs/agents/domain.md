# Domain docs

This repo uses a single context: `GLOSSARY.md` at the repo root and decisions in `docs/adr/`.

## Before exploration or design

- Read the root glossary when it exists, and relevant ADRs before working in their area.
- If a root `GLOSSARY-MAP.md` is introduced later, follow its relevant glossary pointers and
  context-scoped ADR locations instead.
- If these documents do not exist, proceed silently. Create them lazily through domain modeling
  when a term or decision is actually resolved.

## Vocabulary and decisions

Use the glossary's canonical domain terms in specs, proposals and tests. If a needed term is
missing, check existing project language before proposing a glossary addition.

Surface a conflict with an existing ADR explicitly, naming the decision and explaining why it
should be revisited. Keep domain definitions in the glossary and implementation trade-offs in ADRs.
