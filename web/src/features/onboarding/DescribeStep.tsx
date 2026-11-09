/**
 * "Tell us about your world": the first step of sign-up. A big mic button with a one-minute ring
 * and the words appearing live as you talk (voice typing, see useSpeech.ts), or a text box to type
 * in, plus three example ideas. Without voice typing in this browser it's just the text box.
 */
import { Keyboard, Mic, RotateCcw, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TextArea } from '../../components'
import { cx } from '../../lib/cx'
import { WORLD_EXAMPLES } from './options'
import { StepTitle } from './StepTitle'
import type { SpeechError, useSpeech } from './useSpeech'

export const TALK_MS = 60_000
export const MAX_TRANSCRIPT = 3000

const ERROR_TEXT: Record<SpeechError, string> = {
  denied: 'Microphone access is off for this site. You can type instead.',
  'no-mic': 'No microphone found. You can type instead.',
  network: "Voice typing can't reach its speech service right now. You can type instead.",
  failed: "Voice typing stopped working. You can type instead.",
}

interface DescribeStepProps {
  transcript: string
  onChange: (text: string) => void
  speech: ReturnType<typeof useSpeech>
}

export function DescribeStep({ transcript, onChange, speech }: DescribeStepProps) {
  const [typing, setTyping] = useState(!speech.supported)
  const blocked = speech.error === 'denied' || speech.error === 'no-mic'
  const textBox = useRef<HTMLTextAreaElement>(null)

  // Switching from talking to typing (or picking an example): the caret goes after the words already there.
  useEffect(() => {
    const box = textBox.current
    if (typing && box) box.setSelectionRange(box.value.length, box.value.length)
  }, [typing])

  // A blocked microphone means typing is the only way in.
  useEffect(() => {
    if (blocked) setTyping(true)
  }, [blocked])

  function pickExample(text: string) {
    speech.stop()
    onChange(text)
    setTyping(true)
  }

  function startOver() {
    speech.stop()
    speech.resetTime()
    onChange('')
  }

  return (
    <>
      <StepTitle
        title="Tell us about your world"
        subtitle={
          speech.supported && !blocked
            ? "Talk for about a minute: who your friends are, what you're into, and how popular you want to be."
            : "Write a few lines: who your friends are, what you're into, and how popular you want to be."
        }
      />

      {typing ? (
        <TextArea
          ref={textBox}
          autoFocus
          rows={7}
          maxLength={MAX_TRANSCRIPT}
          value={transcript}
          onChange={(event) => onChange(event.target.value)}
          placeholder="My best friend is... We always... I'm into... I want to be..."
          aria-label="Describe your world"
        />
      ) : (
        <VoicePanel transcript={transcript} speech={speech} />
      )}

      {speech.error && <p role="alert" className="mt-3 text-center text-[13px] text-danger">{ERROR_TEXT[speech.error]}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {speech.supported && !blocked && (
          <SmallButton
            onClick={() => {
              speech.stop()
              setTyping(!typing)
            }}
          >
            {typing ? <Mic size={15} /> : <Keyboard size={15} />}
            {typing ? 'Talk instead' : 'Type instead'}
          </SmallButton>
        )}
        {transcript.trim() && (
          <SmallButton onClick={startOver}>
            <RotateCcw size={14} />
            Start over
          </SmallButton>
        )}
      </div>

      <div className="mt-7">
        <p className="mb-2.5 text-[13px] font-semibold text-muted">Need ideas? Try one</p>
        <div className="grid gap-2">
          {WORLD_EXAMPLES.map((example, index) => (
            <motion.button
              key={example.label}
              type="button"
              onClick={() => pickExample(example.text)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.985, transition: { duration: 0.1 } }}
              transition={{ delay: 0.15 + index * 0.07, duration: 0.25 }}
              className="flex items-start gap-3 rounded-2xl border border-line px-3.5 py-3 text-left transition-colors hover:bg-surface"
            >
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-[18px]">
                {example.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{example.label}</span>
                <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{example.text}</span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </>
  )
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface active:scale-95"
    >
      {children}
    </button>
  )
}

/** The mic with its countdown ring, a status line, and the live transcript. */
function VoicePanel({ transcript, speech }: { transcript: string; speech: ReturnType<typeof useSpeech> }) {
  const box = useRef<HTMLDivElement>(null)
  const left = Math.max(0, Math.ceil((TALK_MS - speech.usedMs) / 1000))
  const timeUp = left === 0
  const status = speech.listening
    ? `Listening… ${clock(left)} left`
    : timeUp
      ? "That's a minute! Add more by typing."
      : transcript.trim()
        ? `Tap to keep going · ${clock(left)} left`
        : 'Tap the mic and start talking'

  // Keep the newest words in view.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [transcript, speech.interim])

  return (
    <div className="flex flex-col items-center">
      <MicButton
        listening={speech.listening}
        progress={speech.usedMs / TALK_MS}
        disabled={timeUp && !speech.listening}
        onClick={() => (speech.listening ? speech.stop() : speech.start())}
      />
      <p aria-live="polite" className="mt-3 h-5 text-[13px] font-semibold tabular-nums text-muted">
        {status}
      </p>
      <div
        ref={box}
        className="mt-4 max-h-[200px] min-h-[112px] w-full overflow-y-auto rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed"
      >
        {transcript || speech.interim ? (
          <p>
            {transcript}
            {speech.interim && <span className="text-muted"> {speech.interim}</span>}
            {speech.listening && <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-accent" />}
          </p>
        ) : (
          <p className="text-muted">Your words show up here as you talk.</p>
        )}
      </div>
    </div>
  )
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const RING = 64
const CIRCUMFERENCE = 2 * Math.PI * RING

/** A round mic button inside a ring that fills up over the minute; it glows and pulses while listening. */
function MicButton({ listening, progress, disabled, onClick }: { listening: boolean; progress: number; disabled: boolean; onClick: () => void }) {
  return (
    <div className="relative grid size-[148px] place-items-center">
      <AnimatePresence>
        {listening &&
          [0, 1].map((ring) => (
            <motion.span
              key={ring}
              aria-hidden
              className="aura-gradient absolute inset-4 rounded-full"
              initial={{ opacity: 0.35, scale: 1 }}
              animate={{ opacity: 0, scale: 1.45 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, delay: ring * 0.9, ease: 'easeOut' }}
            />
          ))}
      </AnimatePresence>

      <svg viewBox="0 0 148 148" aria-hidden className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="mic-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--aura-1)" />
            <stop offset="45%" stopColor="var(--aura-2)" />
            <stop offset="100%" stopColor="var(--aura-3)" />
          </linearGradient>
        </defs>
        <circle cx="74" cy="74" r={RING} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="74"
          cy="74"
          r={RING}
          fill="none"
          stroke="url(#mic-ring)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, progress))}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>

      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={listening ? 'Stop talking' : 'Start talking'}
        aria-pressed={listening}
        whileTap={{ scale: 0.92 }}
        animate={{ scale: listening ? 1.04 : 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 260 }}
        className={cx(
          'relative grid size-[108px] place-items-center rounded-full text-white shadow-pop disabled:opacity-40',
          listening ? 'aura-gradient' : 'bg-accent hover:bg-accent-hover',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={listening ? 'stop' : 'mic'}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {listening ? <Square size={30} fill="currentColor" strokeWidth={0} /> : <Mic size={40} strokeWidth={2} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
