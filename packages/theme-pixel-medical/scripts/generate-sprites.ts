#!/usr/bin/env tsx
/**
 * generate-sprites.ts — invoke `codex exec` (codex CLI's built-in gpt-image-2)
 * for each sprite declared in `sprites.manifest.json`, save each PNG to the
 * path declared in the manifest, and record a `manifest.results.json` with
 * sha256 checksum + timestamp per file.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-sprites.ts --keys=character-base,hairband
 *   pnpm exec tsx scripts/generate-sprites.ts --all
 *   pnpm exec tsx scripts/generate-sprites.ts --all --skip-existing --concurrency=3
 *   pnpm exec tsx scripts/generate-sprites.ts --keys=hairband --dry-run
 *
 * Flags:
 *   --all                  generate every sprite in the manifest
 *   --keys=k1,k2,...       generate the listed keys only
 *   --skip-existing        skip sprites whose target file already exists with >0 bytes
 *   --concurrency=N        run N codex calls in parallel (default 3)
 *   --dry-run              print plan, don't invoke codex
 *
 * Implementation notes:
 *  - We do NOT shell out to the `cdx image` skill wrapper because that skill
 *    pins its own output path under `~/.claude/scratch/cdx-images/<date>/`.
 *    Per the cdx SKILL.md, the underlying call is just
 *      `timeout 120 codex exec "Generate <PROMPT>. Save the result to <ABS>. $imagegen"`
 *    so we invoke that directly to write straight to the manifest path.
 *  - codex CLI uses OAuth (Codex Plus trial) — no per-image cost.
 *  - Each call runs with a 360s timeout (image gen typically 10–40s, but can
 *    drift past 180s under load).
 *  - On hard failure (non-zero exit, no file written) the batch BAILS: any
 *    in-flight calls finish but no further batches start, and the process
 *    exits non-zero. Per coding_principles "No Silent Errors" — never let a
 *    silent skip mask a broken pipeline.
 */

import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── paths ────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PACKAGE_ROOT = resolve(__dirname, '..')
const MANIFEST_PATH = join(__dirname, 'sprites.manifest.json')
const RESULTS_PATH = join(__dirname, 'manifest.results.json')
const SPRITES_DIR = join(PACKAGE_ROOT, 'sprites')

// ─── types ────────────────────────────────────────────────────────────────
interface SpriteEntry {
  key: string
  filename: string
  size: string
  prompt: string
}
interface Manifest {
  styleAnchor: string
  negativePrompt: string
  sprites: SpriteEntry[]
}
interface ResultEntry {
  key: string
  filename: string
  absolutePath: string
  status: 'ok' | 'failed' | 'skipped'
  bytes?: number
  sha256?: string
  generatedAt?: string
  elapsedMs?: number
  error?: string
  note?: string
}
interface Results {
  generatedAt: string
  cdxModel: 'codex-cli/gpt-image-2'
  results: ResultEntry[]
}

// ─── CLI args ─────────────────────────────────────────────────────────────
interface CliArgs {
  keys: Set<string> | 'all'
  dryRun: boolean
  skipExisting: boolean
  concurrency: number
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2)
  let keys: Set<string> | 'all' | null = null
  let dryRun = false
  let skipExisting = false
  let concurrency = 3
  for (const arg of argv) {
    if (arg === '--all') keys = 'all'
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--skip-existing') skipExisting = true
    else if (arg.startsWith('--keys=')) {
      const list = arg.slice('--keys='.length).split(',').map((s) => s.trim()).filter(Boolean)
      keys = new Set(list)
    } else if (arg.startsWith('--concurrency=')) {
      const n = parseInt(arg.slice('--concurrency='.length), 10)
      if (!Number.isFinite(n) || n < 1 || n > 8) {
        console.error(`FATAL: --concurrency must be 1..8, got ${arg.slice('--concurrency='.length)}`)
        process.exit(2)
      }
      concurrency = n
    } else {
      console.error(`FATAL: unknown arg ${arg}`)
      process.exit(2)
    }
  }
  if (keys == null) {
    console.error(
      'usage: generate-sprites.ts --all | --keys=key1,key2,... [--skip-existing] [--concurrency=N] [--dry-run]',
    )
    process.exit(2)
  }
  return { keys, dryRun, skipExisting, concurrency }
}

// ─── pre-flight ───────────────────────────────────────────────────────────
function preflight(): void {
  try {
    execSync('which codex', { stdio: 'ignore' })
  } catch {
    console.error('FATAL: `codex` CLI not on PATH. Install via Codex Plus and run `codex login`.')
    process.exit(1)
  }
  const authPath = join(process.env.HOME ?? '', '.codex', 'auth.json')
  if (!existsSync(authPath)) {
    console.error(`FATAL: codex OAuth not found at ${authPath}. Run \`codex login\`.`)
    process.exit(1)
  }
}

// ─── core: invoke codex exec for one sprite ──────────────────────────────
function buildFullPrompt(manifest: Manifest, sprite: SpriteEntry): string {
  // styleAnchor (with size hint) + per-sprite subject + negative prompt
  return [
    manifest.styleAnchor,
    `Target canvas: ${sprite.size} px square.`,
    `Subject: ${sprite.prompt}.`,
    `Avoid: ${manifest.negativePrompt}.`,
  ].join(' ')
}

function generateOne(
  manifest: Manifest,
  sprite: SpriteEntry,
  dryRun: boolean,
): Promise<ResultEntry> {
  const absPath = join(SPRITES_DIR, sprite.filename)
  mkdirSync(dirname(absPath), { recursive: true })

  const fullPrompt = buildFullPrompt(manifest, sprite)
  // codex exec needs the prompt as a single positional arg; the $imagegen
  // token MUST be passed literally (codex CLI treats it as a trigger
  // sentinel; shell expansion must not consume it).
  const codexInstruction = `Generate ${fullPrompt} Save the result to ${absPath}. $imagegen`

  if (dryRun) {
    console.log(`  [${sprite.key}] (dry-run — skipping codex exec) → ${absPath}`)
    return Promise.resolve({
      key: sprite.key,
      filename: sprite.filename,
      absolutePath: absPath,
      status: 'skipped',
    })
  }

  return new Promise<ResultEntry>((resolvePromise) => {
    const start = Date.now()
    // spawn (async), pass codexInstruction as a single argv element so the
    // `$imagegen` token never goes through shell interpolation.
    const proc = spawn(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'workspace-write',
        '-C',
        PACKAGE_ROOT,
        codexInstruction,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })

    const timeoutMs = 360_000
    const killer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, timeoutMs)

    proc.on('error', (err) => {
      clearTimeout(killer)
      const elapsedMs = Date.now() - start
      console.error(`  [${sprite.key}] FAILED to spawn codex: ${err.message}`)
      resolvePromise({
        key: sprite.key,
        filename: sprite.filename,
        absolutePath: absPath,
        status: 'failed',
        elapsedMs,
        error: `spawn error: ${err.message}`,
      })
    })

    proc.on('close', (code, signal) => {
      clearTimeout(killer)
      const elapsedMs = Date.now() - start

      if (code !== 0) {
        const stderrTail = stderr.slice(-1200)
        const sigMsg = signal ? ` (signal=${signal})` : ''
        console.error(`  [${sprite.key}] FAILED exit ${code}${sigMsg} in ${elapsedMs}ms`)
        if (stderrTail) console.error(`    stderr tail: ${stderrTail.slice(-400).replace(/\n/g, ' | ')}`)
        // Even on non-zero exit, the file might exist (codex sometimes writes
        // then errors on cleanup — see hippocrates-charm prior result). Patch
        // the result post-hoc if a valid PNG exists.
        if (existsSync(absPath)) {
          const stat = statSync(absPath)
          if (stat.size > 0) {
            const buf = readFileSync(absPath)
            // Verify PNG magic
            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
              const sha = createHash('sha256').update(buf).digest('hex')
              console.error(`    NOTE: file exists at ${absPath} (${stat.size}B, valid PNG) despite exit ${code} — recording as ok`)
              return resolvePromise({
                key: sprite.key,
                filename: sprite.filename,
                absolutePath: absPath,
                status: 'ok',
                bytes: stat.size,
                sha256: sha,
                generatedAt: new Date().toISOString(),
                elapsedMs,
                note: `codex exited ${code}${sigMsg} but valid PNG was written`,
              })
            }
          }
        }
        return resolvePromise({
          key: sprite.key,
          filename: sprite.filename,
          absolutePath: absPath,
          status: 'failed',
          elapsedMs,
          error: `exit ${code}${sigMsg}: ${stderrTail.slice(-400)}`,
        })
      }

      if (!existsSync(absPath)) {
        const stdoutTail = stdout.slice(-1200)
        console.error(`  [${sprite.key}] FAILED: codex returned 0 but no file at ${absPath}`)
        if (stdoutTail) console.error(`    stdout tail: ${stdoutTail.slice(-400).replace(/\n/g, ' | ')}`)
        return resolvePromise({
          key: sprite.key,
          filename: sprite.filename,
          absolutePath: absPath,
          status: 'failed',
          elapsedMs,
          error: 'codex exit 0 but no output file written',
        })
      }
      const stat = statSync(absPath)
      if (stat.size === 0) {
        console.error(`  [${sprite.key}] FAILED: file is 0 bytes at ${absPath}`)
        return resolvePromise({
          key: sprite.key,
          filename: sprite.filename,
          absolutePath: absPath,
          status: 'failed',
          elapsedMs,
          error: 'output file is 0 bytes',
        })
      }
      const buf = readFileSync(absPath)
      // Verify PNG magic
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
        console.error(`  [${sprite.key}] FAILED: file is not a valid PNG (bad magic)`)
        return resolvePromise({
          key: sprite.key,
          filename: sprite.filename,
          absolutePath: absPath,
          status: 'failed',
          elapsedMs,
          error: 'output file is not a valid PNG (bad magic bytes)',
        })
      }
      const sha = createHash('sha256').update(buf).digest('hex')
      console.log(`  [${sprite.key}] OK ${stat.size}B sha=${sha.slice(0, 12)}… (${(elapsedMs / 1000).toFixed(1)}s)`)
      resolvePromise({
        key: sprite.key,
        filename: sprite.filename,
        absolutePath: absPath,
        status: 'ok',
        bytes: stat.size,
        sha256: sha,
        generatedAt: new Date().toISOString(),
        elapsedMs,
      })
    })
  })
}

// ─── persistence helper ──────────────────────────────────────────────────
function persistResults(
  manifest: Manifest,
  startedAt: string,
  priorResults: Map<string, ResultEntry>,
): void {
  const all = manifest.sprites
    .map((s) => priorResults.get(s.key))
    .filter((x): x is ResultEntry => !!x)
  const results: Results = {
    generatedAt: startedAt,
    cdxModel: 'codex-cli/gpt-image-2',
    results: all,
  }
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
}

// ─── main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  preflight()
  const { keys, dryRun, skipExisting, concurrency } = parseArgs()

  const raw = readFileSync(MANIFEST_PATH, 'utf-8')
  const manifest = JSON.parse(raw) as Manifest
  if (!Array.isArray(manifest.sprites) || manifest.sprites.length === 0) {
    console.error('FATAL: manifest has no sprites.')
    process.exit(1)
  }

  // Validate requested keys against manifest
  const allKeys = new Set(manifest.sprites.map((s) => s.key))
  let target: SpriteEntry[]
  if (keys === 'all') {
    target = manifest.sprites
  } else {
    for (const k of keys) {
      if (!allKeys.has(k)) {
        console.error(`FATAL: requested key "${k}" not in manifest. Valid keys:`)
        for (const valid of allKeys) console.error(`  - ${valid}`)
        process.exit(1)
      }
    }
    target = manifest.sprites.filter((s) => keys.has(s.key))
  }

  // Apply --skip-existing filter (after key selection so a re-run report
  // accurately reflects what we DECIDED to skip, not just what wasn't asked
  // for).
  const skippedExisting: SpriteEntry[] = []
  if (skipExisting) {
    target = target.filter((s) => {
      const absPath = join(SPRITES_DIR, s.filename)
      if (existsSync(absPath) && statSync(absPath).size > 0) {
        skippedExisting.push(s)
        return false
      }
      return true
    })
  }

  console.log(
    `generate-sprites: ${target.length} sprite(s) to generate${dryRun ? ' (DRY RUN)' : ''}`
    + ` | concurrency=${concurrency}`
    + (skipExisting ? ` | skipped ${skippedExisting.length} already-existing` : ''),
  )
  if (skippedExisting.length > 0) {
    console.log(`  pre-existing (skipped): ${skippedExisting.map((s) => s.key).join(', ')}`)
  }
  console.log(`output dir: ${SPRITES_DIR}`)

  // Load existing results file if present so re-runs append rather than wipe.
  const priorResults: Map<string, ResultEntry> = new Map()
  if (existsSync(RESULTS_PATH)) {
    try {
      const prior = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as Results
      for (const r of prior.results) priorResults.set(r.key, r)
    } catch {
      console.warn('  (existing manifest.results.json could not be parsed; will overwrite)')
    }
  }

  const startedAt = new Date().toISOString()
  const fresh: ResultEntry[] = []
  const totalBatches = Math.ceil(target.length / concurrency)
  let bailed = false
  let bailKey = ''
  let bailErr = ''

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = target.slice(batchIdx * concurrency, (batchIdx + 1) * concurrency)
    const batchKeys = batch.map((s) => s.key).join(', ')
    console.log(`\n[batch ${batchIdx + 1}/${totalBatches}] generating: ${batchKeys}`)

    const batchResults = await Promise.all(
      batch.map((sprite) => generateOne(manifest, sprite, dryRun)),
    )

    for (const r of batchResults) {
      fresh.push(r)
      priorResults.set(r.key, r)
    }
    persistResults(manifest, startedAt, priorResults)

    // BAIL OUT if any failed (per coding_principles "No Silent Errors")
    const firstFail = batchResults.find((r) => r.status === 'failed')
    if (firstFail) {
      bailed = true
      bailKey = firstFail.key
      bailErr = firstFail.error ?? '(unknown)'
      console.error(
        `\nFATAL: sprite "${firstFail.key}" failed: ${firstFail.error}`,
      )
      console.error(`  filename: ${firstFail.filename}`)
      console.error(`  Aborting remaining batches. Re-run with --skip-existing to resume from the failure.`)
      break
    }
  }

  const ok = fresh.filter((r) => r.status === 'ok').length
  const failed = fresh.filter((r) => r.status === 'failed').length
  const skipped = fresh.filter((r) => r.status === 'skipped').length
  console.log(
    `\nDone. ok=${ok} failed=${failed} skipped=${skipped} (of ${fresh.length} attempted, ${target.length} planned)`,
  )
  console.log(`Results: ${RESULTS_PATH}`)
  if (bailed) {
    console.error(`Bailed on key="${bailKey}" — err="${bailErr.slice(0, 200)}"`)
    process.exit(1)
  }
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('UNHANDLED:', err)
  process.exit(1)
})
