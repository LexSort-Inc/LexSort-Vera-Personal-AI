import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onNavigate: (moduleId: string) => void;
  onQuickAsk: (text: string) => void;
}

const LAUNCHPAD = [
  { id: "chat", icon: "💬", name: "VERA Chat", desc: "Private local chat — grounded in your machine's real data" },
  { id: "quick-organizer", icon: "📋", name: "Quick Organizer", desc: "Tasks, schedule, and voice quick-add" },
  { id: "team-lab", icon: "🧬", name: "Team Lab", desc: "Multi-agent coding swarm with git-based tickets" },
  { id: "guardian-watch", icon: "🛡️", name: "Guardian Watch", desc: "Live system health monitor with AI diagnostics" },
  { id: "promailer", icon: "✉️", name: "ProMailer", desc: "Local lead finder and outreach campaigns" },
  { id: "research-lab", icon: "🧪", name: "Research Lab", desc: "Benchmark local models on your hardware" },
];

const QUICK_ASKS = [
  "How's my system health?",
  "How much free storage do I have?",
  "What can I clean up?",
  "What's due this week?",
];

const gb = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;

export default function HomeDashboard({ onNavigate, onQuickAsk }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { setStats(await invoke("get_system_stats")); } catch { /* not fatal */ }
      try { setEvents((await invoke("import_calendar_events", { daysAhead: 14 })) ?? []); } catch { /* not fatal */ }
      try { setTasks((await invoke("get_due_tasks_now")) ?? []); } catch { /* not fatal */ }
      try { setModel((await invoke("get_active_model")) ?? null); } catch { /* not fatal */ }
      try { setVersion((await invoke("get_app_version")) ?? ""); } catch { /* not fatal */ }
      try { setUpdateInfo(await invoke("get_pending_update_info")); } catch { /* not fatal */ }
    })();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const diskPct = stats && stats.total_disk_bytes
    ? Math.round(((stats.total_disk_bytes - stats.available_disk_bytes) / stats.total_disk_bytes) * 100)
    : 0;
  const memPct = stats && stats.total_memory_bytes
    ? Math.round((stats.used_memory_bytes / stats.total_memory_bytes) * 100)
    : 0;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", boxSizing: "border-box" }}>
      {/* Greeting */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: "var(--text)" }}>
          {greeting} 👋
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Your private local AI workspace. All inference and data stay on this device — no cloud, no accounts.
        </p>
      </div>

      {/* Today strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "28px" }}>
        <div className="metric-card" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>📅 UPCOMING</div>
          {events.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No events in the next 14 days.</div>
          ) : (
            events.slice(0, 3).map((e, i) => (
              <div key={i} style={{ fontSize: "12px", color: "var(--text)", padding: "3px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.start_time || "⏱"} — {e.title}
              </div>
            ))
          )}
        </div>

        <div className="metric-card" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>✅ TASKS DUE NOW</div>
          {tasks.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing due. All clear.</div>
          ) : (
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent)", marginBottom: "4px" }}>{tasks.length} due</div>
          )}
          {tasks.slice(0, 2).map((t, i) => (
            <div key={i} style={{ fontSize: "12px", color: "var(--text)", padding: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              • {t.title}
            </div>
          ))}
          {tasks.length > 0 && (
            <button onClick={() => onNavigate("quick-organizer")} style={{ marginTop: "8px", background: "rgba(91,106,245,0.12)", border: "1px solid var(--accent)", borderRadius: "6px", color: "var(--accent)", fontSize: "11px", fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}>
              Open Organizer →
            </button>
          )}
        </div>

        <div className="metric-card" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>💾 STORAGE</div>
          {!stats ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Checking…</div>
          ) : (
            <>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>{gb(stats.available_disk_bytes)} free</div>
              <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", margin: "8px 0 4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${diskPct}%`, background: diskPct > 85 ? "var(--red, #ef4444)" : diskPct > 70 ? "#f59e0b" : "#22c55e", borderRadius: "3px" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{diskPct}% used · RAM {memPct}% · CPU {stats.cpu_usage?.toFixed?.(1) ?? stats.cpu_usage}%</div>
            </>
          )}
          <button onClick={() => onNavigate("guardian-watch")} style={{ marginTop: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "11px", fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}>
            🛡️ System Care
          </button>
        </div>
      </div>

      {/* Quick asks */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>🎯 TRY ASKING VERA ABOUT YOUR MACHINE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {QUICK_ASKS.map((q) => (
            <button
              key={q}
              onClick={() => onQuickAsk(q)}
              style={{ background: "rgba(91,106,245,0.08)", border: "1px solid var(--border)", borderRadius: "20px", color: "var(--text)", fontSize: "12px", fontWeight: 600, padding: "7px 14px", cursor: "pointer", transition: "all 0.2s" }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Launchpad */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>🧩 WORKSPACE MODULES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
          {LAUNCHPAD.map((m) => (
            <div
              key={m.id}
              onClick={() => onNavigate(m.id)}
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", cursor: "pointer", transition: "all 0.2s", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(91,106,245,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            >
              <div style={{ fontSize: "22px", marginBottom: "8px" }}>{m.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>{m.name}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>⚙️ Model: <b style={{ color: "var(--text)" }}>{model ?? "—"}</b></span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>VERA Freeware v{version || "—"}</span>
        {updateInfo && (
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#3b82f6" }}>⬆ Update available</span>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>All inference runs locally 🔒</span>
      </div>
    </div>
  );
}