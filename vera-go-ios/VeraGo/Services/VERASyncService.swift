import Foundation

extension Notification.Name {
    static let veraTokenExpired = Notification.Name("com.lexsort.vera-go.tokenExpired")
}

actor VERASyncService {
    static let shared = VERASyncService()
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {}

    private var baseURL: String? {
        get async {
            guard let desktop = await VERAAuthStore.shared.load() else { return nil }
            return "http://\(desktop.ip):\(desktop.port)"
        }
    }

    private var token: String? {
        get async {
            guard let desktop = await VERAAuthStore.shared.load() else { return nil }
            return desktop.token.token
        }
    }

    func fetchTasks() async throws -> [VeraTask] {
        guard let base = await baseURL, let token = await token else {
            throw SyncError.notPaired
        }
        var request = URLRequest(url: URL(string: "\(base)/v1/tasks")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }
        if http.statusCode == 401 {
            await handleTokenExpired()
            throw SyncError.tokenExpired
        }
        guard http.statusCode == 200 else {
            throw SyncError.httpError(http.statusCode)
        }
        return try decoder.decode([VeraTask].self, from: data)
    }

    func createTask(_ task: VeraTask) async throws -> VeraTask {
        try await mutateTask(task, method: "POST", path: "/v1/tasks")
    }

    func updateTask(_ task: VeraTask) async throws -> VeraTask {
        try await mutateTask(task, method: "PUT", path: "/v1/tasks/\(task.id)")
    }

    func deleteTask(id: String) async throws {
        guard let base = await baseURL, let token = await token else {
            throw SyncError.notPaired
        }
        var request = URLRequest(url: URL(string: "\(base)/v1/tasks/\(id)")!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }
        if http.statusCode == 401 {
            await handleTokenExpired()
            throw SyncError.tokenExpired
        }
        guard http.statusCode == 200 else {
            throw SyncError.httpError(http.statusCode)
        }
    }

    private func mutateTask(_ task: VeraTask, method: String, path: String) async throws -> VeraTask {
        guard let base = await baseURL, let token = await token else {
            throw SyncError.notPaired
        }
        var request = URLRequest(url: URL(string: "\(base)\(path)")!)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(task)
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }
        if http.statusCode == 401 {
            await handleTokenExpired()
            throw SyncError.tokenExpired
        }
        guard http.statusCode == 200 || http.statusCode == 201 else {
            throw SyncError.httpError(http.statusCode)
        }
        return try decoder.decode(VeraTask.self, from: data)
    }

    private func handleTokenExpired() {
        Task { await VERAAuthStore.shared.clear() }
        NotificationCenter.default.post(name: .veraTokenExpired, object: nil)
    }

    enum SyncError: Error, LocalizedError {
        case notPaired
        case tokenExpired
        case invalidResponse
        case httpError(Int)

        var errorDescription: String? {
            switch self {
            case .notPaired: return "No paired desktop found"
            case .tokenExpired: return "Token expired — please re-pair"
            case .invalidResponse: return "Invalid response from desktop"
            case .httpError(let c): return "HTTP \(c)"
            }
        }
    }
}
