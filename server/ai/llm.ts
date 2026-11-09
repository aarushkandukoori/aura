/**
 * llm.ts - the one place Aura talks to an AI model.
 *
 * askJson() sends instructions + a prompt (+ optional photos) and gets back JSON that matches a
 * JSON Schema you pass in. There are four ways to reach a model, picked once at startup:
 *
 *   "anthropic"  - the Claude API, used when ANTHROPIC_API_KEY is set. Fastest.
 *   "openai"     - the OpenAI API, used when OPENAI_API_KEY is set (and no Anthropic key).
 *   "claude-cli" - your own Claude Code login. Runs `claude -p` with every tool switched off and
 *                  no CLAUDE.md loaded, so it is a plain "prompt in, JSON out" call. No key needed.
 *   "offline"    - no model available. askJson() throws OfflineError and callers use templates.
 *
 * Force one with AURA_PROVIDER=anthropic|openai|claude-cli|offline. AURA_CLAUDE_BIN points at the
 * `claude` executable if it is not on PATH.
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import type { AiModel, ProviderInfo } from '../../shared/types.ts'
import { authEnabled, config } from '../config.ts'
import { bumpDailyCount, dailyCount } from '../db/accounts.ts'
import { getSetting, hasWorld, setSetting } from '../db/index.ts'

/** Thrown when no model is available (or the daily safety cap is reached). Callers fall back to templates. */
export class OfflineError extends Error {}

export const MODEL_IDS: Record<AiModel, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
}

/**
 * With an OpenAI key, Settings' three choices map to OpenAI models of the same size class
 * (cheapest to strongest). AURA_OPENAI_MODEL overrides all three, for example "gpt-5.4-mini".
 */
const OPENAI_MODEL_IDS: Record<AiModel, string> = {
  haiku: process.env.AURA_OPENAI_MODEL ?? 'gpt-6-luna',
  sonnet: process.env.AURA_OPENAI_MODEL ?? 'gpt-5.4-mini',
  opus: process.env.AURA_OPENAI_MODEL ?? 'gpt-5.5',
}

export interface ImageInput {
  data: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

export interface AskOptions {
  /** Short name for logs, e.g. "post-comments". */
  label: string
  /** Stable instructions (who the model is, the rules). Kept identical across calls so it caches. */
  system: string
  /** The specific request. */
  prompt: string
  /** JSON Schema the answer must match. */
  schema: Record<string, unknown>
  images?: ImageInput[]
  /** Defaults to the model this world chose in Settings. Only models the server allows are used. */
  model?: AiModel
  /** low = quick and casual (default). Use medium/high only for one-off creative work. */
  effort?: 'low' | 'medium' | 'high'
  timeoutMs?: number
  maxTokens?: number
}

// ----- which provider? -----------------------------------------------------------------------

type ProviderName = ProviderInfo['active']

function findClaudeBin(): string | null {
  const configured = process.env.AURA_CLAUDE_BIN
  if (configured) return fs.existsSync(configured) ? configured : null
  try {
    const found = execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf8' }).trim()
    return found || null
  } catch {
    return null
  }
}

const claudeBin = findClaudeBin()

function detectProvider(): ProviderName {
  const forced = process.env.AURA_PROVIDER
  if (forced === 'anthropic' || forced === 'openai' || forced === 'claude-cli' || forced === 'offline') return forced
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (claudeBin) return 'claude-cli'
  return 'offline'
}

const provider: ProviderName = detectProvider()

/** A model this server allows (AURA_ALLOWED_MODELS), falling back to its default (AURA_DEFAULT_MODEL). */
export function allowedModel(model: AiModel | null | undefined): AiModel {
  return model && config.ai.allowedModels.includes(model) ? model : config.ai.defaultModel
}

/** The model the current world picked in Settings (the server's default outside a world, as in scripts). */
export function currentModel(): AiModel {
  return allowedModel(hasWorld() ? getSetting<AiModel | null>('model', null) : null)
}

/** "Claude API · claude-opus-5-5": which way the characters reach Claude, for Settings and the startup log. */
export function providerInfo(): ProviderInfo {
  const model = MODEL_IDS[currentModel()]
  // Past a daily cap the characters write from templates; Settings says so.
  const capped = capReached() ? ' · daily AI limit reached, using templates' : ''
  if (provider === 'anthropic') return { active: 'anthropic', detail: `Claude API · ${model}${capped}` }
  if (provider === 'openai') return { active: 'openai', detail: `OpenAI · ${OPENAI_MODEL_IDS[currentModel()]}${capped}` }
  if (provider === 'claude-cli') return { active: 'claude-cli', detail: `Claude Code login · ${model}${capped}` }
  return { active: 'offline', detail: 'Offline mode · built-in templates (no AI)' }
}

// ----- safety rails: limited parallel calls and daily caps -------------------------------------

const MAX_PARALLEL = config.ai.concurrency
const DAILY_CAP = config.ai.dailyCap
const GLOBAL_DAILY_CAP = config.ai.globalDailyCap
let running = 0
const waiting: (() => void)[] = []

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await work()
  } finally {
    running--
    waiting.shift()?.()
  }
}

/**
 * Two daily caps. Each world counts its own calls in its settings table, so restarts
 * (`npm run dev` restarts on every save) don't reset it; Start over wipes it with everything else.
 * With sign-in on, the accounts database also counts every world's calls together, so a public
 * server can't spend more than AURA_AI_GLOBAL_DAILY_CAP calls a day however many people join.
 * Scripts (outside any world) only count toward the global cap.
 */
type CallCount = { date: string; count: number }

function worldCallsToday(): number {
  if (!hasWorld()) return 0
  const saved = getSetting<CallCount | null>('aiCalls', null)
  return saved?.date === new Date().toDateString() ? saved.count : 0
}

const globalCallsToday = () => (authEnabled ? dailyCount('ai_calls') : 0)

function capReached(): boolean {
  return (hasWorld() && worldCallsToday() >= DAILY_CAP) || globalCallsToday() >= GLOBAL_DAILY_CAP
}

/** Count one call toward both caps, or throw OfflineError (callers use templates) when a cap is reached. */
function countCall(): void {
  if (hasWorld() && worldCallsToday() >= DAILY_CAP) throw new OfflineError(`Daily AI cap (${DAILY_CAP}) reached`)
  if (globalCallsToday() >= GLOBAL_DAILY_CAP) throw new OfflineError(`Daily AI cap for all worlds (${GLOBAL_DAILY_CAP}) reached`)
  if (hasWorld()) {
    const count = worldCallsToday() + 1
    setSetting('aiCalls', { date: new Date().toDateString(), count })
    // Said once, the moment a cap is hit; later calls fall back quietly.
    if (count === DAILY_CAP) console.warn(`[ai] daily cap of ${DAILY_CAP} calls reached in this world: templates until tomorrow`)
  }
  if (authEnabled && bumpDailyCount('ai_calls') === GLOBAL_DAILY_CAP) {
    console.warn(`[ai] daily cap of ${GLOBAL_DAILY_CAP} calls for all worlds reached: templates until tomorrow`)
  }
}

// ----- the public function -------------------------------------------------------------------

export async function askJson<T>(options: AskOptions): Promise<T> {
  if (provider === 'offline') throw new OfflineError('No AI provider available')
  countCall()
  const model = allowedModel(options.model ?? currentModel())
  const request = { ...options, schema: strictSchema(options.schema) }
  const started = Date.now()
  try {
    const call = provider === 'anthropic' ? viaApi : provider === 'openai' ? viaOpenAI : viaCli
    const result = await withSlot(() => call(request, model))
    console.log(`[ai] ${options.label} · ${provider === 'openai' ? OPENAI_MODEL_IDS[model] : model} · ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return result as T
  } catch (error) {
    console.warn(`[ai] ${options.label} failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${(error as Error).message}`)
    throw error
  }
}

/**
 * Structured outputs need every object to list all of its keys as required and to forbid extra
 * keys. This walks a schema and adds those two rules, so schemas elsewhere can stay short.
 */
export function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...schema }
  if (copy.type === 'object' && copy.properties && typeof copy.properties === 'object') {
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(copy.properties as Record<string, Record<string, unknown>>)) {
      properties[key] = strictSchema(value)
    }
    copy.properties = properties
    copy.required = Object.keys(properties)
    copy.additionalProperties = false
  }
  if (copy.items && typeof copy.items === 'object') copy.items = strictSchema(copy.items as Record<string, unknown>)
  return copy
}

// ----- provider 1: the Claude API ------------------------------------------------------------

let client: Anthropic | null = null

async function viaApi(options: AskOptions, model: AiModel): Promise<unknown> {
  client ??= new Anthropic()
  const content: Anthropic.ContentBlockParam[] = [
    ...(options.images ?? []).map((image): Anthropic.ImageBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data.toString('base64') },
    })),
    { type: 'text', text: options.prompt },
  ]
  const response = await client.messages.create(
    {
      model: MODEL_IDS[model],
      max_tokens: options.maxTokens ?? 8000,
      system: [{ type: 'text', text: options.system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: options.effort ?? 'low', format: { type: 'json_schema', schema: options.schema } },
      messages: [{ role: 'user', content }],
    },
    { timeout: options.timeoutMs ?? 90_000 },
  )
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request')
  const text = response.content.find((block) => block.type === 'text')
  if (!text || text.type !== 'text') throw new Error('Claude returned no text')
  return JSON.parse(text.text)
}

// ----- provider 2: the OpenAI API (plain fetch, no SDK) ---------------------------------------

/** Schema words OpenAI's strict mode doesn't accept; removing them keeps every schema usable there. */
const OPENAI_UNSUPPORTED = ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'format']

function forOpenAI(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forOpenAI)
  if (!schema || typeof schema !== 'object') return schema
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!OPENAI_UNSUPPORTED.includes(key)) copy[key] = forOpenAI(value)
  }
  return copy
}

async function viaOpenAI(options: AskOptions, model: AiModel): Promise<unknown> {
  const content = [
    ...(options.images ?? []).map((image) => ({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.data.toString('base64')}` },
    })),
    { type: 'text', text: options.prompt },
  ]
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    body: JSON.stringify({
      model: OPENAI_MODEL_IDS[model],
      max_completion_tokens: options.maxTokens ?? 8000,
      response_format: {
        type: 'json_schema',
        // The name only labels the schema; OpenAI allows letters, digits, "_" and "-".
        json_schema: { name: options.label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'answer', strict: true, schema: forOpenAI(options.schema) },
      },
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content },
      ],
    }),
  })
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string }
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[]
  } | null
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${body?.error?.message ?? 'request failed'}`)
  const choice = body?.choices?.[0]
  if (choice?.message?.refusal) throw new Error('OpenAI declined this request')
  if (choice?.finish_reason === 'length') throw new Error('OpenAI ran out of room before finishing the answer')
  if (!choice?.message?.content) throw new Error('OpenAI returned no answer')
  return JSON.parse(choice.message.content)
}

// ----- provider 3: the local Claude Code CLI -------------------------------------------------

function viaCli(options: AskOptions, model: AiModel): Promise<unknown> {
  if (!claudeBin) throw new OfflineError('claude CLI not found')
  const args = [
    '-p',
    '--model', model,
    '--effort', options.effort ?? 'low',
    '--system-prompt', options.system,
    '--tools', '',               // no tools: it can only answer
    '--setting-sources', '',     // do not load CLAUDE.md, hooks or settings files
    '--strict-mcp-config',       // no MCP servers
    '--no-session-persistence',  // do not save thousands of tiny sessions to disk
    '--disable-slash-commands',
    '--json-schema', JSON.stringify(options.schema),
  ]

  // Photos need the streaming JSON input format; plain text can go straight to stdin.
  let input: string
  if (options.images?.length) {
    args.push('--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose')
    const content = [
      ...options.images.map((image) => ({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data.toString('base64') },
      })),
      { type: 'text', text: options.prompt },
    ]
    input = JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n'
  } else {
    args.push('--output-format', 'json')
    input = options.prompt
  }

  return new Promise((resolve, reject) => {
    // Run from the temp folder so no project files are picked up.
    const child = spawn(claudeBin, args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`claude timed out after ${options.timeoutMs ?? 90_000} ms`))
    }, options.timeoutMs ?? 90_000)

    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    // If the CLI quits before reading a big photo prompt (logged out, an unknown flag, an update),
    // writing to it fails with EPIPE. Without a listener that error would crash the whole server;
    // the 'close' handler below already rejects with the CLI's output, so callers use templates.
    child.stdin.on('error', () => {})
    child.on('close', (code) => {
      clearTimeout(timer)
      // "json" prints one object; "stream-json" prints one object per line. The answer is in the
      // object whose type is "result", under structured_output.
      for (const line of stdout.trim().split('\n').reverse()) {
        let message: { type?: string; is_error?: boolean; structured_output?: unknown; result?: string }
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        if (message.type !== 'result') continue
        if (message.is_error || message.structured_output == null) {
          return reject(new Error(`claude returned no structured answer: ${String(message.result ?? '').slice(0, 200)}`))
        }
        return resolve(message.structured_output)
      }
      reject(new Error(`claude exited with code ${code}: ${(stderr || stdout).slice(0, 300)}`))
    })
    child.stdin.end(input)
  })
}
