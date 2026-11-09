import Foundation

/// Signing in and out. Only matters when the server has sign-in on (`authEnabled`); in local mode
/// there is one world and nobody signs in.
///
/// Signing in gives the app a token (SignInView gets it from Google, or from the test sign-in in
/// debug builds). AuthToken keeps it in the Keychain and API.swift sends it with every request, so
/// each Google account sees its own world.
extension AppStore {
    /// Sign-in finished: keep the token, then open this person's world (onboarding the first time).
    func signIn(token: String) async {
        guard AuthToken.save(token, for: API.server) else {
            signInMessage = "Couldn't save your sign-in on this iPhone. Please try again."
            return
        }
        signInMessage = nil
        clearWorld()
        await start()
    }

    /// Settings > Sign out: the server forgets this sign-in, and the app goes back to the sign-in screen.
    func signOut() async {
        await Tracker.shared.send() // what was looked at belongs to this world
        try? await API.signOut()    // fine if the server can't be reached: the token is forgotten anyway
        leaveWorld(message: nil)
    }

    /// A request answered 401: the sign-in ended somewhere else (signed out on the server, or expired).
    func handleSignedOut() {
        guard phase != .signIn else { return } // several requests can fail at once; act on the first
        leaveWorld(message: "You've been signed out. Sign in to pick up where you left off.")
    }

    /// Forgets the token and everything loaded from this world, then shows the sign-in screen.
    private func leaveWorld(message: String?) {
        AuthToken.delete(for: API.server)
        Tracker.shared.discard()
        live.stop()
        clearWorld()
        me = nil
        account = nil
        badges = Badges()
        signInMessage = message
        phase = .signIn
    }
}
