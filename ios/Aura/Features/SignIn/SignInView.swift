import AuthenticationServices
import SwiftUI

/// The sign-in screen, shown when the server has sign-in on and nobody is signed in on this iPhone:
/// friendly faces slowly circling the glowing aura ring, a few reactions popping in, and one button,
/// "Continue with Google". Each Google account gets its own world.
///
/// Signing in happens in Apple's secure sign-in sheet (ASWebAuthenticationSession). It opens
/// <server>/auth/google?platform=ios; the server sends it on to Google, and when Google is done the
/// server sends it to aura://auth?token=... The sheet catches that address (the "aura" callback),
/// closes, and hands it to us. The token goes into the Keychain (store.signIn).
struct SignInView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var isSigningIn = false
    @State private var errorMessage: String?
    @State private var faces: [String] = []
    @State private var appeared = false

    var body: some View {
        ZStack {
            OnboardingBackdrop(isWelcome: true)

            // Fills the screen; scrolls only when something (the keyboard) leaves too little room.
            GeometryReader { geometry in
                ScrollView {
                    content
                        .frame(minHeight: geometry.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .animation(Motion.fade, value: errorMessage ?? store.signInMessage)
        .task {
            if faces.isEmpty { faces = (try? await API.avatars()) ?? [] }
        }
        .onAppear {
            withAnimation(.spring(duration: 0.9, bounce: 0.3).delay(0.1)) { appeared = true }
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 8)
            SignInHero(faces: faces, appeared: appeared)

            VStack(spacing: 10) {
                AuraWordmark(size: 54)
                Text("Everyone's happy to see you.")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)
                Text("Sign in to step into your world. Your people are already here.")
                    .font(.body)
                    .foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 14)

            if let message = errorMessage ?? store.signInMessage {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .padding(.horizontal, 24)
                    .padding(.top, 22)
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }

            Spacer(minLength: 28)

            VStack(spacing: 14) {
                GoogleButton(isWorking: isSigningIn) {
                    Task { await signInWithGoogle() }
                }
                #if DEBUG
                DevSignInRow { token in await store.signIn(token: token) }
                #endif
                Text("Each Google account gets its own private world.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
            .opacity(appeared ? 1 : 0)
        }
    }

    // MARK: - Signing in

    private func signInWithGoogle() async {
        errorMessage = nil
        store.signInMessage = nil
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(
                using: try API.googleSignInURL(),
                callback: .customScheme("aura"),
                preferredBrowserSession: nil, // the system's shared session: an account already signed in to Google is one tap
                additionalHeaderFields: [:]
            )
            await finish(with: callback)
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return // closed the sheet: nothing to explain
        } catch {
            errorMessage = "Couldn't open Google sign-in. Check your connection and try again."
        }
    }

    /// Reads aura://auth?token=... (or aura://auth?error=...) and signs in with the token.
    private func finish(with callback: URL) async {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let token = items.first(where: { $0.name == "token" })?.value, !token.isEmpty {
            Haptics.success()
            await store.signIn(token: token)
        } else {
            Haptics.error()
            errorMessage = Self.message(for: items.first { $0.name == "error" }?.value)
        }
    }

    /// What went wrong, by the error code the server sends back (the web's sign-in page says the same).
    static func message(for code: String?) -> String {
        switch code {
        case "cancelled": "Sign-in was cancelled. Try again whenever you're ready."
        case "expired": "That sign-in took too long. Please try again."
        case "google": "Google sign-in didn't work just now. Please try again."
        case "unverified": "That Google account doesn't have a verified email address."
        case "setup": "Google sign-in isn't set up on this server yet."
        default: "Something went wrong signing in. Please try again."
        }
    }
}

/// The glowing aura ring in the middle, friendly faces slowly circling it, and reactions popping in.
private struct SignInHero: View {
    let faces: [String]
    let appeared: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.ringGradient)
                .frame(width: 190, height: 190)
                .blur(radius: 55)
                .opacity(0.35)
            FaceOrbit(paths: faces)
            AuraRingMark(size: 92)
                .scaleEffect(breathing ? 1.05 : 1)
                .scaleEffect(appeared ? 1 : 0.7)
                .opacity(appeared ? 1 : 0)
            pill("❤️ 2,481", x: 96, y: -104, delay: 0.7)
            pill("✨ 38 new followers", x: 88, y: 92, delay: 1.0)
            pill("“obsessed with this” 😭", x: -70, y: 132, delay: 1.3)
        }
        .frame(height: 330)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3.2).repeatForever()) { breathing = true }
        }
        .accessibilityHidden(true)
    }

    /// A reaction bubble that pops in after `delay`, then bobs gently.
    private func pill(_ text: String, x: CGFloat, y: CGFloat, delay: Double) -> some View {
        FloatingPill(text: text, delay: delay)
            .scaleEffect(appeared ? 1 : 0.5)
            .opacity(appeared ? 1 : 0)
            .animation(Motion.pop.orFade(reduceMotion).delay(delay), value: appeared)
            .offset(x: x, y: y)
    }
}

/// Aura's mark: the glowing ring from the app icon.
struct AuraRingMark: View {
    var size: CGFloat = 96

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(Theme.ringGradient, lineWidth: size * 0.15)
                .blur(radius: size * 0.12)
                .opacity(0.8)
            Circle()
                .strokeBorder(Theme.ringGradient, lineWidth: size * 0.13)
        }
        .frame(width: size, height: size)
    }
}

#if DEBUG
/// Debug builds only: sign in as any email without Google, on a server started with AURA_DEV_LOGIN=1.
/// For trying the app on the Simulator before a Google sign-in client exists.
private struct DevSignInRow: View {
    let onToken: (String) async -> Void

    @State private var isOpen = false
    @State private var email = "riley.park@example.com"
    @State private var isWorking = false
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 8) {
            if isOpen {
                HStack(spacing: 8) {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 14)
                        .frame(height: 44)
                        .background(Theme.surface, in: Capsule())
                        .accessibilityIdentifier("devEmail")
                    Button {
                        Task { await signIn() }
                    } label: {
                        if isWorking { ProgressView().tint(.white) } else { Text("Sign in") }
                    }
                    .buttonStyle(.aura(.primary))
                    .disabled(isWorking || !email.contains("@"))
                    .accessibilityIdentifier("devSignIn")
                }
                if let problem {
                    Text(problem)
                        .font(.footnote)
                        .foregroundStyle(Theme.like)
                }
            } else {
                Button("Developer sign-in") { withAnimation(Motion.slide) { isOpen = true } }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func signIn() async {
        isWorking = true
        problem = nil
        defer { isWorking = false }
        do {
            let name = nameFromEmail
            let answer = try await API.devSignIn(email: email.trimmingCharacters(in: .whitespaces),
                                                 name: name.isEmpty ? nil : name)
            await onToken(answer.token)
        } catch {
            if !error.isCancellation { problem = error.localizedDescription }
        }
    }

    /// "riley.park@example.com" -> "Riley Park", so onboarding has a name to start from.
    private var nameFromEmail: String {
        let local = email.split(separator: "@").first.map(String.init) ?? ""
        return local.split { !$0.isLetter }.map { $0.capitalized }.joined(separator: " ")
    }
}
#endif
