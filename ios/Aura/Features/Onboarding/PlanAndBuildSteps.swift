import SwiftUI

/// While the AI turns what the person said into a plan to review (POST /api/onboarding/plan).
/// With AI that often takes 20-40 seconds, so the status lines take their time.
struct PlanStep: View {
    @Environment(AppStore.self) private var store
    let draft: OnboardingDraft
    let onPlan: (WorldPlan) -> Void
    let onSetUpMyself: () -> Void

    @State private var phase: BuildingScreen.Phase = .working
    @State private var attempt = 0

    private static let lines = [
        "Listening back to what you said...", "Finding your people...", "Picking your besties...",
        "Naming the group chats...", "Writing what everyone remembers about you...",
        "Adding the finishing touches...", "Almost there...",
    ]

    var body: some View {
        BuildingScreen(phase: phase, title: "Building your world...", lines: Self.lines, lineSeconds: 3.2,
                       avatar: draft.avatar, name: draft.trimmedName, backTitle: "Set it up myself",
                       onRetry: { attempt += 1 }, onBack: onSetUpMyself)
            .task(id: attempt) { await makePlan() }
    }

    private func makePlan() async {
        phase = .working
        let request = WorldPlanRequest(transcript: draft.trimmedTranscript, displayName: store.account?.name)
        do {
            async let plan = API.worldPlan(request)
            try? await Task.sleep(for: .seconds(2.4)) // at least a moment, so the screen never just flickers
            let made = try await plan
            guard !Task.isCancelled else { return }
            Haptics.tap()
            onPlan(made)
        } catch {
            if error.isCancellation { return }
            // Already set up (say, on another device): just go in.
            if (error as? APIError)?.status == 409 {
                await store.retry()
                return
            }
            Haptics.error()
            withAnimation { phase = .failed(error.localizedDescription) }
        }
    }
}

/// Builds the world (POST /api/onboarding), says "You're all set", then opens the app.
struct BuildStep: View {
    @Environment(AppStore.self) private var store
    let draft: OnboardingDraft
    /// The server refused the username (taken): go back to where it can be changed.
    let onUsernameProblem: (String) -> Void
    let onBack: () -> Void

    @State private var phase: BuildingScreen.Phase = .working
    @State private var attempt = 0

    var body: some View {
        BuildingScreen(phase: phase,
                       title: draft.plan == nil ? "Building your world..." : "Bringing your world to life...",
                       lines: lines, lineSeconds: 1.3, avatar: draft.avatar, name: draft.trimmedName,
                       onRetry: { attempt += 1 }, onBack: onBack)
            .task(id: attempt) { await build() }
    }

    /// The plan's own people and chats when there is one.
    private var lines: [String] {
        guard let plan = draft.plan else {
            return ["Inviting your friends...", "Starting your group chats...", "Filling your feed...", "Saving you a seat..."]
        }
        let names = plan.friends.prefix(3).map { friend in
            (friend.account?.displayName ?? friend.id).split(separator: " ").first.map(String.init) ?? friend.id
        }
        return [
            names.isEmpty ? "Inviting your friends..." : "Adding \(names.joined(separator: ", "))...",
            plan.groupChats.first.map { "Opening “\($0.title)”..." } ?? "Warming up the group chats...",
            "Filling your feed...",
            "Telling everyone you joined...",
        ]
    }

    private func build() async {
        phase = .working
        do {
            async let built = API.onboard(draft.request)
            try? await Task.sleep(for: .seconds(3.2)) // "Building your world" should feel like a moment
            let session = try await built
            Haptics.success()
            withAnimation { phase = .done }
            try? await Task.sleep(for: .seconds(1.3))
            await store.finishOnboarding(with: session)
        } catch {
            if error.isCancellation { return }
            if let problem = error as? APIError {
                if problem.status == 409 { // already set up (another device): just go in
                    await store.retry()
                    return
                }
                if problem.status == 400, problem.message.localizedCaseInsensitiveContains("username") {
                    Haptics.error()
                    onUsernameProblem(problem.message)
                    return
                }
            }
            Haptics.error()
            withAnimation { phase = .failed(error.localizedDescription) }
        }
    }
}
