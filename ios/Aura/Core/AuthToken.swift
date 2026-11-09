import Foundation
import Security

/// Keeps the sign-in token in the iPhone's Keychain (encrypted, and kept out of backups' plain files).
///
/// The server hands the app a token when you sign in. API.swift sends it as
/// "Authorization: Bearer <token>" with every request. There is one token per server address, so
/// switching servers in Settings and back keeps each sign-in.
///
///     AuthToken.save(token, for: API.server)
///     AuthToken.current            // the token for the server in use, or nil
///     AuthToken.delete(for: API.server)
enum AuthToken {
    /// The Keychain "service" Aura's tokens are filed under.
    private static let service = "com.aarushkandukoori.aura.session"

    /// The token for the server the app is using right now.
    static var current: String? { token(for: API.server) }

    static func token(for server: String) -> String? {
        var query = baseQuery(for: server)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Saves (or replaces) the token for a server. Returns false if the Keychain refused it.
    @discardableResult
    static func save(_ token: String, for server: String) -> Bool {
        delete(for: server)
        var item = baseQuery(for: server)
        item[kSecValueData as String] = Data(token.utf8)
        // Readable after the first unlock, so a request finishing in the background still works.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func delete(for server: String) {
        SecItemDelete(baseQuery(for: server) as CFDictionary)
    }

    /// Which Keychain item: a generic password filed under Aura's service, named by the server address.
    private static func baseQuery(for server: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server,
        ]
    }
}
