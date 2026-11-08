import SwiftUI

/// One post in a list (the home feed, the post page): header, photos or reel, actions, likes,
/// caption, comment preview and time.
///
/// Everything reads the store's copy of the post, so likes and comments that arrive live show up
/// here right away. Pass any copy of the post; only its id really matters.
struct PostCellView: View {
    @Environment(AppStore.self) private var store
    let post: Post

    var body: some View {
        let current = store.post(post.id) ?? post
        VStack(alignment: .leading, spacing: 0) {
            PostHeader(post: current)
            PostMediaView(post: current)
            PostActionBar(post: current)
            PostFooter(post: current)
        }
        .padding(.bottom, 18)
    }
}
