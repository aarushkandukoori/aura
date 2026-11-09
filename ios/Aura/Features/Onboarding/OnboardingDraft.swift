import Observation
import SwiftUI

/// The steps of onboarding, in order (going to a later one slides in from the right).
///
/// Two paths lead to the world being built:
/// - describe: tell us about your world -> the plan is made (planning) -> review it -> building
/// - by hand ("Set it up myself"): name -> photo -> about -> origin -> tier -> building
enum OnboardingStep: Int, CaseIterable {
    case welcome, describe, planning, review, name, photo, about, origin, tier, building

    /// The hand-made path's questions, shown on the progress bar.
    static let questions: [OnboardingStep] = [.name, .photo, .about, .origin, .tier]
}

/// Everything the person has answered so far. The steps edit it and the last one sends it.
@Observable
final class OnboardingDraft {
    var displayName = ""
    var username = "" {
        didSet { if username != oldValue { usernameProblem = nil } }
    }
    /// True once the person typed their own username, so we stop suggesting one from their name.
    var typedOwnUsername = false
    /// What the server said about the username (it was taken); cleared when the username changes.
    var usernameProblem: String?
    /// Sent back to the name step to fix the username on the hand-made path: Continue then jumps
    /// straight back to the last question instead of asking everything again.
    var fixingUsername = false
    var pronouns = ""
    var avatar: String?
    var isUploadingAvatar = false
    var bio = ""
    var interests: [String] = []
    var origin = ""
    var tier: Tier = .popular
    /// What they said or typed about their world.
    var transcript = ""
    /// The plan made from it (nil on the hand-made path).
    var plan: WorldPlan?

    static let minimumInterests = 3
    static let bioLimit = 150
    /// A few words at least, so there's something to build a world from.
    static let minimumTranscript = 12
    /// The server reads the first 3,000 characters.
    static let transcriptLimit = 3000

    /// The answers for "How do you know your friends?" (OnboardingRequest.origin).
    static let origins: [(value: String, emoji: String, title: String, detail: String)] = [
        ("college", "🎓", "College", "Dorm friends, classmates, late-night study crews"),
        ("high school", "🏫", "High school", "The ones who knew you before anyone else"),
        ("work", "💼", "Work", "Coworkers who became your people"),
        ("online", "🌐", "Online", "Group chats, games and fandoms"),
        ("hometown", "🏡", "Hometown", "Neighbors and childhood friends"),
    ]

    static let pronounChoices = ["she/her", "he/him", "they/them"]

    /// Signed in with Google: start from the account's name and photo.
    init(account: SignedInAccount? = nil) {
        displayName = String((account?.name ?? "").prefix(40))
        username = UsernameRules.suggestion(from: displayName)
        avatar = account?.picture
    }

    var trimmedName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedTranscript: String {
        transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// While the person hasn't typed their own username, keep one in step with their name.
    func nameChanged() {
        if !typedOwnUsername { username = UsernameRules.suggestion(from: displayName) }
    }

    /// The plan arrived: its suggestions fill the review screen (a photo already picked is kept).
    func use(_ plan: WorldPlan) {
        self.plan = plan
        if !plan.displayName.isEmpty { displayName = String(plan.displayName.prefix(40)) }
        username = plan.username.isEmpty ? UsernameRules.suggestion(from: displayName) : UsernameRules.clean(plan.username)
        typedOwnUsername = false
        bio = String(plan.bio.prefix(Self.bioLimit))
        pronouns = plan.pronouns
        interests = Array(plan.interests.prefix(InterestPicker.maximum))
        origin = plan.origin
        tier = plan.tier
    }

    /// Whether the Continue button works on a step.
    func isComplete(_ step: OnboardingStep) -> Bool {
        switch step {
        case .welcome, .planning, .building, .tier: true
        case .describe: trimmedTranscript.count >= Self.minimumTranscript
        case .name: !trimmedName.isEmpty && UsernameRules.problem(with: username) == nil && usernameProblem == nil
        case .photo: !isUploadingAvatar
        case .about: interests.count >= Self.minimumInterests
        case .origin: !origin.isEmpty
        case .review: isComplete(.name) && isComplete(.about) && !isUploadingAvatar
        }
    }

    /// The finished answers, ready for POST /api/onboarding.
    var request: OnboardingRequest {
        OnboardingRequest(
            displayName: trimmedName,
            username: username,
            avatar: avatar,
            bio: bio.trimmingCharacters(in: .whitespacesAndNewlines),
            pronouns: pronouns.trimmingCharacters(in: .whitespacesAndNewlines),
            interests: interests,
            tier: tier,
            origin: origin.isEmpty ? "college" : origin,
            plan: plan
        )
    }
}
