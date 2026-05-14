# @study-rpg/content-medexam2-tw

Content pack for **台灣二階醫師國考** (Taiwan Stage-2 medical board exam).

## Status

🚧 **Scaffold only** — ingestion of the ~12,160 Q corpus (醫學三–六, 14 subjects) is tracked under `openspec/changes/ingest-medexam2-tw-corpus` and has not landed yet. `getContentPack()` currently returns an empty `ContentPack` placeholder.

## Scope

- **Source data**: `~/Desktop/國考/二階國考/二階國考_拆分/` (YAML frontmatter + Markdown, 14 科 / 醫學三–六)
- **Explanations**: LLM-generated, in progress (partial completion as of 2026-05-15)
- **Output**: `dist/{questions,subjects,meta}.json` (same shape as `@study-rpg/content-medexam-tw`)

## Public API

`getContentPack(baseUrl)` — matches the `content-pack-contract` capability. Returns `Promise<ContentPack>`.

Pre-ingest behavior: returns `EMPTY_CONTENT_PACK` (no questions, no subjects) so consumers don't crash.

## Consumer

`apps/medexam2-hospital-tw` (二階國考經營 RPG).

## License

See `LICENSE.md` — currently **TBD-after-ingest**. Will be locked in `ingest-medexam2-tw-corpus` change.
