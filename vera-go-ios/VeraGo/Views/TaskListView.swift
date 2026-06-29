import SwiftUI

struct TaskListView: View {
    let tasks: [VeraTask]
    let onToggleComplete: (VeraTask) -> Void
    let onDelete: (VeraTask) -> Void
    let onRefresh: () async -> Void

    @State private var isRefreshing = false

    var body: some View {
        List {
            if tasks.isEmpty {
                ContentUnavailableView(
                    "No Tasks",
                    systemImage: "checklist",
                    description: Text("Tasks from your VERA desktop will appear here")
                )
            }

            ForEach(tasks) { task in
                TaskRowView(task: task, onToggle: { onToggleComplete(task) })
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            onDelete(task)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await onRefresh()
        }
    }
}

struct TaskRowView: View {
    let task: VeraTask
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(task.completed ? .green : .secondary)
                    .font(.title3)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .strikethrough(task.completed)
                    .foregroundColor(task.completed ? .secondary : .primary)
                    .fontWeight(.medium)

                if let date = task.dueDate {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if task.isRecurring, let rule = task.recurrence_rule {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.caption2)
                        Text(rule)
                            .font(.caption2)
                    }
                    .foregroundColor(.accentColor)
                }
            }

            Spacer()

            if let category = task.category {
                CategoryBadge(category: category)
            }
        }
        .padding(.vertical, 4)
    }
}

struct CategoryBadge: View {
    let category: String

    var color: Color {
        switch category {
        case "urgent": return .red
        case "personal": return .purple
        case "system": return .secondary
        default: return .accentColor
        }
    }

    var body: some View {
        Text(category.capitalized)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .clipShape(Capsule())
    }
}
