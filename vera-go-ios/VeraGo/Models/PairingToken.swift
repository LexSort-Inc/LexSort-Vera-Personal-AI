import Foundation

struct PairingToken: Codable {
    let token: String
    let expires: Date

    var isExpired: Bool {
        Date() >= expires
    }
}

struct PairedDesktop: Codable {
    let hostname: String
    let ip: String
    let port: Int
    let token: PairingToken
}
