import SwiftUI
import UIKit

/// The row above a post: avatar (with a story ring), username, a Follow link for people I don't
/// follow yet, the location, and the ⋯ menu (go to post, copy link, share, unfollow, delete).
struct PostHeader: View {
    @Environment(AppStore.self) private var store
    @Environment(\.postCellContext) private var context
    let post: Post

    @State private var confirmingDelete = false

    var body: some View {
        let author = store.latest(post.author)
        HStack(spacing: 10) {
            AvatarView(account: author, size: 38, showsStoryRing: true, storyZoomID: storyZoomID) {
                openAuthor(author)
            }

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    NavigationLink(value: Route.profile(author.username)) {
                        Text(author.username)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if author.verified { VerifiedBadge(size: 12) }
                    if !author.isMe && !author.iFollow {
                        Text("·").foregroundStyle(Theme.muted)
                        Button { store.follow(author) } label: {
                            Text("Follow")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.accent)
                                .padding(.vertical, 4)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .transition(.opacity)
                    }
                }
                .animation(Motion.snap, value: author.iFollow)
                if let location = post.location, !location.isEmpty {
                    Text(location)
                        .font(.caption)
                        .foregroundStyle(Theme.text.opacity(0.8))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)
            menu(author: author)
        }
        .padding(.leading, 12)
        .padding(.vertical, 8)
        .confirmationDialog("Delete this post?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { deletePost() }
        } message: {
            Text("It will disappear from your profile and everyone's feed.")
        }
    }

    private func menu(author: Account) -> some View {
        Menu {
            if !context.isDetailPage {
                Button { store.navigate(to: .post(post.id)) } label: {
                    Label("Go to post", systemImage: "arrow.up.forward.square")
                }
            }
            Button { copyLink() } label: { Label("Copy link", systemImage: "link") }
            Button { store.showShareSheet(for: post) } label: { Label("Share to…", systemImage: "paperplane") }
            if author.isMe {
                Button(role: .destructive) { confirmingDelete = true } label: {
                    Label("Delete", systemImage: "trash")
                }
            } else if author.iFollow {
                Button(role: .destructive) { unfollow(author) } label: {
                    Label("Unfollow", systemImage: "person.badge.minus")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.text)
                .frame(width: 44, height: 40)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("More options")
    }

    /// Names this avatar's spot for the story zoom (the viewer grows out of it and back into it).
    private var storyZoomID: String { StoryZoom.headerID(post.id) }

    /// A ringed avatar opens their stories (the ring spins while they load); otherwise their profile.
    private func openAuthor(_ author: Account) {
        guard author.hasStory else {
            store.navigate(to: .profile(author.username))
            return
        }
        Task {
            let opened = await StoryZoom.shared.open(author, from: storyZoomID, store: store)
            if !opened { store.navigate(to: .profile(author.username)) }
        }
    }

    /// The web app's address for this post, so it can be opened in a browser.
    private func copyLink() {
        UIPasteboard.general.string = "\(API.server)/p/\(post.id)"
        store.showToast("Link copied")
    }

    private func unfollow(_ author: Account) {
        store.unfollow(author)
        store.showToast("Unfollowed \(author.username)")
    }

    private func deletePost() {
        Task {
            do {
                try await store.deletePost(post.id)
                store.showToast("Post deleted")
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }
}
