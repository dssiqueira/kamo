// The welcome tour (F-13, flows.md §1): Kamo explains the app in three slides, from a paper
// speech bubble. On first run it comes before the permission screens; Settings can replay it.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { Mascot, type MascotPose } from '../mascot/Mascot.tsx'
import { useSpring, useSpringTo } from '../motion/useSpring.ts'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { LinkButton, PrimaryButton, SecondaryButton } from '../settings/parts.tsx'
import { IntroVignette } from './IntroVignettes.tsx'
import {
  INTRO_SLIDES,
  INTRO_START,
  introKeyCommand,
  introStep,
  type IntroCommand,
  type IntroSlide,
} from './intro.ts'

export interface IntroSlidesProps {
  /**
   * 'setup': first run, the last slide leads on to the permission screens.
   * 'tour': replayed from Settings, the last slide just closes it.
   */
  mode: 'setup' | 'tour'
  /** Next on the last slide, Skip or Esc. */
  onDone(): void
}

const POSES: Record<IntroSlide, MascotPose> = {
  record: 'front',
  click: 'head-tongue',
  edit: 'head-wink',
}

/** Typing in a control keeps its own keys; Enter on a button belongs to the button. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null ||
      target.isContentEditable)
  )
}

export function IntroSlides({ mode, onDone }: IntroSlidesProps) {
  const t = useT()
  const [state, setState] = useState(INTRO_START)
  const send = (command: IntroCommand) => setState((current) => introStep(current, command))

  // Once, even if the parent re-renders with a new callback.
  const doneSent = useRef(false)
  useEffect(() => {
    if (!state.finished || doneSent.current) return
    doneSent.current = true
    onDone()
  }, [state.finished, onDone])

  // Keys work anywhere in this window while the tour shows (never system-wide).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const command = introKeyCommand(event.key, {
        onControl: isControl(event.target),
        repeat: event.repeat,
      })
      if (!command) return
      event.preventDefault()
      setState((current) => introStep(current, command))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const slide = INTRO_SLIDES[state.index] ?? 'record'
  const last = state.index === INTRO_SLIDES.length - 1
  // Each slide comes in from the side it was asked from, on the Kamo spring.
  const enter = useSpring(1, 0, state.index)
  const opacity = Math.min(1, Math.max(0, enter))
  const shift = (1 - enter) * 32 * state.direction

  return (
    <section
      aria-label={t('onboarding.intro.label')}
      className="relative flex w-full max-w-[900px] flex-col items-center gap-2xl"
    >
      <div className="flex w-full items-center justify-center gap-xl">
        <div
          className="flex w-[250px] shrink-0 justify-center"
          style={{
            opacity,
            transform: `translateY(${(1 - enter) * 14}px) scale(${0.94 + 0.06 * enter})`,
          }}
        >
          <Mascot key={slide} pose={POSES[slide]} size={slide === 'record' ? 210 : 190} backdrop />
        </div>

        <div
          className="relative w-full max-w-[500px]"
          style={{ opacity, transform: `translateX(${shift}px)` }}
        >
          {/* The paper the bubble was cut from, peeking out behind it. */}
          <div
            aria-hidden
            className="absolute inset-0 translate-x-[9px] translate-y-[10px] rotate-[1.4deg] rounded-[22px] bg-primary-container"
          />
          <div
            aria-live="polite"
            className="relative flex flex-col gap-md rounded-[20px] border border-border bg-surface px-xl pb-xl pt-lg shadow-[0_8px_24px_rgba(43,42,38,0.10)]"
          >
            {/* The bubble's tail, pointing at Kamo. */}
            <span
              aria-hidden
              className="absolute -start-[12px] top-[86px] h-[22px] w-[22px] rotate-45 rounded-bl-[4px] border-b border-s border-border bg-surface"
            />
            <div className="flex flex-col gap-xs">
              <p className="text-label font-semibold text-primary-strong">
                {t(`onboarding.intro.${slide}.eyebrow`)}
              </p>
              <h1 className="font-serif text-[40px] leading-[1.1] text-on-surface">
                {t(`onboarding.intro.${slide}.title`)}
              </h1>
              <p className="text-title font-normal text-on-surface-muted">
                {t(`onboarding.intro.${slide}.body`)}
              </p>
            </div>
            <IntroVignette slide={slide} />
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-[780px] grid-cols-[1fr_auto_1fr] items-center gap-md">
        <div className="justify-self-start">
          <span className={last ? 'invisible' : undefined} data-intro-skip>
            <LinkButton onClick={() => send('skip')}>{t('onboarding.intro.skip')}</LinkButton>
          </span>
        </div>
        <div className="flex items-center gap-sm">
          {INTRO_SLIDES.map((id, i) => (
            <Dot
              key={id}
              active={i === state.index}
              label={t('onboarding.intro.goTo', {
                current: i + 1,
                total: INTRO_SLIDES.length,
              })}
              onClick={() => send({ goTo: i })}
            />
          ))}
        </div>
        <div className="flex items-center gap-sm justify-self-end">
          <span className={state.index === 0 ? 'invisible' : undefined}>
            <SecondaryButton onClick={() => send('back')}>
              {t('onboarding.intro.back')}
            </SecondaryButton>
          </span>
          <span data-intro-next>
            <PrimaryButton onClick={() => send('next')}>
              {last
                ? t(mode === 'setup' ? 'onboarding.intro.setup' : 'onboarding.intro.finish')
                : t('onboarding.intro.next')}
            </PrimaryButton>
          </span>
        </div>
      </div>
    </section>
  )
}

/** A slide dot: the current one stretches into a sage pill. */
function Dot({ active, label, onClick }: { active: boolean; label: string; onClick(): void }) {
  const on = useSpringTo(active ? 1 : 0)
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'step' : undefined}
      onClick={onClick}
      className={`flex h-[20px] items-center justify-center rounded-full ${FOCUS_RING}`}
      style={{ width: 8 + 18 * Math.max(0, on) + 8 }}
    >
      <span
        className="block h-[8px] rounded-full"
        style={{
          width: 8 + 18 * Math.max(0, on),
          backgroundColor: active ? 'var(--color-primary-strong)' : 'var(--color-border)',
        }}
      />
    </button>
  )
}
