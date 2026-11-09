import SwiftUI

// Zoom transitions (iOS 18): a grid tile grows into the post it opens and shrinks back into its tile
// when you go back, like Instagram's profile and Explore grids.
//
// The tile is the "source" and the post screen the "destination". They find each other by the same
// id inside one shared namespace, which MainTabView hands to every screen with `.zoomTransitions()`.
//
//     PostTileButton(post: post)                         // grids: a zoom source that remembers taps
//     @State private var zoomID = ZoomSources.zoomID(opening: postId)
//     content.zoomDestination(id: zoomID)                // the post screen

/// The ids that connect a zoom source to its destination.
enum ZoomID {
    /// A post's grid tile and the post (or reel) screen it opens.
    static func post(_ postId: String) -> String { "post-\(postId)" }
}

/// Remembers the grid tile tapped last. A post screen zooms only when its own tile was just tapped:
/// opened any other way ("Go to post", a notification, a link) it slides in like any other screen.
@MainActor
enum ZoomSources {
    private static var lastTap: (postId: String, at: Date)?

    /// A tile calls this right before it opens its post.
    static func tileTapped(_ postId: String) {
        lastTap = (postId, .now)
    }

    /// The zoom id for a screen opening `postId`, or nil when it wasn't opened from its tile.
    /// Read it once when the screen is made (keep it in @State) so going back zooms too.
    static func zoomID(opening postId: String?) -> String? {
        guard let postId, let lastTap, lastTap.postId == postId,
              Date.now.timeIntervalSince(lastTap.at) < 1 else { return nil }
        return ZoomID.post(postId)
    }
}

extension EnvironmentValues {
    /// The namespace zoom sources and destinations share (nil outside MainTabView).
    @Entry var zoomNamespace: Namespace.ID? = nil
}

extension View {
    /// Gives this view and everything it presents one namespace for zoom transitions.
    /// MainTabView calls it once, outside its sheets and covers.
    func zoomTransitions() -> some View {
        modifier(ZoomNamespaceHost())
    }

    /// Marks this view as the place a zoom transition starts from and returns to.
    func zoomSource(id: String) -> some View {
        modifier(ZoomSource(id: id))
    }

    /// Opens this screen by zooming out of the source with the same id (and closes back into it).
    /// nil = a normal push.
    func zoomDestination(id: String?) -> some View {
        modifier(ZoomDestination(id: id))
    }
}

/// Owns the namespace (a modifier can hold @Namespace just like a view can).
private struct ZoomNamespaceHost: ViewModifier {
    @Namespace private var namespace

    func body(content: Content) -> some View {
        content.environment(\.zoomNamespace, namespace)
    }
}

private struct ZoomSource: ViewModifier {
    @Environment(\.zoomNamespace) private var namespace
    let id: String

    func body(content: Content) -> some View {
        if let namespace {
            content.matchedTransitionSource(id: id, in: namespace)
        } else {
            content
        }
    }
}

private struct ZoomDestination: ViewModifier {
    @Environment(\.zoomNamespace) private var namespace
    let id: String?

    func body(content: Content) -> some View {
        if let namespace, let id {
            content.navigationTransition(.zoom(sourceID: id, in: namespace))
        } else {
            content
        }
    }
}
