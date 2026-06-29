import Foundation
import UserNotifications

actor VERANotificationService {
    static let shared = VERANotificationService()

    /// How many days ahead to pre-schedule notifications per recurring task.
    /// Re-scheduled on every sync cycle, so this is a safety buffer.
    private let maxDaysAhead = 14

    private init() {
        requestPermission()
    }

    private func requestPermission() {
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
        }
    }

    /// Replaces all pending notifications with fresh ones for the given tasks.
    /// Called on every successful sync (foreground or background).
    func scheduleNotifications(for tasks: [VeraTask]) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()

        let now = Date()
        let deadline = now.addingTimeInterval(86400 * Double(maxDaysAhead))

        for task in tasks {
            guard let dueDate = task.dueDate, dueDate > now else { continue }
            guard dueDate <= deadline else { continue }
            scheduleSingle(task: task, at: dueDate)

            if task.isRecurring {
                var cursor = dueDate
                let endDate = task.recurrence_end.flatMap { ISO8601DateFormatter().date(from: $0) } ?? deadline
                let limit = min(endDate, deadline)
                while true {
                    guard let next = nextOccurrence(after: cursor, rule: task.recurrence_rule),
                          next > cursor,
                          next <= limit
                    else { break }
                    scheduleSingle(task: task, at: next)
                    cursor = next
                }
            }
        }
    }

    private func scheduleSingle(task: VeraTask, at date: Date) {
        let content = UNMutableNotificationContent()
        content.title = task.title
        content.body = task.isRecurring ? "Recurring task due" : "Task due"
        content.sound = .default
        content.userInfo = ["taskId": task.id]

        let triggerDate = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: triggerDate, repeats: false)

        let identifier = "\(task.id)-\(date.timeIntervalSince1970)"
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    /// Returns the next occurrence date strictly after `after` for the given rule.
    private func nextOccurrence(after date: Date, rule: String?) -> Date? {
        guard let rule = rule else { return nil }
        let calendar = Calendar.current

        if rule == "daily" {
            return calendar.date(byAdding: .day, value: 1, to: date)
        }
        if rule == "weekdays" {
            var next = calendar.date(byAdding: .day, value: 1, to: date) ?? date
            while calendar.isDateInWeekend(next) {
                next = calendar.date(byAdding: .day, value: 1, to: next) ?? next
            }
            return next
        }
        if rule.hasPrefix("weekly:") {
            let dayName = rule.dropFirst(7).lowercased()
            let weekdays = ["sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4, "thursday": 5, "friday": 6, "saturday": 7]
            guard let targetWeekday = weekdays[dayName] else { return nil }
            let currentWeekday = calendar.component(.weekday, from: date)
            var diff = targetWeekday - currentWeekday
            if diff <= 0 { diff += 7 }
            return calendar.date(byAdding: .day, value: diff, to: date)
        }
        if rule.hasPrefix("every:"), let num = Int(rule.dropFirst(6).dropLast()), num > 0 {
            return calendar.date(byAdding: .day, value: num, to: date)
        }

        return nil
    }
}
