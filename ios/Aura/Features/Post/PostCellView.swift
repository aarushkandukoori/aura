import SwiftUI

/// One post in a list (the home feed, the post page): header, photos or reel, actions, likes,
/// caption, comment preview and time.
///
/// Everything reads the store's copy of the post, so likes and comments that arrive live show up
/// here right away. Pass any copy of the post; only its id really matters.
struct PostCellView: View {
    @Environment(AppStore.self) private var store
    let post: Post

    /// The carousel photo on screen: the photos page through it, the action row shows its dot.
    @State private var page = 0
    /// Goes up each time I save the post from its action row, so the "Saved" bar slides up.
    @State private var savedBarTrigger = 0

    var body: some View {
        let current = store.post(post.id) ?? post
        VStack(alignment: .leading, spacing: 0) {
            PostHeader(post: current)
            PostMediaView(post: current, page: $page, savedBarTrigger: savedBarTrigger)
            PostActionBar(post: current, page: page) { savedBarTrigger += 1 }
            PostFooter(post: current)
        }
        .padding(.bottom, 18)
        .tracksImpression(of: post.id) // how long it was looked at teaches the feed (Core/Tracker.swift)
    }
}
