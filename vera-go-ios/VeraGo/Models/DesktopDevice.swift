import Foundation

struct DesktopDevice: Identifiable, Hashable {
    let id: UUID
    let hostname: String
    let ip: String
    let port: Int
    var isPaired: Bool

    var baseURL: String {
        "http://\(ip):\(port)"
    }

    var wsURL: String {
        "ws://\(ip):\(port)"
    }
}
