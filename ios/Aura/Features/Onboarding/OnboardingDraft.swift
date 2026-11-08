import Observation
import SwiftUI

/// The steps of onboarding, in order.
enum OnboardingStep: Int, CaseIterable {
    case welcome, name, photo, about, origin, tier, building

    /// The steps that count toward the progress bar (not the welcome or building screens).
    static let questions: [OnboardingStep] = [.name, .photo, .about, .origin, .tier]
}

/// Everything the person has answered so far. The steps edit it and the last one sends it.
@Observable
final class OnboardingDraft {
    var displayName = ""
    var username = ""
    /// True once the person typed their own username, so we stop suggesting one from their name.
    var typedOwnUsername = false
    var pronouns = ""
    var avatar: String?
    var isUploadingAvatar = false
    var bio = ""
    var interests: [String] = []
    var origin = ""
    var tier: Tier = .popular

    static let minimumInterests = 3
    static let bioLimit = 150

    /// The answers for "How do you know your friends?" (OnboardingRequest.origin).
    static let origins: [(value: String, emoji: String, title: String, detail: String)] = [
        ("college", "🎓", "College", "Dorm friends, classmates, late-night study crews"),
        ("high school", "🏫", "High school", "The ones who knew you before anyone else"),
        ("work", "💼", "Work", "Coworkers who became your people"),
        ("online", "🌐", "Online", "Group chats, games and fandoms"),
        ("hometown", "🏡", "Hometown", "Neighbors and childhood friends"),
    ]

    static let pronounChoices = ["she/her", "he/him", "they/them"]

    var trimmedName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// While the person hasn't typed their own username, keep one in step with their name.
    func nameChanged() {
        if !typedOwnUsername { username = UsernameRules.suggestion(from: displayName) }
    }

    /// Whether the Continue button works on a step.
    func isComplete(_ step: OnboardingStep) -> Bool {
        switch step {
        case .welcome, .building: true
        case .name: !trimmedName.isEmpty && UsernameRules.problem(with: username) == nil
        case .photo: !isUploadingAvatar
        case .about: interests.count >= Self.minimumInterests
        case .origin: !origin.isEmpty
        case .tier: true
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
            origin: origin.isEmpty ? "college" : origin
        )
    }
}
