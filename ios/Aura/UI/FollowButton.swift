import SwiftUI

/// Follow / Follow back / Following for an account. Reads and changes follow state through the
/// store, so every Follow button for the same person agrees. Shows nothing for my own account.
///
///     FollowButton(account: account)                                   // small, for rows
///     FollowButton(account: profile.account, size: .regular, fullWidth: true)  // on a profile
struct FollowButton: View {
    @Environment(AppStore.self) private var store
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
                    .contentTransition(.identity)
            }
            .buttonStyle(.aura(current.iFollow ? .secondary : .primary, size: size, fullWidth: fullWidth))
            .animation(.snappy, value: current.iFollow)
        }
    }

    private func title(for account: Account) -> String {
        if account.iFollow { return "Following" }
        return account.followsMe ? "Follow back" : "Follow"
    }
}
