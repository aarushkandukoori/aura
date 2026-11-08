import Foundation

/// Tests an Aura server address before switching to it, by asking it for GET /api/health.
enum ServerCheck {
    struct Result {
        let ok: Bool
        let message: String
    }

    /// Writes an address the way the app stores it: "localhost:8790" -> "http://localhost:8790".
    static func normalize(_ text: String) -> String {
        var address = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if address.isEmpty { address = API.defaultServer }
        if !address.contains("://") { address = "http://" + address }
        while address.hasSuffix("/") { address.removeLast() }
        return address
    }

    static func run(address: String) async -> Result {
        guard let url = URL(string: address + "/api/health") else {
            return Result(ok: false, message: "That address doesn't look right.")
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let health = try? JSONDecoder().decode(Health.self, from: data), health.ok else {
                return Result(ok: false, message: "Something answered, but it isn't an Aura server.")
            }
            return Result(ok: true, message: "Connected · \(health.castCount) characters · \(health.provider.detail)")
        } catch {
            return Result(ok: false, message: "Couldn't reach \(address).")
        }
    }
}
