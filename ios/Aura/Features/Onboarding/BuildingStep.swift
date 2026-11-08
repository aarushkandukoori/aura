import SwiftUI

/// The last step: sends the answers to the server, which builds the whole world (friends, posts,
/// group chats). When it's done the store opens the app by itself.
struct BuildingStep: View {
    @Environment(AppStore.self) private var store
    let draft: OnboardingDraft
    /// Goes back to the name step (e.g. when the username is taken).
    let onEditDetails: () -> Void

    @State private var lineIndex = 0
    @State private var errorMessage: String?
    @State private var attempt = 0

    private let lines = [
        "Inviting your friends",
        "Starting your group chats",
        "Filling your feed",
        "Saving you a seat",
    ]

    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            BuildingRings(avatar: draft.avatar)

            VStack(spacing: 10) {
                Text(errorMessage == nil ? "Building your world..." : "That didn't work")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)
                if let errorMessage {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                } else {
                    Text(lines[lineIndex])
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .id(lineIndex)
                        .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                                removal: .move(edge: .top).combined(with: .opacity)))
                }
            }
            .padding(.horizontal, 32)
            .frame(height: 90, alignment: .top)
            .clipped()

            Spacer()

            if errorMessage != nil {
                VStack(spacing: 10) {
                    Button("Try again") { attempt += 1 }
                        .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
                    Button("Edit my details", action: onEditDetails)
                        .buttonStyle(.aura(.secondary, size: .large, fullWidth: true))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
        }
        .task(id: attempt) { await build() }
        .task { await cycleLines() }
    }

    private func build() async {
        errorMessage = nil
        // Offline the world builds in a blink; a short pause lets the animation be seen.
        try? await Task.sleep(for: .seconds(1.6))
        guard !Task.isCancelled else { return }
        do {
            try await store.completeOnboarding(draft.request)
            Haptics.success()
        } catch {
            if error.isCancellation { return }
            // 409 = this server was already set up (maybe from another device): just open the app.
            if (error as? APIError)?.status == 409 {
                await store.retry()
                return
            }
            Haptics.error()
            withAnimation { errorMessage = error.localizedDescription }
        }
    }

    /// Changes the little status line every second and a half.
    private func cycleLines() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.easeInOut(duration: 0.35)) { lineIndex = (lineIndex + 1) % lines.count }
        }
    }
}

/// The person's photo inside two turning aura rings and a soft pulsing glow.
private struct BuildingRings: View {
    let avatar: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spin = false
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.ringGradient)
                .frame(width: 200, height: 200)
                .blur(radius: 50)
                .opacity(pulse ? 0.6 : 0.3)
            Circle()
                .strokeBorder(Theme.ringGradient.opacity(0.6), style: StrokeStyle(lineWidth: 2, dash: [4, 10]))
                .frame(width: 186, height: 186)
                .rotationEffect(.degrees(spin ? -360 : 0))
            Circle()
                .strokeBorder(Theme.ringGradient, lineWidth: 5)
                .frame(width: 156, height: 156)
                .rotationEffect(.degrees(spin ? 360 : 0))
            Group {
                if let avatar {
                    RemoteImage(path: avatar)
                } else {
                    DefaultAvatar()
                }
            }
            .frame(width: 132, height: 132)
            .clipShape(Circle())
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 3.5).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 1.3).repeatForever()) { pulse = true }
        }
        .accessibilityHidden(true)
    }
}
