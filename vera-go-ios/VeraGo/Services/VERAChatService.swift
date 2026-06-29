import Foundation
import Speech

actor VERAChatService {
    static let shared = VERAChatService()

    private var webSocket: URLSessionWebSocketTask?
    private let session = URLSession.shared
    private var isConnected = false

    private init() {}

    func connect(ip: String, port: Int, token: String) async throws {
        disconnect()
        guard let url = URL(string: "ws://\(ip):\(port)/v1/chat/stream") else {
            throw ChatError.invalidURL
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: request)
        ws.resume()
        self.webSocket = ws
        self.isConnected = true
    }

    func disconnect() {
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        isConnected = false
    }

    func sendMessage(_ text: String) async throws {
        guard let ws = webSocket, isConnected else {
            throw ChatError.notConnected
        }
        let payload = try JSONEncoder().encode(["text": text])
        let message = URLSessionWebSocketTask.Message.data(payload)
        try await ws.send(message)
    }

    func receiveMessages() -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                while let ws = self.webSocket, self.isConnected {
                    do {
                        let message = try await ws.receive()
                        switch message {
                        case .string(let text):
                            continuation.yield(text)
                        case .data(let data):
                            if let text = String(data: data, encoding: .utf8) {
                                continuation.yield(text)
                            }
                        @unknown default:
                            break
                        }
                    } catch {
                        continuation.finish()
                        break
                    }
                }
                continuation.finish()
            }
        }
    }

    enum ChatError: Error, LocalizedError {
        case invalidURL
        case notConnected

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid WebSocket URL"
            case .notConnected: return "Not connected to desktop"
            }
        }
    }
}
