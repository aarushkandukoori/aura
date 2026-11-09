import SwiftUI

/// The first-run flow. It starts at "Tell us about your world": the person talks or types for about
/// a minute, the AI turns that into a plan (PlanStep), they look it over (ReviewStep) and "Build my
/// world" creates everyone (BuildStep). "Set it up myself" leads to questions instead: name, photo,
/// bio and interests, how you know your friends, how popular you are. In local mode (no sign-in) a
/// welcome screen comes first; with sign-in, the sign-in screen already said hello.
///
/// The answers live in one OnboardingDraft that every step edits. This view owns the parts that stay
/// put while the steps slide past: the back button, the progress bar and the footer buttons.
struct OnboardingView: View {
    @Environment(AppStore.self) private var store
    @State private var draft: OnboardingDraft
    @State private var step: OnboardingStep
    @State private var speech = SpeechTranscriber()
    /// Which way the screens slide: forward comes in from the right, back from the left.
    @State private var goingBack = false
    @State private var confirmingSignOut = false

    /// `account`: the signed-in Google account, whose name and photo start the profile.
    init(account: SignedInAccount?, startsWithWelcome: Bool) {
        _draft = State(initialValue: OnboardingDraft(account: account))
        _step = State(initialValue: startsWithWelcome ? .welcome : .describe)
    }

    private var isQuestion: Bool { OnboardingStep.questions.contains(step) }
    /// Steps with the back button on top and the buttons at the bottom.
    private var hasChrome: Bool { isQuestion || step == .describe || step == .review }

    var body: some View {
        ZStack {
            OnboardingBackdrop(isWelcome: step == .welcome)

            VStack(spacing: 0) {
                if hasChrome {
                    header.transition(.opacity)
                }
                ZStack {
                    screen(for: step)
                        .id(step)
                        .transition(slide)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if hasChrome { footer.transition(.opacity) }
                }
            }
        }
        // The microphone only listens on the describe step.
        .onChange(of: step) { _, newStep in if newStep != .describe { speech.stop() } }
    }

    @ViewBuilder private func screen(for step: OnboardingStep) -> some View {
        switch step {
        case .welcome:
            WelcomeStep { go(to: .describe) }
        case .describe:
            DescribeStep(draft: draft, speech: speech)
        case .planning:
            PlanStep(draft: draft, onPlan: { plan in
                draft.use(plan)
                go(to: .review)
            }, onSetUpMyself: setUpMyself)
        case .review:
            ReviewStep(draft: draft, accountPicture: store.account?.picture)
        case .name: NameStep(draft: draft)
        case .photo: PhotoStep(draft: draft)
        case .about: AboutStep(draft: draft)
        case .origin: OriginStep(draft: draft)
        case .tier: TierStep(draft: draft)
        case .building:
            BuildStep(draft: draft, onUsernameProblem: { problem in
                draft.usernameProblem = problem
                if draft.plan == nil {
                    draft.fixingUsername = true // after fixing it, Continue goes straight back to the end
                    go(to: .name)
                } else {
                    go(to: .review)
                }
            }, onBack: { go(to: draft.plan == nil ? .tier : .review) })
        }
    }

    // MARK: - Header and footer

    private var header: some View {
        HStack(spacing: 12) {
            if let back = backTarget {
                Button { go(to: back) } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.text)
                .accessibilityLabel("Back")
            } else if store.authEnabled && step == .describe {
                // Signed in with the wrong Google account? This is the way out.
                Button("Sign out") { confirmingSignOut = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(height: 44)
                    .padding(.leading, 10)
                    .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                        Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text(store.account.map { "You're signed in as \($0.email). Each Google account has its own world." } ?? "")
                    }
            } else {
                Color.clear.frame(width: 44, height: 44)
            }

            if isQuestion {
                OnboardingProgress(step: step)
                Color.clear.frame(width: 44, height: 44) // keeps the bar centered
            } else {
                Spacer()
            }
        }
        .padding(.horizontal, 8)
    }

    private var footer: some View {
        VStack(spacing: 2) {
            Button(action: goForward) {
                HStack(spacing: 8) {
                    if continueTitle == "Build my world" { Image(systemName: "sparkles") }
                    Text(continueTitle)
                }
                .contentTransition(.opacity)
            }
            .buttonStyle(.aura(step == .photo && draft.avatar == nil ? .secondary : .primary, size: .large, fullWidth: true))
            .disabled(!canContinue)
            .animation(Motion.fade, value: continueTitle)

            if step == .describe {
                Button("Set it up myself", action: setUpMyself)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(height: 36)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 10)
        .padding(.bottom, step == .describe ? 4 : 12)
        .background(Theme.background.opacity(0.92))
    }

    private var continueTitle: String {
        switch step {
        case .describe: speech.isListening ? "I'm done" : "Build my world"
        case .review, .tier: "Build my world"
        case .photo: draft.avatar == nil ? "Skip for now" : "Continue"
        default: "Continue"
        }
    }

    /// "I'm done" always works while listening; otherwise the step must be answered.
    private var canContinue: Bool {
        (step == .describe && speech.isListening) || draft.isComplete(step)
    }

    // MARK: - Moving between steps

    /// Where the back button goes (nil = no back button).
    private var backTarget: OnboardingStep? {
        switch step {
        case .describe: store.authEnabled ? nil : .welcome
        case .review, .name: .describe
        case .photo: .name
        case .about: .photo
        case .origin: .about
        case .tier: .origin
        case .welcome, .planning, .building: nil
        }
    }

    private var slide: AnyTransition {
        .asymmetric(
            insertion: .move(edge: goingBack ? .leading : .trailing).combined(with: .opacity),
            removal: .move(edge: goingBack ? .trailing : .leading).combined(with: .opacity)
        )
    }

    private func goForward() {
        if step == .describe && speech.isListening {
            speech.stop() // "I'm done": the last words arrive, then the button builds
            return
        }
        guard draft.isComplete(step) else { return }
        Haptics.tap()
        switch step {
        case .welcome: go(to: .describe)
        case .describe: go(to: .planning)
        case .review, .tier: go(to: .building)
        case .name: go(to: draft.fixingUsername ? .tier : .photo)
        case .photo: go(to: .about)
        case .about: go(to: .origin)
        case .origin: go(to: .tier)
        case .planning, .building: break
        }
    }

    /// "Set it up myself": the questions, without a plan.
    private func setUpMyself() {
        speech.stop()
        draft.plan = nil
        go(to: .name)
    }

    /// Sets the slide direction first and changes the step a moment later, so the screen that is
    /// leaving has already been told which way to slide out.
    private func go(to next: OnboardingStep) {
        goingBack = next.rawValue < step.rawValue
        Task { @MainActor in
            withAnimation(.spring(duration: 0.45, bounce: 0.12)) { step = next }
        }
    }
}

// MARK: - Shared onboarding pieces

/// The progress bar: how far through the questions the person is, filled with the aura gradient.
private struct OnboardingProgress: View {
    let step: OnboardingStep

    private var number: Int { (OnboardingStep.questions.firstIndex(of: step) ?? 0) + 1 }
    private var total: Int { OnboardingStep.questions.count }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.secondaryFill)
                Capsule()
                    .fill(Theme.auraGradient)
                    .frame(width: geometry.size.width * Double(number) / Double(total))
            }
        }
        .frame(height: 6)
        .animation(.spring(duration: 0.5, bounce: 0.2), value: number)
        .accessibilityElement()
        .accessibilityLabel("Step \(number) of \(total)")
    }
}

/// Soft aura-colored glows behind onboarding (brighter on the welcome screen).
struct OnboardingBackdrop: View {
    let isWelcome: Bool

    var body: some View {
        ZStack {
            Theme.background
            Circle().fill(Theme.aura1).frame(width: 340).blur(radius: 120)
                .offset(x: -150, y: -330).opacity(isWelcome ? 0.45 : 0.25)
            Circle().fill(Theme.aura2).frame(width: 300).blur(radius: 120)
                .offset(x: 160, y: -270).opacity(isWelcome ? 0.35 : 0.18)
            Circle().fill(Theme.aura4).frame(width: 280).blur(radius: 130)
                .offset(x: 130, y: 400).opacity(isWelcome ? 0.3 : 0)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.6), value: isWelcome)
    }
}

/// The shape of every question: a big title, a line of explanation, then the step's content.
struct OnboardingPage<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.title.weight(.bold))
                        .foregroundStyle(Theme.text)
                    Text(subtitle)
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                }
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
    }
}

/// A labeled input box used on the onboarding forms and in Edit profile.
struct LabeledField<Field: View>: View {
    let label: String
    var note: String? = nil
    var noteIsWarning = false
    @ViewBuilder let field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.muted)
            field
                .font(.body)
                .padding(.horizontal, 14)
                .frame(minHeight: 50)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            if let note {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(noteIsWarning ? Theme.like : Theme.muted)
                    .transition(.opacity)
            }
        }
    }
}
