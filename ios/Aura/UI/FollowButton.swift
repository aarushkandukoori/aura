import SwiftUI

/// Follow / Follow back / Following for an account. Reads and changes follow state through the
/// store, so every Follow button for the same person agrees. Shows nothing for my own account.
/// "Follow" cross-fades into "Following" (and the accent fill into gray) like Instagram's button.
///
///     FollowButton(account: account)                                   // small, for rows
///     FollowButton(account: profile.account, size: .regular, fullWidth: true)  // on a profile
struct FollowButton: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let account: Account
    var size: AuraButtonStyle.Size = .small
    var fullWidth = false

    var body: some View {
        let current = store.latest(account)
        if !current.isMe {
            Button {
                store.toggleFollow(current)
            } label: {
                Text(title(for: current))
                    .contentTransition(.opacity)
            }
            .buttonStyle(.aura(current.iFollow ? .secondary : .primary, size: size, fullWidth: fullWidth))
            .animation(Motion.snap.orFade(reduceMotion), value: current.iFollow)
        }
    }

    private func title(for account: Account) -> String {
        if account.iFollow { return "Following" }
        return account.followsMe ? "Follow back" : "Follow"
    }
}
