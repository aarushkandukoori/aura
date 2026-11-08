import SwiftUI

/// The first-run flow: a welcome, who you are, a photo, what you're into, how you know your friends,
/// how popular you are, then "Building your world..." while the server creates everyone.
///
/// The answers live in one OnboardingDraft that every step edits. This view owns the parts that stay
/// put while the steps slide past: the back button, the progress bar and the Continue button.
struct OnboardingView: View {
    @State private var draft = OnboardingDraft()
    @State private var step: OnboardingStep = .welcome
    /// Which way the screens slide: forward comes in from the right, back from the left.
    @State private var goingBack = false

    private var isQuestion: Bool { OnboardingStep.questions.contains(step) }

    var body: some View {
        ZStack {
            OnboardingBackdrop(isWelcome: step == .welcome)

            VStack(spacing: 0) {
                if isQuestion {
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
                    if isQuestion { footer.transition(.opacity) }
                }
            }
        }
    }

    @ViewBuilder private func screen(for step: OnboardingStep) -> some View {
        switch step {
        case .welcome: WelcomeStep { go(to: .name) }
        case .name: NameStep(draft: draft)
        case .photo: PhotoStep(draft: draft)
        case .about: AboutStep(draft: draft)
        case .origin: OriginStep(draft: draft)
        case .tier: TierStep(draft: draft)
        case .building: BuildingStep(draft: draft) { go(to: .name) }
        }
    }

    // MARK: - Header and footer

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: goBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.text)
            .accessibilityLabel("Back")

            OnboardingProgress(step: step)

            Color.clear.frame(width: 44, height: 44) // keeps the bar centered
        }
        .padding(.horizontal, 8)
    }

    private var footer: some View {
        Button(continueTitle, action: goForward)
            .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
            .disabled(!draft.isComplete(step))
            .padding(.horizontal, 24)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .background(Theme.background.opacity(0.92))
    }

    private var continueTitle: String {
        switch step {
        case .photo: draft.avatar == nil ? "Skip for now" : "Continue"
        case .tier: "Build my world"
        default: "Continue"
        }
    }

    // MARK: - Moving between steps

    private var slide: AnyTransition {
        .asymmetric(
            insertion: .move(edge: goingBack ? .leading : .trailing).combined(with: .opacity),
            removal: .move(edge: goingBack ? .trailing : .leading).combined(with: .opacity)
        )
    }

    private func goForward() {
        guard draft.isComplete(step), let next = OnboardingStep(rawValue: step.rawValue + 1) else { return }
        Haptics.tap()
        go(to: next)
    }

    private func goBack() {
        guard let previous = OnboardingStep(rawValue: step.rawValue - 1) else { return }
        go(to: previous)
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
private struct OnboardingBackdrop: View {
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
