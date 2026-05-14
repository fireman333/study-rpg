# CONTENT_SCHEMA — Writing a content pack

A content pack is a workspace package that exports a `getContentPack()` function returning a `ContentPack` object. The engine (`@study-rpg/core`) consumes it.

## Minimum viable content pack

```
packages/content-<your-exam>/
├── package.json
├── scripts/build.ts      # your custom extractor (markdown / CSV / API → JSON)
├── dist/                 # gitignored; written by build.ts
│   ├── meta.json
│   ├── subjects.json
│   └── questions.json
└── src/index.ts          # exports getContentPack(): Promise<ContentPack>
```

## TypeScript interfaces

Imported from `@study-rpg/core`:

```ts
interface ContentPack {
  meta: ContentPackMeta
  subjects: Subject[]
  questions: Question[]
}

interface ContentPackMeta {
  id: string                                      // unique slug, e.g. "medexam-tw"
  displayName: string                             // human label
  locale: string                                  // BCP-47 ("zh-TW", "en-US")
  examMeta?: Record<string, unknown>              // exam-specific extras
  credits: { name: string; url?: string; license: string }[]
  statSchema?: StatSchema                         // optional: override 4-stat default
  lootTriggers?: { readMinutesPerRoll?: number; ... } // optional: per-pack tuning
}

interface Subject {
  id: string                                      // unique within the pack
  displayName: string
  group?: string                                  // e.g. "醫學一" / "core" / "section A"
  color: string                                   // CSS color
  iconKey?: string                                // matches theme.sprites[iconKey]
  totalQuestions: number
}

interface Question {
  id: string                                      // globally unique
  subject: string                                 // matches Subject.id
  stem: string
  options: Record<string, string>                 // { A: "...", B: "...", ... }
  answer: string                                  // key of options ("A" | "B" | ...)
  explanation: string                             // markdown
  hasImage?: boolean
  meta?: Record<string, unknown>                  // year / session / page / etc.
  sourceCredit?: string
}
```

## Rules

1. **`id` is permanent.** Don't change a question id between builds — SRS / attempt history depend on it.
2. **`options.answer` must be a key of `options`.** Verify at build time.
3. **`stem` and `explanation` accept markdown.** No HTML — sanitize at the source.
4. **`subject` in Question must exist in Subjects.** Build-time fail otherwise.
5. **Locale.** Keep all UI strings in the host app; content pack stays language-neutral metadata.
6. **License.** Spell out attribution + use restrictions in `package.json["license"]` and a `CREDITS.md`. The engine displays `meta.credits[]` on every question card.

## Example: minimal English TOEFL pack

```ts
// packages/content-toefl-mini/src/index.ts
import type { ContentPack } from '@study-rpg/core'

export async function getContentPack(): Promise<ContentPack> {
  return {
    meta: {
      id: 'toefl-mini',
      displayName: 'TOEFL Mini Deck',
      locale: 'en-US',
      credits: [{ name: 'Public domain practice', license: 'CC0-1.0' }],
    },
    subjects: [
      { id: 'reading', displayName: 'Reading', color: '#6a9bc4', totalQuestions: 25 },
      { id: 'listening', displayName: 'Listening', color: '#6a8c3f', totalQuestions: 25 },
    ],
    questions: [
      {
        id: 'toefl-r-001',
        subject: 'reading',
        stem: 'The word "ample" in line 4 most nearly means…',
        options: { A: 'limited', B: 'plentiful', C: 'narrow', D: 'urgent' },
        answer: 'B',
        explanation: 'Ample = more than enough; plentiful.',
      },
    ],
  }
}
```

## Build-script options

Your build script can run **at install time** or **on demand**:

- `pnpm --filter @study-rpg/content-<your> build` should produce JSON in `dist/`
- The host app should copy `dist/*.json` to `public/content/<id>/` so `fetch()` works in the browser

## Validation (recommended)

Run a schema check before shipping:

```ts
function validate(pack: ContentPack) {
  const subjects = new Set(pack.subjects.map((s) => s.id))
  for (const q of pack.questions) {
    if (!subjects.has(q.subject)) throw new Error(`Q ${q.id}: bad subject ${q.subject}`)
    if (!(q.answer in q.options)) throw new Error(`Q ${q.id}: answer ${q.answer} not in options`)
  }
}
```

## Publishing

Once stable (post-core 1.0), publish to npm under your org:

```bash
npm publish --access public packages/content-<your-exam>
```

Then add to your [`awesome-study-rpg`](#) entry (TBD).
