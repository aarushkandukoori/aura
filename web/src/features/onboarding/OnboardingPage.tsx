/**
 * Onboarding (SPEC 9, screen 1). After sign-in the first step is "Tell us about your world": talk
 * or type for a minute, the AI turns it into a plan (POST /api/onboarding/plan), you review it, and
 * "Build my world" creates everything (POST /api/onboarding). "Set it up myself" leads to the
 * manual steps instead: name -> photo -> bio + interests -> how you know your friends -> popularity.
 * In local mode (no sign-in) a welcome screen comes first.
 * When the world is built, the new session goes into the store and the session gate opens the feed.
 */
import { ChevronLeft, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, IconButton, toast } from '../../components'
import { api, ApiError } from '../../lib/api'
import { firstName } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { WorldPlan } from '../../lib/types'
import { BuildingStep, type BuildPhase } from './BuildingStep'
import { DescribeStep, TALK_MS } from './DescribeStep'
import { BACK, canContinue, NEXT, PROGRESS_STEPS, startingDraft, STEPS, toRequest, withPlan, type Draft, type Step } from './draft'
import { AboutStep, NameStep, PhotoStep } from './ProfileSteps'
import { ReviewStep } from './ReviewStep'
import { useSpeech } from './useSpeech'
import { WelcomeStep } from './WelcomeStep'
import { OriginStep, TierStep } from './WorldSteps'

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Steps slide in from the side you're heading to: direction is 1 going forward, -1 going back. */
const slide = {
  enter: (direction: number) => ({ x: direction * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -40, opacity: 0 }),
}

/** While the plan is written (often 20-40 s with AI): what's happening, one line at a time. */
const PLAN_LINES = [
  'Listening back to what you said...', 'Finding your people...', 'Picking your besties...', 'Naming the group chats...',
  'Writing what everyone remembers about you...', 'Adding the finishing touches...', 'Almost there...',
]

/** While the world is built: the plan's own people and chats. */
function buildLines(plan: WorldPlan | null): string[] | undefined {
  if (!plan) return undefined
  const names = plan.friends.slice(0, 3).map((friend) => firstName(friend.account?.displayName ?? friend.id))
  return [
    `Adding ${names.join(', ')}...`,
    plan.groupChats[0] ? `Opening “${plan.groupChats[0].title}”...` : 'Warming up the group chats...',
    'Filling your feed...',
    'Telling everyone you joined...',
  ]
}

/** Bring the first field with a problem into view (after React shows the errors). */
function showFirstProblem() {
  window.requestAnimationFrame(() => {
    document.querySelector('[aria-invalid="true"], [data-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

export function OnboardingPage() {
  const authEnabled = useStore((s) => s.authEnabled)
  const account = useStore((s) => s.account)
  const [step, setStep] = useState<Step>(authEnabled ? 'describe' : 'welcome')
  const [direction, setDirection] = useState(1)
  const [draft, setDraft] = useState<Draft>(() => startingDraft(account))
  const [showErrors, setShowErrors] = useState(false)
  const [usernameTaken, setUsernameTaken] = useState<string | null>(null)
  // Sent back to fix a taken username on the manual path: Next on the name step skips back to the end.
  const [backToTier, setBackToTier] = useState(false)
  const [phase, setPhase] = useState<BuildPhase>('working')
  const [problem, setProblem] = useState<string | null>(null)
  // Each plan request gets a number, so an answer that arrives after going back is ignored.
  const planRequest = useRef(0)
  const speech = useSpeech({ text: draft.transcript, onText: (transcript) => update({ transcript }), maxMs: TALK_MS })

  const ready = canContinue(step, draft)
  const progress = PROGRESS_STEPS.indexOf(step)
  const back = step === 'describe' && authEnabled ? undefined : BACK[step]

  // The microphone only listens on the describe step.
  useEffect(() => {
    if (step !== 'describe') speech.stop()
  }, [step])

  function update(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }))
    if (changes.username !== undefined) setUsernameTaken(null)
  }

  function goTo(next: Step) {
    setDirection(STEPS.indexOf(next) > STEPS.indexOf(step) ? 1 : -1)
    setShowErrors(false)
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  function goBack() {
    planRequest.current++ // forget a plan that is still loading
    if (back) goTo(back)
  }

  function next(event: FormEvent) {
    event.preventDefault()
    if (step === 'planning' || step === 'building') return
    if (step === 'describe' && speech.listening) {
      speech.stop() // "Done": the last words arrive, then the button builds
      return
    }
    if (!ready) {
      setShowErrors(true)
      showFirstProblem()
      return
    }
    if (step === 'describe') makePlan()
    else if (step === 'review' || step === 'tier') build()
    else goTo(step === 'name' && backToTier ? 'tier' : NEXT[step] ?? 'describe')
  }

  /** "Set it up myself": the manual questions, without a plan. */
  function setUpManually() {
    planRequest.current++
    update({ plan: null })
    goTo('name')
  }

  // Started from the button (not an effect), so each plan is only asked for once.
  async function makePlan() {
    const request = ++planRequest.current
    goTo('planning')
    setPhase('working')
    setProblem(null)
    try {
      // At least a moment, so the screen never just flickers.
      const [plan] = await Promise.all([api.onboardingPlan({ transcript: draft.transcript, displayName: account?.name ?? null }), wait(2400)])
      if (request !== planRequest.current) return
      setDraft((current) => withPlan(current, plan))
      setDirection(1)
      setStep('review')
      window.scrollTo({ top: 0 })
    } catch (error) {
      if (request !== planRequest.current) return
      if (await alreadySetUp(error)) return
      setProblem(error instanceof Error ? error.message : 'Something went wrong')
      setPhase('error')
    }
  }

  // Started from the button (not an effect), so the world is only ever built once.
  async function build() {
    goTo('building')
    setPhase('working')
    setProblem(null)
    try {
      // At least ~3 s, so "Building your world" feels like a moment instead of a flicker.
      const [session] = await Promise.all([api.onboard(toRequest(draft)), wait(3200)])
      setPhase('done')
      await wait(1300)
      useStore.getState().setSession(session) // the session gate now opens the app
    } catch (error) {
      if (await alreadySetUp(error)) return
      const message = error instanceof Error ? error.message : 'Something went wrong'
      if (error instanceof ApiError && error.status === 400 && /username/i.test(message)) {
        setUsernameTaken(/[.!?]$/.test(message) ? message : `${message}.`) // like the other field errors
        if (draft.plan) {
          goTo('review')
        } else {
          setBackToTier(true)
          goTo('name')
        }
        return
      }
      setProblem(message)
      setPhase('error')
    }
  }

  /** Already set up (say, in another tab): just go in. */
  async function alreadySetUp(error: unknown): Promise<boolean> {
    if (!(error instanceof ApiError) || error.status !== 409) return false
    const session = await api.session().catch(() => null)
    if (!session?.onboarded) return false
    useStore.getState().setSession(session)
    return true
  }

  function renderStep() {
    switch (step) {
      case 'welcome':
        return <WelcomeStep />
      case 'describe':
        return <DescribeStep transcript={draft.transcript} onChange={(transcript) => update({ transcript })} speech={speech} />
      case 'planning':
        return (
          <BuildingStep
            phase={phase}
            name={draft.displayName}
            avatar={draft.avatar}
            error={problem}
            onRetry={makePlan}
            onBack={setUpManually}
            backLabel="Set it up myself"
            lines={PLAN_LINES}
            lineMs={3200}
          />
        )
      case 'review':
        return (
          <ReviewStep
            draft={draft}
            update={update}
            showErrors={showErrors}
            serverError={usernameTaken}
            accountPicture={account?.picture ?? null}
          />
        )
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
            error={problem}
            onRetry={build}
            onBack={() => goTo(draft.plan ? 'review' : 'tier')}
            title={draft.plan ? 'Bringing your world to life...' : undefined}
            lines={buildLines(draft.plan)}
          />
        )
    }
  }

  const buttonLabel =
    step === 'welcome' ? 'Get started'
    : step === 'describe' && speech.listening ? "I'm done"
    : step === 'describe' || step === 'review' || step === 'tier' ? 'Build my world'
    : step === 'photo' && !draft.avatar ? 'Skip for now'
    : 'Next'
  // Some steps wait for an answer; the name and review steps explain what's missing instead.
  const blocked = (step === 'about' || step === 'origin' || (step === 'describe' && !speech.listening)) && !ready
  const withFooter = step !== 'planning' && step !== 'building'

  return (
    <div className="relative min-h-dvh bg-bg md:grid md:place-items-center md:px-6 md:py-10">
      <Glow />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col md:min-h-[700px] md:rounded-[28px] md:border md:border-line md:bg-elevated md:shadow-pop">
        <header className="flex shrink-0 items-center gap-2 px-2 pt-safe">
          <div className="flex h-14 flex-1 items-center gap-2">
            {back && step !== 'building' && (
              <IconButton label="Back" onClick={goBack}>
                <ChevronLeft size={28} strokeWidth={1.75} />
              </IconButton>
            )}
            {progress >= 0 && <Progress current={progress} total={PROGRESS_STEPS.length} />}
            {step === 'describe' && account && <SignOutLink email={account.email} />}
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

          {withFooter && (
            // z-10: overlapping avatar stacks in the review set their own z-index; the button stays above them.
            <footer className="sticky bottom-0 z-10 shrink-0 bg-linear-to-t from-bg from-70% to-transparent px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 md:rounded-b-[28px] md:from-elevated">
              <Button type="submit" size="lg" block disabled={blocked} variant={buttonLabel === 'Skip for now' ? 'secondary' : 'primary'}>
                {buttonLabel === 'Build my world' && <Sparkles size={18} />}
                {buttonLabel}
              </Button>
              {step === 'describe' && (
                <button
                  type="button"
                  onClick={setUpManually}
                  className="mx-auto mt-2 block h-9 px-3 text-[13px] font-semibold text-muted transition hover:text-fg"
                >
                  Set it up myself
                </button>
              )}
            </footer>
          )}
        </form>
      </div>
    </div>
  )
}

/** Signed in with the wrong Google account? The first screen offers a way back to the sign-in page. */
function SignOutLink({ email }: { email: string }) {
  const signOut = useStore((s) => s.signOut)
  return (
    <button
      type="button"
      title={`Signed in as ${email}`}
      aria-label="Sign out"
      onClick={() => signOut().catch(() => toast("Couldn't sign out. Try again."))}
      className="ml-auto h-9 px-3 text-[13px] font-semibold text-muted transition hover:text-fg"
    >
      Sign out
    </button>
  )
}

/** The thin segmented bar at the top: one segment per question on the manual path. */
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
