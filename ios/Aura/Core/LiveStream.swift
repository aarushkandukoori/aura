import Foundation

/// Keeps one Server-Sent Events connection open to GET /api/live and hands every event to the app.
///
/// SSE is plain text over one long HTTP response. The Aura server writes each event as a single line
/// `data: {json}` followed by a blank line, plus a `: ping` comment every 20 s so the connection never
/// looks idle. When the connection drops (server restart, Wi-Fi blip) we wait a moment and reconnect.
@MainActor
final class LiveStream {
    /// Called on the main actor for every event.
    var onEvent: @MainActor (LiveEvent) -> Void = { _ in }
    /// Called with true when the stream opens and false when it drops.
    var onConnectionChange: @MainActor (Bool) -> Void = { _ in }

    private(set) var isConnected = false
    private var task: Task<Void, Never>?

    /// A session just for the stream: no cache, and patient enough for a response that never ends.
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.timeoutIntervalForResource = 7 * 24 * 60 * 60
        return URLSession(configuration: config)
    }()

    var isRunning: Bool { task != nil }

    /// Connects (and keeps reconnecting) until stop() is called. Calling it again while running does nothing.
    func start() {
        guard task == nil else { return }
        task = Task { await run() }
    }

    func stop() {
        task?.cancel()
        task = nil
        setConnected(false)
    }

    /// Reconnect right away, e.g. after the server address changed.
    func restart() {
        stop()
        start()
    }

    private func run() async {
        var retryDelay: Double = 1
        while !Task.isCancelled {
            do {
                var request = URLRequest(url: try API.liveURL())
                request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                // The server pings every 20 s, so a minute of silence means the connection is dead.
                request.timeoutInterval = 60
                API.authorize(&request) // the stream belongs to the signed-in person's world
                let (bytes, response) = try await session.bytes(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status == 401 {
                    // Signed out: retrying can't help. The store hears it and shows the sign-in screen.
                    NotificationCenter.default.post(name: API.signedOutNotification, object: nil)
                    break
                }
                guard status == 200 else {
                    throw URLError(.badServerResponse)
                }
                setConnected(true)
                retryDelay = 1

                // Every event arrives as one "data:" line. Other lines (": ping", "retry: 3000") are skipped.
                for try await line in bytes.lines {
                    guard line.hasPrefix("data:") else { continue }
                    let json = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                    if let event = try? JSONDecoder().decode(LiveEvent.self, from: Data(json.utf8)) {
                        onEvent(event)
                    }
                }
            } catch {
                // The connection failed or dropped. Fall through and try again.
            }
            if Task.isCancelled { break } // stop() was called; it already reported the disconnect
            setConnected(false)
            try? await Task.sleep(for: .seconds(retryDelay))
            retryDelay = min(retryDelay * 2, 10) // 1, 2, 4, 8, 10, 10... seconds
        }
    }

    private func setConnected(_ connected: Bool) {
        guard connected != isConnected else { return }
        isConnected = connected
        onConnectionChange(connected)
    }
}
