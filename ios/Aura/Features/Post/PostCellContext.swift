import SwiftUI

/// Tells a post cell where it is shown.
///
/// The post page (PostDetailView) lists the comments right under the post, so there the cell leaves
/// out its comment preview and "Go to post", and its comment button focuses the comment box instead
/// of opening the comments sheet.
struct PostCellContext {
    var isDetailPage = false
    /// Runs when the comment button is tapped. nil = open the comments sheet.
    var onComment: (() -> Void)? = nil
}

extension EnvironmentValues {
    @Entry var postCellContext = PostCellContext()
}
