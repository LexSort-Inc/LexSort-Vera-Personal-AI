import SwiftUI
import BackgroundTasks

@main
struct VeraGoApp: App {
    @State private var pairedDesktop: PairedDesktop?
    @State private var isPaired: Bool = false

    private let syncTaskID = "com.lexsort.vera-go.sync"

    init() {
        registerBackgroundTasks()
    }

    var body: some Scene {
        WindowGroup {
            if isPaired, let desktop = pairedDesktop {
                MainTabView(desktop: desktop, onUnpair: handleUnpair)
            } else {
                OnboardingFlow { paired in
                    self.pairedDesktop = paired
                    self.isPaired = true
                }
            }
        }
        .onChange(of: isPaired) { _, newValue in
            if newValue {
                scheduleBackgroundSync()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .veraTokenExpired)) { _ in
            handleTokenExpired()
        }
    }

    private func handleUnpair() {
        Task {
            await VERAPairingService.shared.unpair()
            pairedDesktop = nil
            isPaired = false
        }
    }

    private func handleTokenExpired() {
        pairedDesktop = nil
        isPaired = false
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: syncTaskID)
    }

    // MARK: — Background Tasks

    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: syncTaskID, using: nil) { task in
            handleBackgroundSync(task: task as! BGAppRefreshTask)
        }
    }

    private func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: syncTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func handleBackgroundSync(task: BGAppRefreshTask) {
        scheduleBackgroundSync()

        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task {
            do {
                let tasks = try await VERASyncService.shared.fetchTasks()
                await VERANotificationService.shared.scheduleNotifications(for: tasks)
                task.setTaskCompleted(success: true)
            } catch {
                task.setTaskCompleted(success: false)
            }
        }
    }
}

// MARK: — Onboarding Flow

struct OnboardingFlow: View {
    let onComplete: (PairedDesktop) -> Void
    @State private var selectedDevice: DesktopDevice?
    @State private var showPairing = false

    var body: some View {
        if showPairing, let device = selectedDevice {
            PairingView(
                device: device,
                onPaired: { paired in
                    onComplete(paired)
                },
                onCancel: {
                    showPairing = false
                    selectedDevice = nil
                }
            )
        } else {
            DiscoveryView { device in
                selectedDevice = device
                showPairing = true
            }
        }
    }
}

// MARK: — Main Tab View

struct MainTabView: View {
    let desktop: PairedDesktop
    let onUnpair: () -> Void

    @State private var tasks: [VeraTask] = []
    @State private var selectedTab = 0
    @State private var isOffline = false
    @State private var cancellables = Set<AnyHashable>()

    var body: some View {
        TabView(selection: $selectedTab) {
            TaskListView(
                tasks: tasks,
                onToggleComplete: handleToggleComplete,
                onDelete: handleDelete,
                onRefresh: refreshTasks
            )
            .tabItem {
                Label("Tasks", systemImage: "checklist")
            }
            .tag(0)

            CalendarView(tasks: tasks)
                .tabItem {
                    Label("Calendar", systemImage: "calendar")
                }
                .tag(1)

            ChatView(
                ip: desktop.ip,
                port: desktop.port,
                token: desktop.token.token
            )
            .tabItem {
                Label("Chat", systemImage: "message")
            }
            .tag(2)

            SettingsView(desktop: desktop, onUnpair: onUnpair)
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
        .overlay(alignment: .top) {
            if isOffline {
                Text("VERA Offline")
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color.orange)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                    .padding(.top, 4)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .veraTokenExpired)) { _ in
            isOffline = false
        }
        .task {
            await refreshTasks()
            Timer.publish(every: 30, on: .main, in: .common)
                .autoconnect()
                .sink { _ in
                    Task { await refreshTasks() }
                }
                .store(in: &cancellables)
        }
    }

    private func refreshTasks() async {
        do {
            tasks = try await VERASyncService.shared.fetchTasks()
            isOffline = false
            await VERANotificationService.shared.scheduleNotifications(for: tasks)
        } catch let error as VERASyncService.SyncError {
            switch error {
            case .tokenExpired:
                isOffline = false
            case .notPaired, .invalidResponse, .httpError:
                isOffline = true
            }
        } catch {
            isOffline = true
        }
    }

    private func handleToggleComplete(_ task: VeraTask) {
        Task {
            var updated = task
            updated.completed.toggle()
            updated.completed_at = updated.completed ? ISO8601DateFormatter().string(from: Date()) : nil
            _ = try? await VERASyncService.shared.updateTask(updated)
            await refreshTasks()
        }
    }

    private func handleDelete(_ task: VeraTask) {
        Task {
            _ = try? await VERASyncService.shared.deleteTask(id: task.id)
            await refreshTasks()
        }
    }
}
