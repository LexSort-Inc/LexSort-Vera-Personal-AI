import Foundation
import Network

final class VERADiscoveryService {
    private var browser: NWBrowser?
    var onUpdate: (([DesktopDevice]) -> Void)?
    var onError: ((Error) -> Void)?

    private let serviceType = "_vera._tcp"
    private let domain = "local."

    func startScanning() {
        let params = NWParameters()
        params.includePeerToPeer = true

        let browser = NWBrowser(for: .bonjour(type: serviceType, domain: domain), using: params)
        browser.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed(let error):
                self?.onError?(error)
            default:
                break
            }
        }
        browser.browseResultsChangedHandler = { [weak self] results, changes in
            let devices = results.compactMap { result -> DesktopDevice? in
                guard case .bonjour = result.metadata else { return nil }
                let hostname: String
                let ip: String
                let port: Int

                switch result.endpoint {
                case .service(let name, let type, let domain, let interface):
                    hostname = name
                    ip = "\(name).\(type).\(domain)"
                    port = 8888
                case .hostPort(let host, let p):
                    hostname = "\(host)"
                    ip = "\(host)"
                    port = Int(p.rawValue)
                @unknown default:
                    return nil
                }

                return DesktopDevice(
                    id: UUID(),
                    hostname: hostname,
                    ip: ip,
                    port: port,
                    isPaired: false
                )
            }
            self?.onUpdate?(devices)
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    func stopScanning() {
        browser?.cancel()
        browser = nil
    }
}
