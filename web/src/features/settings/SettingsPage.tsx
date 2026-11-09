/**
 * Settings (SPEC 9, screen 14): your profile, popularity, world speed, AI model, appearance,
 * saved posts, start over, and the one honest "About" paragraph.
 * Every choice applies right away: the store changes first, then the server confirms (or we undo).
 */
import { Bookmark, ChevronRight, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Avatar, LoadingBlock, PageHeader, SegmentedControl, toast } from '../../components'
import { SignedInRow } from '../auth'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useMe, useStore } from '../../lib/store'
import type { ProviderInfo, Tier, UpdateSettingsRequest } from '../../lib/types'
import { StartOver } from './StartOver'
import { TierCards } from './TierCards'
import { MODEL_OPTIONS, SPEED_OPTIONS, tierOption } from './tiers'

const THEME_OPTIONS = [
  { value: 'system' as const, label: 'System', icon: <Monitor size={15} /> },
  { value: 'light' as const, label: 'Light', icon: <Sun size={15} /> },
  { value: 'dark' as const, label: 'Dark', icon: <Moon size={15} /> },
]

/** Change settings optimistically. Returns false (and puts the old settings back) if the server says no. */
async function saveSettings(changes: UpdateSettingsRequest): Promise<boolean> {
  const before = useStore.getState().settings
  if (!before) return false
  useStore.getState().setSettings({ ...before, ...changes })
  try {
    useStore.getState().setSettings(await api.updateSettings(changes))
    return true
  } catch (error) {
    useStore.getState().setSettings(before)
    toast(error instanceof Error ? error.message : "Couldn't save that setting. Try again.")
    return false
  }
}

async function changeTier(tier: Tier) {
  if (useStore.getState().settings?.tier === tier) return
  if (!(await saveSettings({ tier }))) return
  const option = tierOption(tier)
  toast(option.switched, { icon: option.emoji })
  // My follower count arrives live (me.stats); the tier and verified badge live on `me`, so reload it.
  const session = await api.session().catch(() => null)
  if (session?.me) useStore.getState().setMe(session.me)
}

export function SettingsPage() {
  const me = useMe()
  const settings = useStore((s) => s.settings)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  // Another device (the iOS app uses the same server) may have changed a setting since the session
  // loaded, so fetch a fresh copy each time Settings opens. A choice made here meanwhile wins.
  useEffect(() => {
    const before = useStore.getState().settings
    api.settings()
      .then((fresh) => {
        if (useStore.getState().settings === before) useStore.getState().setSettings(fresh)
      })
      .catch(() => {}) // keep showing the copy we have
  }, [])

  if (!settings) return <LoadingBlock />
  const speed = SPEED_OPTIONS.find((option) => option.value === settings.speed)
  const model = MODEL_OPTIONS.find((option) => option.value === settings.model)
  // Only the models this server allows (a public server may run just one).
  const modelOptions = MODEL_OPTIONS.filter((option) => !settings.models || settings.models.includes(option.value))

  return (
    <div>
      <PageHeader title="Settings" back={`/${me.username}`} className="md:hidden" />
      <div className="mx-auto max-w-[640px] px-4 pb-16 md:px-8 md:pt-10">
        <h1 className="hidden pb-2 text-2xl font-bold md:block">Settings</h1>

        <Section title="Your account">
          <div className="-mx-3 flex flex-col">
            <Link to="/settings/profile" className="flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-surface">
              <Avatar account={me} size={52} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{me.displayName}</span>
                <span className="block truncate text-muted">@{me.username}</span>
              </span>
              <span className="text-[13px] font-semibold text-accent">Edit profile</span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
            <Link to="/saved" className="flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-surface">
              <span className="grid size-[52px] place-items-center rounded-full bg-surface">
                <Bookmark size={22} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Saved</span>
                <span className="block text-muted">Posts you bookmarked. Only you can see them.</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
            <SignedInRow />
          </div>
        </Section>

        <Section title="Popularity" description="How big your world is. Switch anytime and your follower count moves with you.">
          <TierCards value={settings.tier} onChange={changeTier} />
        </Section>

        <Section title="World speed" description={speed?.hint}>
          <SegmentedControl
            label="World speed"
            block
            options={SPEED_OPTIONS}
            value={settings.speed}
            onChange={(value) => saveSettings({ speed: value })}
          />
        </Section>

        <Section title="AI model" description={usesClaude(settings.provider) ? model?.hint : undefined}>
          {modelOptions.length > 1 && (
            <SegmentedControl
              label="AI model"
              block
              options={modelOptions}
              value={settings.model}
              onChange={(value) => saveSettings({ model: value })}
            />
          )}
          <ProviderStatus provider={settings.provider} />
        </Section>

        <Section title="Appearance">
          <SegmentedControl label="Appearance" block options={THEME_OPTIONS} value={theme} onChange={setTheme} />
        </Section>

        <Section title="Start over" description="Delete everything and set up Aura again from the beginning.">
          <StartOver />
        </Section>

        <Section title="About Aura">
          <p className="text-sm leading-relaxed text-muted">
            <AboutText provider={settings.provider} />
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line py-6 last:border-b-0">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** The model hints name Claude models; a server on OpenAI maps the same choices to its own models. */
const usesClaude = (provider: ProviderInfo) => provider.active === 'anthropic' || provider.active === 'claude-cli'

/** Who writes the characters' words on this server, and where the user's words and photos go (it differs per server). */
function AboutText({ provider }: { provider: ProviderInfo }) {
  const intro = 'Every account on Aura except yours is an AI character, and their photos are AI-generated.'
  if (provider.active === 'offline') {
    return `${intro} No AI model is connected right now, so their comments and messages come from built-in templates. Everything stays in a database on the computer running Aura.`
  }
  const writer = usesClaude(provider) ? { name: 'Claude, an AI model made by Anthropic', short: 'Claude' } : { name: "OpenAI's GPT models", short: 'OpenAI' }
  return `${intro} Their comments and messages are written by ${writer.name}. When you post, comment or send a message, your words and photos are sent to ${writer.short} only so the characters can write their reactions. Everything else stays in a database on the computer running Aura.`
}

/** "● Claude Code login · claude-opus-5-5": which way the characters reach the AI right now. */
function ProviderStatus({ provider }: { provider: ProviderInfo }) {
  const online = provider.active !== 'offline'
  return (
    <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
      <span aria-hidden className={cx('size-2 shrink-0 rounded-full', online ? 'bg-success' : 'bg-line-strong')} />
      <span className="min-w-0">{provider.detail}</span>
    </p>
  )
}
