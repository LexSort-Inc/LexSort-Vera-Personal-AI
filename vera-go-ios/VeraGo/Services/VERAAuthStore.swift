import Foundation
import Security

actor VERAAuthStore {
    static let shared = VERAAuthStore()
    private let serviceName = "com.lexsort.vera-go"
    private let accountName = "paired-desktop"

    private init() {}

    func save(_ desktop: PairedDesktop) throws {
        let data = try JSONEncoder().encode(desktop)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: data,
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw AuthError.storeFailed(status)
        }
    }

    func load() -> PairedDesktop? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(PairedDesktop.self, from: data)
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
        ]
        SecItemDelete(query as CFDictionary)
    }

    enum AuthError: Error, LocalizedError {
        case storeFailed(OSStatus)
        var errorDescription: String? {
            switch self {
            case .storeFailed(let s): return "Keychain store failed: \(s)"
            }
        }
    }
}
