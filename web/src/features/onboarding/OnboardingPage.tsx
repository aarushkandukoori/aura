/**
 * Onboarding (SPEC 9, screen 1): welcome -> name, username, pronouns -> photo -> bio + interests ->
 * how you know your friends -> popularity -> "Building your world..." while POST /api/onboarding runs.
 * When it finishes, the new session goes into the store and the session gate opens the home feed.
 */
import { ChevronLeft, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Button, IconButton } from '../../components'
import { api, ApiError } from '../../lib/api'
import { useStore } from '../../lib/store'
import { BuildingStep, type BuildPhase } from './BuildingStep'
import { canContinue, EMPTY_DRAFT, PROGRESS_STEPS, STEPS, toRequest, type Draft, type Step } from './draft'
import { AboutStep, NameStep, PhotoStep } from './ProfileSteps'
import { WelcomeStep } from './WelcomeStep'
import { OriginStep, TierStep } from './WorldSteps'

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Steps slide in from the side you're heading to: direction is 1 going forward, -1 going back. */
const slide = {
  enter: (direction: number) => ({ x: direction * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -40, opacity: 0 }),
}

export function OnboardingPage() {
  const [step, setStep] = useState<Step>('welcome')
  const [direction, setDirection] = useState(1)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [showErrors, setShowErrors] = useState(false)
  const [usernameTaken, setUsernameTaken] = useState<string | null>(null)
  // Sent back to fix a taken username: the later steps are already answered, so Next on the name
  // step skips straight back to the last one.
  const [backToTier, setBackToTier] = useState(false)
  const [phase, setPhase] = useState<BuildPhase>('working')
  const [buildError, setBuildError] = useState<string | null>(null)

  const index = STEPS.indexOf(step)
  const progress = PROGRESS_STEPS.indexOf(step)
  const ready = canContinue(step, draft)

  function update(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }))
    if (changes.username !== undefined) setUsernameTaken(null)
  }

  function goTo(next: Step) {
    setDirection(STEPS.indexOf(next) > index ? 1 : -1)
    setShowErrors(false)
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  function next(event: FormEvent) {
    event.preventDefault()
    if (step === 'building') return
    if (!ready) {
      setShowErrors(true)
      return
    }
    if (step === 'tier') build()
    else goTo(step === 'name' && backToTier ? 'tier' : STEPS[index + 1])
  }

  // Started from the button (not an effect), so the world is only ever built once.
  async function build() {
    goTo('building')
    setPhase('working')
    setBuildError(null)
    try {
      // At least ~3 s, so "Building your world" feels like a moment instead of a flicker.
      const [session] = await Promise.all([api.onboard(toRequest(draft)), wait(3200)])
      setPhase('done')
      await wait(1300)
      useStore.getState().setSession(session) // the session gate now opens the app
    } catch (error) {
      // Already set up (say, in another tab): just go in.
      if (error instanceof ApiError && error.status === 409) {
        const session = await api.session().catch(() => null)
        if (session?.onboarded) {
          useStore.getState().setSession(session)
          return
        }
      }
      const message = error instanceof Error ? error.message : 'Something went wrong'
      if (error instanceof ApiError && error.status === 400 && /username/i.test(message)) {
        setUsernameTaken(/[.!?]$/.test(message) ? message : `${message}.`) // like the other field errors
        setBackToTier(true)
        goTo('name')
        return
      }
      setBuildError(message)
      setPhase('error')
    }
  }

  function renderStep() {
    switch (step) {
      case 'welcome':
        return <WelcomeStep />
      case 'name':
        return <NameStep draft={draft} update={update} showErrors={showErrors} serverError={usernameTaken} />
      case 'photo':
        return <PhotoStep draft={draft} update={update} />
      case 'about':
        return <AboutStep draft={draft} update={update} />
      case 'origin':
        return <OriginStep draft={draft} update={update} />
      case 'tier':
        return <TierStep draft={draft} update={update} />
      case 'building':
        return (
          <BuildingStep
            phase={phase}
            name={draft.displayName}
            avatar={draft.avatar}
            error={buildError}
            onRetry={build}
            onBack={() => goTo('tier')}
          />
        )
    }
  }

  const buttonLabel =
    step === 'welcome' ? 'Get started' : step === 'tier' ? 'Build my world' : step === 'photo' && !draft.avatar ? 'Skip for now' : 'Next'
  // Interests and "how you know them" wait for a choice; the name step explains what's missing instead.
  const blocked = (step === 'about' || step === 'origin') && !ready

  return (
    <div className="relative min-h-dvh bg-bg md:grid md:place-items-center md:px-6 md:py-10">
      <Glow />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col md:min-h-[700px] md:rounded-[28px] md:border md:border-line md:bg-elevated md:shadow-pop">
        <header className="flex shrink-0 items-center gap-2 px-2 pt-safe">
          <div className="flex h-14 flex-1 items-center gap-2">
            {progress >= 0 && (
              <>
                <IconButton label="Back" onClick={() => goTo(STEPS[index - 1])}>
                  <ChevronLeft size={28} strokeWidth={1.75} />
                </IconButton>
                <Progress current={progress} total={PROGRESS_STEPS.length} />
              </>
            )}
          </div>
        </header>

        <form onSubmit={next} noValidate className="flex flex-1 flex-col">
          {/* overflow-x-clip keeps the sliding steps from making the page scroll sideways. */}
          <div className="flex flex-1 flex-col overflow-x-clip">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex flex-1 flex-col px-6 pb-4"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          {step !== 'building' && (
            <footer className="sticky bottom-0 shrink-0 bg-linear-to-t from-bg from-70% to-transparent px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 md:rounded-b-[28px] md:from-elevated">
              <Button type="submit" size="lg" block disabled={blocked} variant={buttonLabel === 'Skip for now' ? 'secondary' : 'primary'}>
                {step === 'tier' && <Sparkles size={18} />}
                {buttonLabel}
              </Button>
            </footer>
          )}
        </form>
      </div>
    </div>
  )
}

/** The thin segmented bar at the top: one segment per question. */
function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className="flex flex-1 gap-1.5 pr-4"
    >
      {Array.from({ length: total }, (_, segment) => (
        <span key={segment} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: segment <= current ? '100%' : '0%' }}
          />
        </span>
      ))}
    </div>
  )
}

/** Soft aura-colored light behind everything. */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 size-[460px] rounded-full bg-aura-1 opacity-20 blur-3xl" />
      <div className="absolute -right-32 top-1/3 size-[380px] rounded-full bg-aura-2 opacity-15 blur-3xl" />
      <div className="absolute -bottom-48 left-1/4 size-[480px] rounded-full bg-aura-4 opacity-15 blur-3xl" />
    </div>
  )
}
