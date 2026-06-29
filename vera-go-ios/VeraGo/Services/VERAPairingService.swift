import Foundation
import AVFoundation

actor VERAPairingService {
    static let shared = VERAPairingService()

    private init() {}

    func parseQRPayload(_ payload: String) -> PairingToken? {
        guard let data = payload.data(using: .utf8),
              let token = try? JSONDecoder().decode(PairingToken.self, from: data)
        else { return nil }
        return token
    }

    func pairWithDesktop(device: DesktopDevice, token: PairingToken) async throws -> PairedDesktop {
        let desktop = PairedDesktop(
            hostname: device.hostname,
            ip: device.ip,
            port: device.port,
            token: token
        )
        try await VERAAuthStore.shared.save(desktop)
        return desktop
    }

    func unpair() async {
        await VERAAuthStore.shared.clear()
        _ = try? await revokeToken()
    }

    private func revokeToken() async throws -> Bool {
        guard let desktop = await VERAAuthStore.shared.load() else { return false }
        let url = URL(string: "\(desktop.token)/v1/tokens/current")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(desktop.token.token)", forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: request)
        return (response as? HTTPURLResponse)?.statusCode == 200
    }
}
