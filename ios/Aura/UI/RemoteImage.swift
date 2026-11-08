import SwiftUI
import UIKit

/// An image from the Aura server. It shimmers while loading, fades in, stays cached, and shows a
/// soft gradient when the file can't be loaded (some library images are still being drawn).
///
/// It fills whatever frame you give it (cropping, like a photo tile), so always give it a size:
///
///     RemoteImage(path: post.thumbnail)
///         .aspectRatio(4 / 5, contentMode: .fit)        // a 4:5 box as wide as the screen
///     RemoteImage(path: story.media.url, contentMode: .fit)   // show the whole picture
struct RemoteImage: View {
    /// A server path like "/content/images/maya/p1.webp" (or a full URL).
    let path: String?
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?
    @State private var failed = false

    init(path: String?, contentMode: ContentMode = .fill) {
        self.path = path
        self.contentMode = contentMode
        // Already in memory? Show it on the very first frame, no shimmer.
        _image = State(initialValue: API.mediaURL(path).flatMap { ImageLoader.shared.cached($0) })
    }

    var body: some View {
        Color.clear
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .transition(.opacity)
                } else if failed || path == nil {
                    ImagePlaceholder(seed: path ?? "")
                } else {
                    ShimmerView()
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .task(id: path) { await load() }
    }

    private func load() async {
        guard let url = API.mediaURL(path) else {
            image = nil
            failed = true
            return
        }
        if let cached = ImageLoader.shared.cached(url) {
            image = cached
            failed = false
            return
        }
        image = nil
        failed = false
        // Library images may still be generating on the server, so try again a little later before giving up.
        for delay in [0.0, 6, 20] {
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            if Task.isCancelled { return }
            if let loaded = try? await ImageLoader.shared.image(for: url) {
                withAnimation(.easeOut(duration: 0.2)) { image = loaded }
                return
            }
            if Task.isCancelled { return }
            failed = true
        }
    }
}

/// Downloads images once and keeps them: decoded images in memory, the files on disk (URLCache).
actor ImageLoader {
    static let shared = ImageLoader()

    /// NSCache is thread-safe, so `cached(_:)` may read it from any thread without waiting for the actor.
    nonisolated(unsafe) private let memory = NSCache<NSURL, UIImage>()
    private let session: URLSession
    private var inFlight: [URL: Task<UIImage, Error>] = [:]

    init() {
        memory.countLimit = 300
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 512 * 1024 * 1024)
        config.requestCachePolicy = .useProtocolCachePolicy
        session = URLSession(configuration: config)
    }

    /// An image that is already decoded in memory, or nil. Safe to call from any thread (NSCache is thread-safe).
    nonisolated func cached(_ url: URL) -> UIImage? {
        memory.object(forKey: url as NSURL)
    }

    /// Loads an image, sharing one download between everyone who asks for the same URL at once.
    func image(for url: URL) async throws -> UIImage {
        if let image = cached(url) { return image }
        if let running = inFlight[url] { return try await running.value }
        let task = Task { try await download(url) }
        inFlight[url] = task
        defer { inFlight[url] = nil }
        let image = try await task.value
        memory.setObject(image, forKey: url as NSURL)
        return image
    }

    private func download(_ url: URL) async throws -> UIImage {
        let request = URLRequest(url: url)
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else {
            // Don't let a "not found" stick in the disk cache: the image may exist next time.
            session.configuration.urlCache?.removeCachedResponse(for: request)
            throw URLError(.cannotDecodeContentData)
        }
        // Decode now, off the main thread, so scrolling stays smooth.
        return await image.byPreparingForDisplay() ?? image
    }
}

/// The soft gradient shown where an image couldn't load. The colors come from the path, so the same
/// missing image always looks the same.
struct ImagePlaceholder: View {
    var seed: String

    var body: some View {
        let colors = Theme.auraColors
        let index = Self.stableHash(seed) % colors.count
        LinearGradient(colors: [colors[index].opacity(0.45), colors[(index + 1) % colors.count].opacity(0.3)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
            .background(Theme.surface)
            .overlay {
                Image(systemName: "sparkles")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.55))
            }
    }

    /// The same number for the same text on every launch (Swift's hashValue changes each launch).
    private static func stableHash(_ text: String) -> Int {
        var hash: UInt32 = 5381
        for byte in text.utf8 { hash = hash &* 33 &+ UInt32(byte) }
        return Int(hash % 9973)
    }
}

/// A gently moving highlight over the surface color: the "loading" look for images and skeletons.
///
///     ShimmerView().frame(height: 14).clipShape(Capsule())
struct ShimmerView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var moving = false

    var body: some View {
        Theme.surface
            .overlay {
                if !reduceMotion {
                    GeometryReader { geometry in
                        LinearGradient(colors: [.clear, highlight, .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: geometry.size.width * 0.7)
                            .offset(x: moving ? geometry.size.width * 1.2 : -geometry.size.width * 0.9)
                            .animation(.linear(duration: 1.25).repeatForever(autoreverses: false), value: moving)
                    }
                }
            }
            .clipped()
            .onAppear { moving = true }
    }

    private var highlight: Color {
        colorScheme == .dark ? .white.opacity(0.06) : .white.opacity(0.7)
    }
}
