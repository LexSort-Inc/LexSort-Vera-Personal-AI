import SwiftUI

struct CalendarView: View {
    let tasks: [VeraTask]
    @State private var selectedDate = Date()
    @State private var currentMonth = Date()

    private let calendar = Calendar.current
    private let daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    var body: some View {
        VStack(spacing: 0) {
            monthHeader
            dayOfWeekHeader
            monthGrid
            selectedDateTasks
        }
    }

    private var monthHeader: some View {
        HStack {
            Button { moveMonth(-1) } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(currentMonth.formatted(.dateTime.month().year()))
                .font(.title3).bold()
            Spacer()
            Button { moveMonth(1) } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var dayOfWeekHeader: some View {
        HStack {
            ForEach(daysOfWeek, id: \.self) { day in
                Text(day)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
    }

    private var monthGrid: some View {
        let days = generateDays()
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 4) {
            ForEach(days, id: \.self) { date in
                if let date = date {
                    DayCell(
                        date: date,
                        isSelected: calendar.isDate(date, inSameDayAs: selectedDate),
                        hasTasks: tasks.contains { task in
                            guard let due = task.dueDate else { return false }
                            return calendar.isDate(due, inSameDayAs: date)
                        }
                    )
                    .onTapGesture { selectedDate = date }
                } else {
                    Color.clear
                }
            }
        }
        .padding(4)
    }

    private var selectedDateTasks: some View {
        let dayTasks = tasks.filter { task in
            guard let due = task.dueDate else { return false }
            return calendar.isDate(due, inSameDayAs: selectedDate)
        }
        return Group {
            if !dayTasks.isEmpty {
                List {
                    Section(header: Text(selectedDate.formatted(date: .abbreviated, time: .omitted))) {
                        ForEach(dayTasks) { task in
                            TaskRowView(task: task, onToggle: {})
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                ContentUnavailableView(
                    "No Tasks",
                    systemImage: "checkmark.circle",
                    description: Text("No tasks due on this day")
                )
            }
        }
    }

    private func moveMonth(_ offset: Int) {
        currentMonth = calendar.date(byAdding: .month, value: offset, to: currentMonth)!
    }

    private func generateDays() -> [Date?] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: currentMonth),
              let monthFirstWeek = calendar.dateInterval(of: .weekOfMonth, for: monthInterval.start),
              let monthLastWeek = calendar.dateInterval(of: .weekOfMonth, for: monthInterval.end.addingTimeInterval(-1))
        else { return [] }

        let start = monthFirstWeek.start
        let end = monthLastWeek.end
        var days: [Date?] = []
        var current = start
        while current < end {
            if calendar.isDate(current, equalTo: currentMonth, toGranularity: .month) {
                days.append(current)
            } else {
                days.append(nil)
            }
            current = calendar.date(byAdding: .day, value: 1, to: current)!
        }
        return days
    }
}

struct DayCell: View {
    let date: Date
    let isSelected: Bool
    let hasTasks: Bool

    private let calendar = Calendar.current

    var body: some View {
        VStack(spacing: 2) {
            Text("\(calendar.component(.day, from: date))")
                .font(.callout)
                .foregroundColor(isSelected ? .white : .primary)
                .frame(width: 32, height: 32)
                .background(isSelected ? Color.accentColor : Color.clear)
                .clipShape(Circle())

            if hasTasks {
                Circle()
                    .fill(isSelected ? .white : .accentColor)
                    .frame(width: 5, height: 5)
            } else {
                Color.clear.frame(width: 5, height: 5)
            }
        }
        .padding(2)
    }
}
