import SwiftUI

/// "Tell us about your world": the first step of sign-up. A big mic with a one-minute ring and the
/// words appearing live as you talk (SpeechTranscriber), or a box to type in, plus three example
/// ideas to start from. OnboardingView's footer has "Build my world" and "Set it up myself".
struct DescribeStep: View {
    @Bindable var draft: OnboardingDraft
    let speech: SpeechTranscriber

    @State private var isTyping = false
    @State private var examplesShown = false
    @FocusState private var typingFocused: Bool

    /// Ideas to tap: names, places, routines and how popular they want to be make the best worlds.
    static let examples: [(label: String, emoji: String, text: String)] = [
        ("Gym + anime", "🏋️", "I'm a sophomore in college and I basically live at the gym. My best friend Jake spots me every morning and we watch anime every Friday night. I want to be pretty popular on campus."),
        ("Cozy and bookish", "📚", "I'm a nurse and I work night shifts. I love cozy mystery books, tea and long walks. I want a small, close circle: my book club friends and my sister Ana. Nothing too big."),
        ("Going big", "🎤", "I make music in my bedroom and play open mics on weekends. My friends are all musicians and producers, and my roommate Theo DJs. I want to blow up and be famous."),
    ]

    var body: some View {
        OnboardingPage(title: "Tell us about your world",
                       subtitle: "Talk for about a minute: who your friends are, what you're into, and how popular you want to be.") {
            VStack(spacing: 14) {
                if isTyping {
                    typingBox.transition(.opacity)
                } else {
                    voicePanel.transition(.opacity)
                }
                if let problem = speech.problem {
                    ProblemNote(problem: problem)
                }
                smallButtons
            }
            .animation(Motion.slide, value: isTyping)
            .animation(Motion.fade, value: speech.problem)

            examplesList
        }
        .onChange(of: speech.problem) { _, problem in
            // The microphone can't be used: typing is the way in.
            if problem != nil { isTyping = true }
        }
        .onAppear {
            withAnimation(Motion.slide.delay(0.15)) { examplesShown = true }
        }
    }

    // MARK: - Talking

    private var voicePanel: some View {
        VStack(spacing: 12) {
            MicButton(isListening: speech.isListening,
                      progress: speech.usedSeconds / SpeechTranscriber.talkLimit,
                      level: speech.level,
                      isDisabled: speech.isTimeUp && !speech.isListening,
                      action: toggleListening)
            Text(status)
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(Theme.muted)
                .contentTransition(.numericText())
                .animation(.snappy, value: status)
            transcriptBox
        }
        .frame(maxWidth: .infinity)
    }

    private var status: String {
        let left = Int(speech.timeLeft.rounded(.up))
        let clock = String(format: "%d:%02d", left / 60, left % 60)
        if speech.isListening { return "Listening… \(clock) left" }
        if speech.isTimeUp { return "That's a minute! Add more by typing." }
        if !draft.trimmedTranscript.isEmpty { return "Tap to keep going · \(clock) left" }
        return "Tap the mic and start talking"
    }

    /// The words so far, newest at the bottom, with a blinking caret while listening.
    private var transcriptBox: some View {
        ScrollView {
            Group {
                if draft.trimmedTranscript.isEmpty {
                    Text("Your words show up here as you talk.")
                        .foregroundStyle(Theme.muted)
                } else {
                    Text(transcriptWithCaret)
                        .foregroundStyle(Theme.text)
                }
            }
            .font(.body)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .defaultScrollAnchor(.bottom, for: .sizeChanges) // keep the newest words in view
        .frame(minHeight: 112, maxHeight: 200)
        .fixedSize(horizontal: false, vertical: true)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        .accessibilityLabel(draft.trimmedTranscript.isEmpty ? "Nothing said yet" : draft.transcript)
    }

    /// The transcript, plus an accent-colored caret at the end while listening.
    private var transcriptWithCaret: AttributedString {
        var text = AttributedString(draft.transcript)
        if speech.isListening {
            var caret = AttributedString(" ▍")
            caret.foregroundColor = Theme.accent
            text += caret
        }
        return text
    }

    private func toggleListening() {
        if speech.isListening {
            speech.stop()
        } else {
            Haptics.tap()
            Task {
                await speech.start(after: draft.transcript) { text in
                    draft.transcript = String(text.prefix(OnboardingDraft.transcriptLimit))
                }
            }
        }
    }

    // MARK: - Typing

    private var typingBox: some View {
        TextField("My best friend is... We always... I'm into... I want to be...",
                  text: transcriptBinding, axis: .vertical)
            .lineLimit(7...12)
            .font(.body)
            .focused($typingFocused)
            .padding(16)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            .accessibilityLabel("Describe your world")
            .accessibilityIdentifier("describeText")
    }

    private var transcriptBinding: Binding<String> {
        Binding(
            get: { draft.transcript },
            set: { draft.transcript = String($0.prefix(OnboardingDraft.transcriptLimit)) }
        )
    }

    // MARK: - Buttons and ideas

    private var smallButtons: some View {
        HStack(spacing: 8) {
            if speech.problem != .denied && speech.problem != .restricted {
                SmallPillButton(title: isTyping ? "Talk instead" : "Type instead",
                                systemImage: isTyping ? "mic" : "keyboard") {
                    speech.stop()
                    isTyping.toggle()
                    typingFocused = isTyping
                }
            }
            if !draft.trimmedTranscript.isEmpty {
                SmallPillButton(title: "Start over", systemImage: "arrow.counterclockwise") {
                    speech.stop()
                    speech.resetTime()
                    draft.transcript = ""
                }
                .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(Motion.pop, value: draft.trimmedTranscript.isEmpty)
    }

    private var examplesList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Need ideas? Try one")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.muted)
            ForEach(Array(Self.examples.enumerated()), id: \.offset) { index, example in
                Button { use(example.text) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Text(example.emoji)
                            .font(.system(size: 18))
                            .frame(width: 38, height: 38)
                            .background(Theme.surface, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(example.label)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.text)
                            Text(example.text)
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(SquashButtonStyle(pressedScale: 0.98))
                .opacity(examplesShown ? 1 : 0)
                .offset(y: examplesShown ? 0 : 10)
                .animation(Motion.slide.delay(0.15 + Double(index) * 0.07), value: examplesShown)
            }
        }
        .padding(.top, 6)
    }

    /// An idea goes into the text box, ready to edit.
    private func use(_ text: String) {
        Haptics.selection()
        speech.stop()
        draft.transcript = text
        isTyping = true
    }
}

/// A small outlined pill button ("Type instead", "Start over").
private struct SmallPillButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.text)
                .padding(.horizontal, 14)
                .frame(height: 36)
                .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(SquashButtonStyle(pressedScale: 0.94))
    }
}

/// Why voice typing isn't working, and (when it's switched off) a way to Settings.
private struct ProblemNote: View {
    let problem: SpeechTranscriber.Problem

    var body: some View {
        VStack(spacing: 8) {
            Text(message)
                .font(.footnote)
                .foregroundStyle(Theme.like)
                .multilineTextAlignment(.center)
            if problem == .denied, let settings = URL(string: UIApplication.openSettingsURLString) {
                Link("Open Settings", destination: settings)
                    .font(.footnote.weight(.semibold))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var message: String {
        switch problem {
        case .denied: "Microphone or speech recognition is off for Aura. Turn them on in Settings, or type instead."
        case .restricted: "Voice typing isn't allowed on this iPhone. You can type instead."
        case .unavailable: "Voice typing isn't available right now. You can type instead."
        case .failed: "Voice typing stopped working. You can type instead."
        }
    }
}
