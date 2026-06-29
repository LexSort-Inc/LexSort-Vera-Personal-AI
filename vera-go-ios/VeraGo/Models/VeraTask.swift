import Foundation

struct VeraTask: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var notes: String?
    var list: String
    var completed: Bool
    var created_at: String
    var completed_at: String?
    var ai_breakdown: String?
    var start_time: String?
    var end_time: String?
    var category: String?
    var all_day: Bool?
    var recurrence_rule: String?
    var next_due: String?
    var recurrence_end: String?

    var dueDate: Date? {
        guard let s = start_time else { return nil }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    var isRecurring: Bool {
        guard let rule = recurrence_rule, !rule.isEmpty else { return false }
        return true
    }
}
