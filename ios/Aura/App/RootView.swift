import SwiftUI

/// Decides what the whole screen shows: a launch screen while asking the server, sign-in (when the
/// server has accounts), onboarding for a new world, the app itself, or a "can't reach the server"
/// screen. A reset sends you back to onboarding; signing out, back to sign-in.
struct RootView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            switch store.phase {
            case .loading:
                LaunchView()
                    .zIndex(1)
                    .transition(.opacity)
            case .signIn:
                SignInView()
                    .zIndex(1)
                    .transition(.opacity)
            case .onboarding:
                OnboardingView(account: store.account, startsWithWelcome: !store.authEnabled)
                    .zIndex(1)
                    .transition(.opacity)
            case .ready:
                // The tabs appear at once and the screen before fades out on top of them: the glass
                // tab bar doesn't draw its background if it first appears while fading in.
                MainTabView()
                    .transition(.identity)
            case .unreachable(let message):
                ServerUnreachableView(message: message)
                    .zIndex(1)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: store.phase)
    }
}

/// The wordmark with a soft glow, shown for the moment it takes to reach the server.
struct LaunchView: View {
    var body: some View {
        VStack(spacing: 22) {
            AuraWordmark(size: 56)
                .background {
                    Circle()
                        .fill(Theme.ringGradient)
                        .frame(width: 160, height: 160)
                        .blur(radius: 60)
                        .opacity(0.35)
                }
            ProgressView()
                .tint(Theme.muted)
        }
    }
}

/// Shown when the server doesn't answer: what went wrong, the address being used, and a retry.
struct ServerUnreachableView: View {
    @Environment(AppStore.self) private var store
    let message: String

    @State private var address = API.server
    @State private var retrying = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            AuraWordmark(size: 40)
                .padding(.bottom, 12)
            Text("Can't reach Aura")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 6) {
                Text("Server address")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                TextField(API.defaultServer, text: $address)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .padding(.top, 8)
            Button {
                Task {
                    retrying = true
                    if address == API.server {
                        await store.retry()
                    } else {
                        await store.changeServer(to: address)
                    }
                    retrying = false
                }
            } label: {
                if retrying { ProgressView().tint(.white) } else { Text("Try again") }
            }
            .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
            .disabled(retrying)
            Spacer()
            if API.server.contains("localhost") || API.server.contains("127.0.0.1") {
                Text("Start the server on your Mac with: npm run dev")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(24)
    }
}
