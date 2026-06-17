import EventKit
import Foundation

let eventStore = EKEventStore()

func fetchEvents() {
    let status = EKEventStore.authorizationStatus(for: .event)
    if status == .authorized {
        let calendars = eventStore.calendars(for: .event)
        
        // Start date: start of today local time
        var calendar = Calendar.current
        calendar.timeZone = TimeZone.current
        let startOfToday = calendar.startOfDay(for: Date())
        
        // End date: 30 days from start of today
        let endOfRange = calendar.date(byAdding: .day, value: 30, to: startOfToday)!
        
        let predicate = eventStore.predicateForEvents(withStart: startOfToday, end: endOfRange, calendars: calendars)
        let events = eventStore.events(matching: predicate)
        
        var output: [[String: Any]] = []
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        for event in events {
            let dict: [String: Any] = [
                "title": event.title ?? "Event",
                "notes": event.notes ?? "",
                "start_time": formatter.string(from: event.startDate),
                "end_time": formatter.string(from: event.endDate),
                "all_day": event.isAllDay
            ]
            output.append(dict)
        }
        
        if let data = try? JSONSerialization.data(withJSONObject: output, options: .prettyPrinted),
           let jsonString = String(data: data, encoding: .utf8) {
            print(jsonString)
        } else {
            print("[]")
        }
    } else {
        print("[]")
    }
}

let status = EKEventStore.authorizationStatus(for: .event)
if status == .notDetermined {
    let semaphore = DispatchSemaphore(value: 0)
    eventStore.requestAccess(to: .event) { granted, error in
        semaphore.signal()
    }
    semaphore.wait()
}

fetchEvents()
